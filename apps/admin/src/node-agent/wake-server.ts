// The agent's waking page. Traefik on the node sends here, through a catch-all router of the lowest priority, every
// request for <slug>.<base domain> that no running instance answers: while an instance sleeps its container is stopped,
// so its own router is gone. For a sleeping instance this page asks the Admin to wake it, polls the Admin at once (the
// agent then starts the container) and shows "Seu ArkoBot está acordando…", reloading by itself until the instance
// answers. Any other address gets a plain 404. It knows only what the last desired state said; no secret goes here.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { WAKE_POKE_HEADER, type DesiredInstance, type DesiredState, type WakeAnswer } from "../provisioning/protocol.ts";
import type { Log } from "./reconcile.ts";

/** A sleeping instance asks the Admin again at most this often, however many visits come. */
export const WAKE_ASK_MS = 10_000;
/** The page reloads itself this often. */
export const RELOAD_SECONDS = 3;

export interface WakeServerDeps {
  /** The last desired state the agent pulled; null before the first. */
  desired(): DesiredState | null;
  /** Asks the Admin to wake this instance (POST /api/agent/v1/wake). */
  wake(instanceId: string): Promise<WakeAnswer>;
  /** Polls the Admin now instead of at the next interval. */
  nudge(): void;
  log: Log;
  now?: () => number;
}

const PAGE_STYLE = `body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#050817;color:#e2e8f0;
font-family:Inter,"Segoe UI",Roboto,Arial,sans-serif;text-align:center}main{max-width:420px;padding:32px 20px}
.logo{font-size:28px;font-weight:800;letter-spacing:-.5px;margin-bottom:28px}.logo b{color:#00e8f8}h1{font-size:22px;margin:0 0 12px;color:#fff}
p{margin:0 0 10px;line-height:1.5;color:#94a3b8;font-size:15px}.dot{display:inline-block;width:10px;height:10px;margin:0 3px;border-radius:50%;
background:#00e8f8;animation:p 1.2s infinite ease-in-out}.dot:nth-child(2){animation-delay:.2s}.dot:nth-child(3){animation-delay:.4s}
@keyframes p{0%,80%,100%{opacity:.2}40%{opacity:1}}`;

