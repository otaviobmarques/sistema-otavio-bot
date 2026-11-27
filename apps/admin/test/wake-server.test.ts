import { randomUUID } from "node:crypto";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { agentConfig, createAgent, DEFAULT_WAKE_PORT, NUDGE_MIN_MS, STARTING_POLL_SECONDS } from "../src/node-agent/main.ts";
import { createWakeHandler, startWakeServer, wakesOnVisit } from "../src/node-agent/wake-server.ts";
import { WAKE_POKE_HEADER, type DesiredInstance, type DesiredState } from "../src/provisioning/protocol.ts";
import { FakeDocker } from "./fake-docker.ts";

const NODE = randomUUID();
const TOKEN = `arko_node_${"b".repeat(43)}`;
const IMAGE = "ghcr.io/otaviobmarques/sistema-otavio-bot-cloud-home:latest";

function instance(overrides: Partial<DesiredInstance> = {}): DesiredInstance {
  return {
    id: randomUUID(), slug: "padaria", desired: "running", sleeping: false, host: "padaria.arkobot.com.br", image: IMAGE, revision: "b".repeat(32),
    env: { OMB_CLOUD_ROLE: "home" }, resources: { memoryMb: 1024, cpus: 0.5, pids: 512 }, ...overrides,
  };
}

const servers: { close(): void }[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

describe("página de despertar: o servidor HTTP do agente", () => {
  it("responde pelo Host de cada pedido: acordando, pausado ou 404", async () => {
    const sleeping = instance({ desired: "stopped", sleeping: true, host: "dorminhoco.arkobot.com.br" });
    const paused = instance({ desired: "stopped", host: "pausado.arkobot.com.br" });
    const state: DesiredState = { node: { id: NODE, name: "vps-1" }, pollSeconds: 15, instances: [sleeping, paused] };
    const woke: string[] = [];
    const server = startWakeServer(0, { desired: () => state, wake: async (id) => { woke.push(id); return { ok: true, state: "waking" }; }, nudge: () => undefined, log: () => undefined });
    servers.push(server);
    await new Promise((resolve) => server.once("listening", resolve));
    const port = (server.address() as AddressInfo).port;
    // fetch() won't set Host; Traefik passes the visitor's on.
    const get = (host: string) => new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; text: () => string }>((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port, path: "/qualquer/caminho", headers: { host } }, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text: () => body }));
      });
      req.on("error", reject);
      req.end();
    });

    const waking = await get("dorminhoco.arkobot.com.br");
    expect(waking.status).toBe(503);
    expect(waking.headers["content-type"]).toMatch(/text\/html/);
    expect(waking.headers["cache-control"]).toBe("no-store");
    expect(waking.text()).toContain("<html lang=\"pt-BR\">");
    expect(woke).toEqual([sleeping.id]);
    expect((await get("pausado.arkobot.com.br")).status).toBe(503);
    expect((await get("ninguem.arkobot.com.br")).status).toBe(404);
    expect(woke).toEqual([sleeping.id]);
  });
});

describe("o que acorda uma instância que dorme", () => {
  const req = (url: string, headers: Record<string, string> = {}) => ({ url, headers });
  it("uma visita, um webhook e o empurrão do Admin acordam; os laços de fundo e o próprio Admin não", () => {
    expect(wakesOnVisit(req("/"))).toBe(true);
    expect(wakesOnVisit(req("/pair"))).toBe(true);
    expect(wakesOnVisit(req("/hooks/whatsapp?x=1"))).toBe(true);
    expect(wakesOnVisit(req("/api/health", { [WAKE_POKE_HEADER]: "1" }))).toBe(true);
    for (const quiet of ["/api/events", "/api/health", "/api/sync/changes", "/api/shared-computers/abc/poll", "/.well-known/openmausbot/environment", "/api/cloud/power"]) {
      expect(wakesOnVisit(req(quiet)), quiet).toBe(false);
    }
    expect(wakesOnVisit(req("/api/threads", { "x-omb-background": "1" }))).toBe(false);
    expect(wakesOnVisit(req("/api/cloud/plan", { "x-omb-cloud-signature": "v1=x" }))).toBe(false);
  });

  it("responde 503 asleep, sem acordar, a um laço de fundo", async () => {
    const sleeping = instance({ desired: "stopped", sleeping: true });
    let asks = 0;
    const handle = createWakeHandler({
      desired: () => ({ node: { id: NODE, name: "vps-1" }, pollSeconds: 15, instances: [sleeping] }),
      wake: async () => { asks++; return { ok: true, state: "waking" }; }, nudge: () => undefined, log: () => undefined,
    });
    const headers: Record<string, string> = {};
    let status = 0;
    let body = "";
    const res = { setHeader: (name: string, value: string) => { headers[name] = value; },
      writeHead: (code: number, extra: Record<string, string>) => { status = code; Object.assign(headers, extra); }, end: (text: string) => { body = text; } };
    expect(await handle({ url: "/api/sync/changes", headers: { host: sleeping.host } } as never, res as never)).toBe("asleep");
    expect({ status, power: headers["x-omb-cloud-power"], body }).toEqual({ status: 503, power: "asleep", body: JSON.stringify({ error: "asleep" }) });
    expect(asks).toBe(0);
  });
});

