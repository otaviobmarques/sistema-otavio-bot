// ArkoBot node agent: runs on a server with the Docker socket mounted, asks the Admin which customer instances this node
// should run (pull: no inbound port), reconciles Docker, and reports what it saw. If the Admin cannot be reached it
// changes nothing: the instances keep running under Docker's restart policy. It never logs a secret.
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { AGENT_API, desiredStateSchema, NODE_TOKEN_PATTERN, type DesiredState, type StatusReport } from "../provisioning/protocol.ts";
import { createDiskMeter } from "./disk.ts";
import { DockerClient, type DockerApi } from "./docker.ts";
import { attachProxy, prepareNetwork, reconcile, type Log } from "./reconcile.ts";
import type { NodeSettings } from "./spec.ts";

export const AGENT_VERSION = "0.1.0";

export interface AgentConfig {
  adminUrl: string;
  token: string;
  socketPath: string;
  network: string;
  /** The reverse proxy container kept attached to `network`; null: don't manage it. */
  proxyContainer: string | null;
  entrypoint: string;
  certResolver: string;
  /** OMB_CLOUD_TRUSTED_PROXIES for every instance; null: the instance network's subnet. */
  trustedProxies: string | null;
  registryAuth: string | null;
}

export function agentConfig(env: NodeJS.ProcessEnv): AgentConfig {
  const adminUrl = (env.ARKO_ADMIN_URL ?? "").trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(adminUrl);
  } catch {
    throw new Error("Defina ARKO_ADMIN_URL (ex.: https://admin.arkobot.com.br)");
  }
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) throw new Error("ARKO_ADMIN_URL precisa ser https");
  const token = (env.ARKO_NODE_TOKEN ?? "").trim();
  if (!NODE_TOKEN_PATTERN.test(token)) throw new Error("Defina ARKO_NODE_TOKEN (o token arko_node_… mostrado ao cadastrar o servidor)");
  const user = env.ARKO_REGISTRY_USER?.trim();
  const password = env.ARKO_REGISTRY_TOKEN?.trim();
  return {
    adminUrl: parsed.origin,
    token,
    socketPath: env.DOCKER_SOCKET?.trim() || "/var/run/docker.sock",
    network: env.ARKO_INSTANCE_NETWORK?.trim() || "arkobot-instances",
    proxyContainer: env.ARKO_TRAEFIK_CONTAINER === undefined ? "traefik-traefik-1" : env.ARKO_TRAEFIK_CONTAINER.trim() || null,
    entrypoint: env.ARKO_TRAEFIK_ENTRYPOINT?.trim() || "websecure",
    certResolver: env.ARKO_TRAEFIK_CERTRESOLVER?.trim() || "letsencrypt",
    trustedProxies: env.ARKO_TRUSTED_PROXIES?.trim() || null,
    registryAuth: user && password
      ? Buffer.from(JSON.stringify({ username: user, password, serveraddress: env.ARKO_REGISTRY_SERVER?.trim() || "ghcr.io" })).toString("base64url")
      : null,
  };
}

async function adminCall(config: AgentConfig, fetcher: typeof fetch, method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
  const response = await fetcher(`${config.adminUrl}${AGENT_API}${path}`, {
    method,
    headers: { authorization: `Bearer ${config.token}`, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Admin respondeu ${response.status} em ${path}`);
  return response.json();
}

export interface AgentLoop {
  /** One poll: desired state, reconcile, report. Returns how long to wait before the next one. */
  once(): Promise<number>;
}

export function createAgent(config: AgentConfig, deps: { docker?: DockerApi; fetch?: typeof fetch; log?: Log; now?: () => number } = {}): AgentLoop {
  const docker = deps.docker ?? new DockerClient({ socketPath: config.socketPath, registryAuth: config.registryAuth });
  const fetcher = deps.fetch ?? globalThis.fetch;
  const log = deps.log ?? ((line) => console.log(`[arkobot-agent] ${line}`));
  const disk = createDiskMeter(docker, { log, now: deps.now });
  let failures = 0;
  let subnet: string | null | undefined;
  return {
    async once() {
      let desired: DesiredState;
      try {
        desired = desiredStateSchema.parse(await adminCall(config, fetcher, "GET", "/desired"));
      } catch (error) {
        // The Admin is down or refused us: change nothing, try again with a longer wait.
        if (failures++ % 20 === 0) log(`não consegui ler o estado desejado (${(error as Error).message}); nada foi mudado`);
        return Math.min(15 * 2 ** Math.min(failures, 4), 300);
      }
      failures = 0;
      let report: StatusReport;
      try {
        if (subnet === undefined) subnet = await prepareNetwork(docker, config.network, desired.node.id);
        if (config.proxyContainer) {
          const proxy = await attachProxy(docker, config.network, config.proxyContainer);
          if (proxy !== "already") log(proxy === "attached" ? `${config.proxyContainer} ligado à rede ${config.network}` : `${config.proxyContainer} não existe; as instâncias ficam sem rota`);
        }
        const node: NodeSettings = {
          nodeId: desired.node.id, network: config.network, entrypoint: config.entrypoint, certResolver: config.certResolver,
          trustedProxies: config.trustedProxies ?? subnet,
        };
        report = await reconcile(docker, node, desired, AGENT_VERSION, log);
        await disk.attach(report, desired.node.id);
      } catch (error) {
        const message = (error as Error).message.slice(0, 500);
        log(`Docker: ${message}`);
        report = { agentVersion: AGENT_VERSION, instances: [], orphans: [], error: message };
      }
      try {
        await adminCall(config, fetcher, "POST", "/status", report);
      } catch (error) {
        log(`não consegui enviar o relatório (${(error as Error).message})`);
      }
      return desired.pollSeconds;
    },
  };
}

async function main() {
  const config = agentConfig(process.env);
  const agent = createAgent(config);
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  console.log(`[arkobot-agent] ${AGENT_VERSION} falando com ${config.adminUrl}; rede ${config.network}`);
  while (!stopping) {
    const wait = await agent.once();
    // Short steps, so a stop is quick; the instances keep running when the agent stops.
    for (let waited = 0; waited < wait && !stopping; waited++) await sleep(1000);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[arkobot-agent] ${(error as Error).message}`);
    process.exit(1);
  });
}