function page(title: string, lines: string[], reload: boolean): string {
  const refresh = reload
    ? `<meta http-equiv="refresh" content="${RELOAD_SECONDS}"><script>setTimeout(function(){location.reload()},${RELOAD_SECONDS * 1000})</script>` : "";
  const dots = reload ? `<div aria-hidden="true" style="margin-bottom:22px"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>` : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${title}</title>${refresh}<style>${PAGE_STYLE}</style></head>
<body><main><div class="logo">arko<b>bot</b></div>${dots}<h1>${title}</h1>${lines.map((line) => `<p>${line}</p>`).join("")}</main></body></html>`;
}

export const WAKING_PAGE = page("Seu ArkoBot está acordando…", [
  "Ele dorme quando fica um tempo sem uso, para economizar. Em alguns segundos ele está de volta.",
  "Esta página atualiza sozinha.",
], true);
export const PAUSED_PAGE = page("Este ArkoBot está pausado", [
  "Os dados continuam guardados. Quem cuida da conta pode ver o motivo na Área do cliente do ArkoBot.",
], false);
export const NOT_FOUND_PAGE = page("Endereço não encontrado", ["Não há nenhum ArkoBot neste endereço."], false);

/** The host a request is for, lower case, without the port. */
export function hostOf(req: Pick<IncomingMessage, "headers">): string {
  // Traefik passes the client's Host on unchanged.
  return (req.headers.host ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

export type WakeVerdict = "waking" | "asleep" | "starting" | "paused" | "unknown" | "not_ready";

/**
 * Requests that never wake a sleeping instance (server/cloud-power.ts, "Sleeping homes"): an open page's event stream,
 * the desktop's version check, Files sync and lending loops, the public probe and the Admin's own signed calls. They get
 * 503 `{"error":"asleep"}` with `x-omb-cloud-power: asleep`, as the instance itself answers just before it sleeps, so
 * the desktop pauses instead of waking it every minute. The Admin's wake nudge always counts.
 */
const QUIET = [/^\/api\/events$/, /^\/api\/health$/, /^\/api\/sync(\/|$)/, /^\/api\/shared-computers(\/|$)/, /^\/api\/cloud\//, /^\/\.well-known\/openmausbot\//];

export function wakesOnVisit(req: Pick<IncomingMessage, "headers" | "url">): boolean {
  if (req.headers[WAKE_POKE_HEADER] === "1") return true;
  if (req.headers["x-omb-background"] === "1" || req.headers["x-omb-cloud-signature"]) return false;
  const path = (req.url ?? "/").split("?")[0]!;
  return !QUIET.some((pattern) => pattern.test(path));
}

/** What to show for an instance (or none) by the last desired state. */
export function verdictFor(instance: DesiredInstance | undefined, desiredLoaded: boolean): WakeVerdict {
  if (!desiredLoaded) return "not_ready";
  if (!instance || instance.desired === "absent") return "unknown";
  if (instance.desired === "running") return "starting";
  return instance.sleeping ? "waking" : "paused";
}

export function createWakeHandler(deps: WakeServerDeps) {
  const now = deps.now ?? Date.now;
  const asked = new Map<string, number>();

  const askToWake = async (instance: DesiredInstance) => {
    const last = asked.get(instance.id) ?? 0;
    if (now() - last < WAKE_ASK_MS) return;
    asked.set(instance.id, now());
    try {
      const answer = await deps.wake(instance.id);
      if (answer.state === "waking") deps.log(`${instance.slug}: acordando (visita ao endereço)`);
    } catch (error) {
      // The Admin is out of reach: the page keeps reloading and the next visit asks again.
      asked.delete(instance.id);
      deps.log(`${instance.slug}: não consegui pedir ao Admin para acordar (${(error as Error).message})`);
      return;
    }
    // Woken here or already by the Admin: either way the desired state changed, so poll now.
    deps.nudge();
  };

  return async (req: IncomingMessage, res: ServerResponse): Promise<WakeVerdict> => {
    const state = deps.desired();
    const host = hostOf(req);
    const instance = state?.instances.find((candidate) => candidate.host === host);
    let verdict = verdictFor(instance, state !== null);
    if (verdict === "waking" && !wakesOnVisit(req)) verdict = "asleep";
    if (verdict === "waking") await askToWake(instance!);
    const json = /application\/json/.test(String(req.headers.accept ?? "")) || (req.url ?? "").startsWith("/api/");
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-robots-tag", "noindex");
    if (verdict === "unknown") {
      res.writeHead(404, json ? { "content-type": "application/json" } : { "content-type": "text/html; charset=utf-8" });
      res.end(json ? JSON.stringify({ error: "not_found" }) : NOT_FOUND_PAGE);
      return verdict;
    }
    if (verdict === "asleep") {
      res.writeHead(503, { "content-type": "application/json", "x-omb-cloud-power": "asleep" });
      res.end(JSON.stringify({ error: "asleep" }));
      return verdict;
    }
    if (verdict === "paused") {
      res.writeHead(503, json ? { "content-type": "application/json" } : { "content-type": "text/html; charset=utf-8" });
      res.end(json ? JSON.stringify({ error: "paused" }) : PAUSED_PAGE);
      return verdict;
    }
    // Waking, starting (Traefik routes to it once its health check passes) or the agent just started: come back soon.
    res.setHeader("retry-after", String(RELOAD_SECONDS));
    res.writeHead(503, json ? { "content-type": "application/json" } : { "content-type": "text/html; charset=utf-8" });
    res.end(json ? JSON.stringify({ error: "waking" }) : WAKING_PAGE);
    return verdict;
  };
}

/** Listens on `port` (all interfaces of the agent's container: only Traefik on the node reaches it). */
export function startWakeServer(port: number, deps: WakeServerDeps): Server {
  const handle = createWakeHandler(deps);
  const server = createServer((req, res) => {
    req.resume();
    handle(req, res).catch((error) => {
      deps.log(`página de despertar: ${(error as Error).message}`);
      if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("erro");
    });
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  server.listen(port);
  return server;
}