describe("agente: despertar rápido", () => {
  it("lê a porta da página de despertar (0 desliga)", () => {
    const base = { ARKO_ADMIN_URL: "https://admin.arkobot.com.br", ARKO_NODE_TOKEN: TOKEN };
    expect(agentConfig(base).wakePort).toBe(DEFAULT_WAKE_PORT);
    expect(agentConfig({ ...base, ARKO_WAKE_PORT: "9100" }).wakePort).toBe(9100);
    expect(agentConfig({ ...base, ARKO_WAKE_PORT: "0" }).wakePort).toBeNull();
    expect(() => agentConfig({ ...base, ARKO_WAKE_PORT: "porta" })).toThrow(/ARKO_WAKE_PORT/);
  });

  it("consulta de novo em segundos enquanto um contêiner liga, e atende um empurrão sem passar de um a cada 2 s", async () => {
    let clock = 0;
    const docker = new FakeDocker();
    docker.images.add(IMAGE);
    docker.healthOnStart = "starting";
    const desired: DesiredState = { node: { id: NODE, name: "vps-1" }, pollSeconds: 15, instances: [instance()] };
    const fetcher = (async (url: string) => String(url).endsWith("/desired") ? Response.json(desired) : Response.json({ ok: true })) as unknown as typeof fetch;
    const agent = createAgent(agentConfig({ ARKO_ADMIN_URL: "https://admin.test", ARKO_NODE_TOKEN: TOKEN }), { docker, fetch: fetcher, log: () => undefined, now: () => clock });
    expect(await agent.once()).toBe(STARTING_POLL_SECONDS);
    expect(agent.desired()).toMatchObject({ pollSeconds: 15 });
    docker.healthOnStart = "healthy";
    for (const container of docker.containers.values()) container.health = "healthy";
    expect(await agent.once()).toBe(15);

    agent.nudge();
    expect(agent.nudged()).toBe(false);
    clock += NUDGE_MIN_MS;
    expect(agent.nudged()).toBe(true);
    await agent.once();
    expect(agent.nudged()).toBe(false);
  });

  it("o compose do agente tem o roteador catch-all de prioridade 1 e entra na rede das instâncias", () => {
    const compose = readFileSync(new URL("../deploy/node-agent.vps.compose.yml", import.meta.url), "utf8");
    expect(compose).toMatch(/traefik\.http\.routers\.arkobot-wake\.rule: \$\{ARKO_WAKE_RULE:-HostRegexp\(`\^\[a-z0-9\]/);
    expect(compose).toMatch(/traefik\.http\.routers\.arkobot-wake\.priority: "1"\r?\n/);
    expect(compose).toMatch(/traefik\.http\.services\.arkobot-wake\.loadbalancer\.server\.port: \$\{ARKO_WAKE_PORT:-8790\}/);
    expect(compose).toMatch(/networks:\r?\n {2}instances:\r?\n {4}name: \$\{ARKO_INSTANCE_NETWORK:-arkobot-instances\}\r?\n {4}external: true/);
    expect(compose).not.toMatch(/^\s+ports:/m);
  });
});
