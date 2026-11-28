// A Cloud home's computers from the Admin (server/cloud-computers.ts) and the relay that lets a boxed turn use its own VPS
// computer (server/vps-computer-rpc.ts), kept out of index.ts (server/host/README.md). Null computers on any server that
// is not a Cloud home.
import { execFile } from "node:child_process";
import type { ServerResponse } from "node:http";
import { createCloudComputers, type CloudComputers } from "../cloud-computers.ts";
import { augmentedPath } from "../env-path.ts";
import { HARNESS_CALL_BUDGET_MS } from "../harness-budget.ts";
import { harnessMcpTokenEnv } from "../harness-mcp-token.ts";
import { AGENTS_NODE_FLAG, SPAWNED_PROXIES } from "../proxy-paths.ts";
import { vpsDockerArgs } from "../vps-computer.ts";
import { VpsMcpSessions, vpsComputerRpc, type VpsTarget } from "../vps-computer-rpc.ts";
import { prepareVpsSsh } from "../vps-ssh.ts";

export type { VpsTarget } from "../vps-computer-rpc.ts";

export function createCloudComputersHost(deps: {
  cloudHome: boolean;
  dataDir: string;
  defaultAlias(): string | null;
  setDefaultAlias(alias: string | null): void;
  /** Whether a bot's VPS desktop (or a bot's own alias) still uses this alias. */
  inUse(alias: string): Promise<boolean>;
}): CloudComputers | null {
  if (!deps.cloudHome) return null;
  return createCloudComputers({
    dataDir: deps.dataDir, defaultAlias: deps.defaultAlias, setDefaultAlias: deps.setDefaultAlias, inUse: deps.inUse,
    check: (alias) => new Promise((resolve) => {
      const ssh = prepareVpsSsh(deps.dataDir, augmentedPath());
      execFile("docker", vpsDockerArgs(alias, ["version", "--format", "{{.Server.Version}}"]), { env: { ...process.env, PATH: ssh.path }, timeout: 45_000 },
        (error, _stdout, stderr) => resolve(error ? { ok: false, problem: String(stderr || error.message).trim().slice(-300) } : { ok: true }));
    }),
  });
}

/** The engine's stdio side of a server-served computer (the Boat, or a relayed VPS): the harness MCP proxy with the turn's capability. */
export function harnessComputerIntegration(port: number, token: string) {
  return {
    command: process.execPath,
    args: [SPAWNED_PROXIES.harnessMcp, "computer"],
    env: { ...AGENTS_NODE_FLAG, OMB_HARNESS_URL: `http://127.0.0.1:${port}`, [harnessMcpTokenEnv("computer")]: token },
    platform: "linux" as const,
  };
}

const sessions = new VpsMcpSessions();

/** POST /api/internal/computer/mcp for a turn whose computer is its own VPS: answers through the server's bridge. */
export async function relayVpsComputerCall(res: ServerResponse, body: unknown, target: VpsTarget, deps: {
  gate(signal: AbortSignal): Promise<{ held: boolean; blockedReason?: string }>;
  refusal(control: { held: boolean; blockedReason?: string }): string;
  assertActive(): void;
}): Promise<unknown> {
  const abort = new AbortController();
  res.once("close", () => { if (!res.writableEnded) abort.abort(); });
  return vpsComputerRpc(body as { method?: unknown; params?: unknown }, {
    sessions, target, budgetMs: HARNESS_CALL_BUDGET_MS, gate: () => deps.gate(abort.signal), refusal: deps.refusal, assertActive: deps.assertActive,
  });
}
