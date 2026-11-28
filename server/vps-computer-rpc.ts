// A bot's own VPS computer, served by the server itself at POST /api/internal/computer/mcp when the bot box is on (a
// Cloud home): the boxed engine has no route out and cannot read the server's SSH keys, so instead of starting the
// stdio bridge (vps-container-mcp) inside the box, the server starts it here, outside, and relays each tools/list and
// tools/call the engine sends through the harness gate with its turn capability. One bridge per VPS container, kept
// while it answers; the person's control gate is checked by the caller before every call, as for the Boat.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { AGENTS_NODE_FLAG, SPAWNED_PROXIES } from "./proxy-paths.ts";

export interface VpsTarget {
  alias: string;
  container: string;
}

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };

/** Idle bridges close after this long, so a container no turn uses holds no SSH session. */
export const VPS_RPC_IDLE_MS = 10 * 60_000;
const START_BUDGET_MS = 60_000;

export class VpsMcpSession {
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #pending = new Map<number, Pending>();
  #nextId = 1;
  #closed = false;
  readonly ready: Promise<void>;
  lastUsed = Date.now();

  constructor(target: VpsTarget, spawnBridge: (target: VpsTarget) => ChildProcessWithoutNullStreams = defaultSpawn) {
    this.#child = spawnBridge(target);
    const decoder = new StringDecoder("utf8");
    let buffer = "";
    this.#child.stdout.on("data", (chunk: Buffer) => {
      buffer += decoder.write(chunk);
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) this.#receive(line);
      }
    });
    this.#child.stderr.on("data", () => undefined);
    this.#child.on("close", () => this.#fail(new Error("The VPS computer connection closed.")));
    this.#child.on("error", (error) => this.#fail(error));
    this.ready = this.#request("initialize", {
      protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "openmausbot-vps-relay", version: "1" },
    }, START_BUDGET_MS).then(() => { this.#notify("notifications/initialized"); });
  }

  get closed() {
    return this.#closed;
  }

  #receive(line: string) {
    let message: { id?: unknown; result?: unknown; error?: { message?: unknown } };
    try { message = JSON.parse(line); } catch { return; }
    if (typeof message.id !== "number") return;
    const waiting = this.#pending.get(message.id);
    if (!waiting) return;
    this.#pending.delete(message.id);
    clearTimeout(waiting.timer);
    if (message.error) waiting.reject(new Error(typeof message.error.message === "string" ? message.error.message.slice(0, 2_000) : "The VPS computer refused the call."));
    else waiting.resolve(message.result);
  }

  #notify(method: string) {
    if (!this.#closed) this.#child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
  }

  #request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    if (this.#closed) return Promise.reject(new Error("The VPS computer connection closed."));
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(Object.assign(new Error("The VPS computer did not answer in time."), { name: "TimeoutError" }));
      }, timeoutMs);
      timer.unref?.();
      this.#pending.set(id, { resolve, reject, timer });
      this.#child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  async call(method: "tools/list" | "tools/call", params: unknown, timeoutMs: number): Promise<unknown> {
    this.lastUsed = Date.now();
    await this.ready;
    return this.#request(method, params, timeoutMs);
  }

  #fail(error: Error) {
    if (this.#closed) return;
    this.#closed = true;
    for (const waiting of this.#pending.values()) {
      clearTimeout(waiting.timer);
      waiting.reject(error);
    }
    this.#pending.clear();
  }

  close() {
    this.#fail(new Error("The VPS computer connection was closed."));
    this.#child.kill("SIGTERM");
  }
}

function defaultSpawn(target: VpsTarget): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, [SPAWNED_PROXIES.vpsContainerMcp, target.alias, target.container], {
    env: { ...process.env, ...AGENTS_NODE_FLAG },
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/** The server's bridges, by container. A dead one is replaced on the next call. */
export class VpsMcpSessions {
  readonly #sessions = new Map<string, VpsMcpSession>();
  readonly #spawn?: (target: VpsTarget) => ChildProcessWithoutNullStreams;
  readonly #sweep: NodeJS.Timeout;

  constructor(spawnBridge?: (target: VpsTarget) => ChildProcessWithoutNullStreams) {
    this.#spawn = spawnBridge;
    this.#sweep = setInterval(() => this.sweep(), 60_000);
    this.#sweep.unref?.();
  }

  session(target: VpsTarget): VpsMcpSession {
    const key = `${target.alias}\u0000${target.container}`;
    let session = this.#sessions.get(key);
    if (!session || session.closed) {
      session = new VpsMcpSession(target, this.#spawn);
      this.#sessions.set(key, session);
    }
    return session;
  }

  sweep(now = Date.now()) {
    for (const [key, session] of this.#sessions) {
      if (session.closed || now - session.lastUsed > VPS_RPC_IDLE_MS) {
        session.close();
        this.#sessions.delete(key);
      }
    }
  }

  closeAll() {
    clearInterval(this.#sweep);
    for (const session of this.#sessions.values()) session.close();
    this.#sessions.clear();
  }
}

export type VpsComputerResult = { content: Array<{ type: "text"; text: string }>; isError: true } | Record<string, unknown>;

/** Same order as the Boat's cloudComputerRpc: listing touches nothing; a call passes the person's control gate first. */
export async function vpsComputerRpc(
  request: { method?: unknown; params?: unknown } | null | undefined,
  deps: {
    sessions: VpsMcpSessions;
    target: VpsTarget;
    gate(): Promise<{ held: boolean; reason?: unknown; blockedReason?: string }>;
    refusal(control: { held: boolean; reason?: unknown; blockedReason?: string }): string;
    assertActive(): void;
    budgetMs: number;
  },
): Promise<unknown> {
  if (request?.method === "tools/list") {
    deps.assertActive();
    return deps.sessions.session(deps.target).call("tools/list", request.params ?? {}, deps.budgetMs);
  }
  if (request?.method !== "tools/call") throw Object.assign(new Error("unsupported computer method"), { status: 400 });
  const control = await deps.gate();
  if (control.held) return { isError: true, content: [{ type: "text", text: deps.refusal(control) }] };
  deps.assertActive();
  try {
    const result = await deps.sessions.session(deps.target).call("tools/call", request.params ?? {}, deps.budgetMs);
    deps.assertActive();
    return result;
  } catch (error) {
    const late = (error as Error).name === "TimeoutError";
    return { isError: true, content: [{ type: "text", text: late
      ? "The VPS computer did not answer in time. This call may still have run; take a fresh screenshot before repeating it."
      : `${(error as Error).message} Take a fresh screenshot before repeating the action.` }] };
  }
}
