import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tick } from "../src/jobs/handlers.ts";
import { createAgent } from "../src/node-agent/main.ts";
import { cloudRequestSignature } from "../src/provisioning/cloud-request.ts";
import { bootstrapContext, gatewayTokenContext } from "../src/provisioning/instances.ts";
import { resolveGatewayToken } from "../src/gateway/tokens.ts";
import { sha256Hex } from "../src/security/crypto.ts";
import { createApp } from "../src/server/app.ts";
import { billingFixture, type BillingFixture } from "./billing-fixture.ts";
import { FakeDocker } from "./fake-docker.ts";
import { client, cnpj, customerClient, sessionCookie, TEST_URL, type TestContext } from "./helpers.ts";

function codeFrom(ctx: TestContext, to: string): string {
  const last = [...ctx.mailer.sent].reverse().find((mail) => mail.to === to);
  const match = last?.text.match(/(\d{4})-(\d{4})/);
  if (!match) throw new Error("nenhum código enviado");
  return `${match[1]}${match[2]}`;
}

let seq = 0;
async function customer(ctx: TestContext, company: string) {
  const email = `dono${++seq}@${company.toLowerCase().replace(/\W/g, "")}.com.br`;
  const anonymous = customerClient(ctx);
  await anonymous.post("/api/conta/auth/otp/request", { email });
  const verified = await anonymous.post("/api/conta/auth/otp/verify", { email, code: codeFrom(ctx, email) });
  const cookie = (verified.headers.get("set-cookie") ?? "").split(";")[0]!;
  const api = customerClient(ctx, cookie);
  const done = await api.post("/api/conta/cadastro", {
    name: "Ana Souza", phone: "(11) 98765-4321", companyName: company, documentType: "cnpj",
    document: cnpj(String(400000000000 + seq * 7919).slice(0, 12)), acceptTerms: true,
  });
  if (done.status !== 200) throw new Error(JSON.stringify(done.data));
  return { api, email, orgId: done.data.organization.id as string };
}

type Row = Record<string, any>;
const instanceOf = async (ctx: TestContext, orgId: string): Promise<Row | undefined> =>
  (await ctx.db.query<Row>("SELECT * FROM instances WHERE organization_id = $1 AND decommissioned_at IS NULL", [orgId])).rows[0];

/** A customer instance answering the Admin's signed requests, as server/routes/cloud-signed.ts does. */
function fakeInstances(f: BillingFixture) {
  const seen: { host: string; path: string; body: any }[] = [];
  const original = f.ctx.fetch;
  f.ctx.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (!url.hostname.endsWith(".arkobot.com.br")) return original(input, init);
    const row = (await f.ctx.db.query<Row>("SELECT id, bootstrap_secret_enc FROM instances WHERE public_url = $1", [url.origin])).rows[0];
    if (!row) throw new TypeError("fetch failed");
    const secret = f.ctx.box.decrypt(row.bootstrap_secret_enc, bootstrapContext(row.id));
    const headers = new Headers(init?.headers);
    const body = String(init?.body ?? "");
    const expected = cloudRequestSignature(secret, headers.get("x-omb-cloud-timestamp")!, headers.get("x-omb-cloud-nonce")!, init?.method ?? "GET", url.pathname, body);
    if (headers.get("x-omb-cloud-signature") !== `v1=${expected}`) return Response.json({ error: "invalid_signature" }, { status: 401 });
    const parsed = body ? JSON.parse(body) : null;
    seen.push({ host: url.hostname, path: url.pathname, body: parsed });
    if (url.pathname === "/api/cloud/pairing") {
      return Response.json({ credential: `omb_pair_${"A".repeat(43)}`, expiresAt: Date.now() + 120_000, purpose: parsed.purpose });
    }
    if (url.pathname === "/api/cloud/plan") return Response.json({ ok: true });
    return Response.json({ error: "not found" }, { status: 404 });
  }) as typeof fetch;
  return seen;
}

async function registerNode(f: BillingFixture, capacity: number | null = 20) {
  const created = await f.api.post("/api/instances/nodes", { name: `vps-${++seq}`, publicIp: "200.141.20.53", capacityInstances: capacity });
  expect(created.status).toBe(201);
  return created.data as { node: { id: string; name: string }; token: string };
}

function agentFor(f: BillingFixture, token: string, docker = new FakeDocker()) {
  const app = createApp(f.ctx);
  const appFetch = ((input: RequestInfo | URL, init?: RequestInit) => app.request(String(input), init, { incoming: { socket: { remoteAddress: "198.51.100.9" } } })) as typeof fetch;
  const logs: string[] = [];
  const agent = createAgent({
    adminUrl: TEST_URL, token, socketPath: "/nao/usado", network: "arkobot-instances", proxyContainer: null, entrypoint: "websecure", certResolver: "letsencrypt",
    trustedProxies: null, registryAuth: null,
  }, { docker, fetch: appFetch, log: (line) => logs.push(line) });
  return { agent, docker, logs };
}

describe("provisionamento automático", () => {
  let f: BillingFixture;
  beforeEach(async () => {
    f = await billingFixture();
  });
  afterEach(() => f.close());

  it("trial do Inicial → instância → agente cria o contêiner → pronta → cliente abre já logado", async () => {
    const seen = fakeInstances(f);
    const { node, token } = await registerNode(f);
    const stored = (await f.ctx.db.query<Row>("SELECT agent_token_hash FROM nodes WHERE id = $1", [node.id])).rows[0]!;
    expect(stored.agent_token_hash).toBe(sha256Hex(token));
    expect(JSON.stringify(stored)).not.toContain(token);

    const { api, email, orgId } = await customer(f.ctx, "Padaria Pão Quente");
    expect((await api.get("/api/conta/arkobot")).data.status).toBe("none");
    expect((await api.post("/api/conta/assinatura", { plan: "inicial", billingType: "PIX" })).status).toBe(201);
    const queued = await f.ctx.db.query("SELECT type, status FROM jobs WHERE type = 'instance.provision'");
    expect(queued.rows).toEqual([{ type: "instance.provision", status: "queued" }]);

    // The customer panel provisions at once (the queued job then finds it done).
    const view = await api.get("/api/conta/arkobot");
    expect(view.data).toMatchObject({ status: "preparing", canOpen: false, url: "https://padaria-pao-quente.arkobot.com.br" });
    const instance = (await instanceOf(f.ctx, orgId))!;
    expect(instance).toMatchObject({ slug: "padaria-pao-quente", node_id: node.id, state: "setting_up", mode: "shared_limited", role: "home", machine_id: instance.id });
    expect(instance.bootstrap_secret_enc).toMatch(/^v1:/);
    const aiToken = f.ctx.box.decrypt(instance.gateway_token_enc, gatewayTokenContext(instance.id));
    const caller = await resolveGatewayToken(f.ctx.db, aiToken, f.ctx.now());
    expect(caller).toMatchObject({ organizationId: orgId, instanceId: instance.id, planCode: "inicial", freeRequestsPerDay: 200 });
    await tick(f.ctx);
    expect((await f.ctx.db.query("SELECT count(*)::int AS n FROM instances WHERE organization_id = $1", [orgId])).rows[0]).toEqual({ n: 1 });

    const { agent, docker } = agentFor(f, token);
    expect(await agent.once()).toBe(15);
    expect(docker.calls).toEqual([
      "network arkobot-instances", "pull ghcr.io/otaviobmarques/sistema-otavio-bot-cloud-home:latest",
      `volume arkoinst-${instance.id}-data`, "create arkoinst-padaria-pao-quente", "start arkoinst-padaria-pao-quente",
    ]);
    const container = docker.byName("arkoinst-padaria-pao-quente")!;
    const env = Object.fromEntries((container.body.Env as string[]).map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
    expect(env).toMatchObject({
      OMB_CLOUD_ROLE: "home", OMB_CLOUD_MACHINE_ID: instance.id, OMB_CLOUD_ADMIN_URL: "https://conta.test", OMB_PUBLIC_URL: "https://padaria-pao-quente.arkobot.com.br",
      OMB_CLOUD_AI_GATEWAY_URL: "https://ia.arkobot.com.br", OMB_CLOUD_AI_GATEWAY_TOKEN: aiToken, OMB_CLOUD_TRUSTED_PROXIES: "172.30.0.0/16", OMB_CLOUD_EDGE_HOLD: "30s",
    });
    expect(env.OMB_CLOUD_BOOTSTRAP_SECRET).toBe(f.ctx.box.decrypt(instance.bootstrap_secret_enc, bootstrapContext(instance.id)));
    expect(container.body.HostConfig).toMatchObject({ Memory: 1024 * 1024 * 1024, NanoCpus: 500_000_000, PidsLimit: 512, NetworkMode: "arkobot-instances", Privileged: false });
    expect(JSON.stringify(container.body)).not.toContain("docker.sock");
    expect(container.labels).toMatchObject({
      "arkobot.managed": "true", "arkobot.instance": instance.id, "arkobot.node": node.id,
      "traefik.http.routers.arkoinst-padaria-pao-quente.rule": "Host(`padaria-pao-quente.arkobot.com.br`)",
      "traefik.http.routers.arkoinst-padaria-pao-quente.tls.certresolver": "letsencrypt",
    });

    // Reported healthy: ready, and the instance learns its plan.
    const ready = (await instanceOf(f.ctx, orgId))!;
    expect(ready).toMatchObject({ state: "ready", observed_state: "running", observed_health: "healthy" });
    expect((await f.ctx.db.query<Row>("SELECT last_seen_at, agent_version FROM nodes WHERE id = $1", [node.id])).rows[0]!.agent_version).toBe("0.2.0");
    await tick(f.ctx);
    expect(seen).toEqual([{ host: "padaria-pao-quente.arkobot.com.br", path: "/api/cloud/plan", body: { v: 1, tier: "inicial" } }]);
    expect((await instanceOf(f.ctx, orgId))!.plan_tier_synced).toBe("inicial");

    expect((await api.get("/api/conta/arkobot")).data).toMatchObject({ status: "ready", canOpen: true });
    const opened = await api.post("/api/conta/arkobot/abrir", {});
    expect(opened.status).toBe(200);
    expect(opened.data.url).toBe(`https://padaria-pao-quente.arkobot.com.br/pair#signin=omb_pair_${"A".repeat(43)}`);
    expect(seen.at(-1)).toEqual({ host: "padaria-pao-quente.arkobot.com.br", path: "/api/cloud/pairing",
      body: { label: "Área do cliente ArkoBot", purpose: "browser", owner: email, ttlSeconds: 120 } });

    // A second pass changes nothing.
    docker.calls = [];
    await agent.once();
    expect(docker.calls).toEqual([]);
  });

  it("para quando a assinatura é suspensa ou cancelada e volta quando o cliente paga", async () => {
    const { token } = await registerNode(f);
    const orgId = await f.newClient("Oficina do Zé");
    const sub = await f.subscribe(orgId, "essencial");
    await tick(f.ctx);
    expect(await instanceOf(f.ctx, orgId), "pending: no instance yet").toBeUndefined();
    await f.webhook(f.fake.paymentEvent("PAYMENT_RECEIVED", {
      id: "pay_1", subscription: sub.provider_subscription_id, value: 159, status: "RECEIVED", billingType: "PIX", dueDate: "2026-11-25", paymentDate: "2026-11-25",
    }));
    await tick(f.ctx);
    const { agent, docker } = agentFor(f, token);
    await agent.once();
    const name = `arkoinst-${(await instanceOf(f.ctx, orgId))!.slug}`;
    expect(docker.byName(name)?.running).toBe(true);
    expect(docker.byName(name)?.body.HostConfig).toMatchObject({ Memory: 2048 * 1024 * 1024, NanoCpus: 1_000_000_000 });

    expect((await f.api.post(`/api/clients/${orgId}/status`, { action: "suspend", reason: "teste de suspensão" })).status).toBe(200);
    await agent.once();
    expect(docker.byName(name)?.running).toBe(false);
    expect((await instanceOf(f.ctx, orgId))!.state).toBe("stopped");

    expect((await f.api.post(`/api/clients/${orgId}/status`, { action: "reactivate", reason: "voltou a pagar" })).status).toBe(200);
    expect((await instanceOf(f.ctx, orgId))!.state).toBe("setting_up");
    await agent.once();
    expect(docker.byName(name)?.running).toBe(true);
    expect((await instanceOf(f.ctx, orgId))!.state).toBe("ready");
    expect(docker.volumes.size).toBe(1);
  });

  it("operador para, reprovisiona e desativa; o volume nunca é apagado", async () => {
    const { token } = await registerNode(f);
    const orgId = await f.newClient("Loja Azul");
    await f.ctx.db.query("UPDATE plans SET trial_days = 0 WHERE code = 'essencial'");
    const sub = await f.subscribe(orgId, "essencial");
    await f.webhook(f.fake.paymentEvent("PAYMENT_RECEIVED", {
      id: "pay_2", subscription: sub.provider_subscription_id, value: 159, status: "RECEIVED", billingType: "PIX", dueDate: "2026-11-25", paymentDate: "2026-11-25",
    }));
    const { agent, docker } = agentFor(f, token);
    await agent.once(); // the agent's poll also provisions
    const instance = (await instanceOf(f.ctx, orgId))!;
    const name = `arkoinst-${instance.slug}`;
    expect(docker.byName(name)?.running).toBe(true);

    expect((await f.api.post(`/api/instances/${instance.id}/stop`, { reason: "manutenção" })).status).toBe(200);
    await agent.once();
    expect(docker.byName(name)?.running).toBe(false);
    expect((await f.api.post(`/api/instances/${instance.id}/start`, {})).status).toBe(200);
    await agent.once();
    const first = docker.byName(name)!.id;
    expect(docker.byName(name)?.running).toBe(true);

    expect((await f.api.post(`/api/instances/${instance.id}/reprovision`, { reason: "imagem nova" })).status).toBe(200);
    docker.calls = [];
    await agent.once();
    expect(docker.calls).toEqual([`stop ${name}`, `remove ${name}`, "pull ghcr.io/otaviobmarques/sistema-otavio-bot-cloud-home:latest", `create ${name}`, `start ${name}`]);
    expect(docker.byName(name)!.id).not.toBe(first);

    const listed = await f.api.get("/api/instances");
    expect(listed.data.instances[0]).toMatchObject({ slug: instance.slug, desired: "running", node_name: expect.stringMatching(/^vps-/) });
    expect(listed.data.nodes[0]).toMatchObject({ online: true, instances: 1 });

    expect((await f.api.post(`/api/instances/${instance.id}/decommission`, { reason: "pedido do cliente", confirm: true })).status).toBe(200);
    const revoked = await f.ctx.db.query<Row>("SELECT revoked_at FROM gateway_tokens WHERE id = $1", [instance.gateway_token_id]);
    expect(revoked.rows[0]!.revoked_at).not.toBeNull();
    await agent.once();
    expect(docker.byName(name)).toBeUndefined();
    expect(docker.volumes.has(`arkoinst-${instance.id}-data`)).toBe(true);
    // Still entitled: a new instance (new slug, new volume) on the same pass.
    const fresh = (await instanceOf(f.ctx, orgId))!;
    expect(fresh.id).not.toBe(instance.id);
    expect(fresh.slug).toBe(`${instance.slug}-2`);
    const desired = await client(f.ctx).get("/api/agent/v1/desired", { authorization: `Bearer ${token}` });
    expect(desired.data.instances.map((i: Row) => i.id)).toEqual([fresh.id]);
  });

  it("respeita a capacidade do servidor e põe na fila quem não coube", async () => {
    const { node, token } = await registerNode(f, 1);
    const a = await f.newClient();
    const b = await f.newClient();
    for (const org of [a, b]) {
      await f.api.post(`/api/clients/${org}/courtesy`, { planId: f.plans.inicial!.id, reason: "parceiro de testes" });
    }
    await tick(f.ctx);
    expect((await instanceOf(f.ctx, a))!.node_id).toBe(node.id);
    expect((await instanceOf(f.ctx, b))!).toMatchObject({ node_id: null, state_reason: "aguardando um servidor com vaga" });
    const desired = await client(f.ctx).get("/api/agent/v1/desired", { authorization: `Bearer ${token}` });
    expect(desired.data.instances).toHaveLength(1);
    await f.ctx.db.query("UPDATE nodes SET capacity_instances = 2 WHERE id = $1", [node.id]);
    await tick(f.ctx);
    expect((await instanceOf(f.ctx, b))!.node_id).toBe(node.id);
  });

  it("protege a API do agente e os cadastros de servidor", async () => {
    const { token } = await registerNode(f);
    const anonymous = client(f.ctx);
    expect((await anonymous.get("/api/agent/v1/desired")).status).toBe(401);
    expect((await anonymous.get("/api/agent/v1/desired", { authorization: "Bearer arko_node_" + "x".repeat(43) })).status).toBe(401);
    expect((await anonymous.get("/api/agent/v1/desired", { authorization: `Bearer ${token}` })).status).toBe(200);
    expect((await anonymous.post("/api/agent/v1/status", { agentVersion: "1", instances: [{ id: "nope" }] }, { authorization: `Bearer ${token}` })).status).toBe(400);
    // The customer host never serves it.
    expect((await customerClient(f.ctx).get("/api/agent/v1/desired", { authorization: `Bearer ${token}` })).status).toBe(404);
    expect((await anonymous.get("/api/instances")).status).toBe(401);
    const operator = client(f.ctx, await sessionCookie(f.ctx, "operator"));
    expect((await operator.post("/api/instances/nodes", { name: "vps-x" })).status).toBe(403);
    expect((await operator.get("/api/instances")).status).toBe(200);
    const rotated = await f.api.post(`/api/instances/nodes/${(await f.api.get("/api/instances")).data.nodes[0].id}/token`, {});
    expect((await anonymous.get("/api/agent/v1/desired", { authorization: `Bearer ${token}` })).status).toBe(401);
    expect((await anonymous.get("/api/agent/v1/desired", { authorization: `Bearer ${rotated.data.token}` })).status).toBe(200);
  });

  it("o cliente vê \"Pausado por pagamento\" e não consegue abrir uma instância parada", async () => {
    await registerNode(f);
    const { api, orgId } = await customer(f.ctx, "Estúdio Verde");
    await api.post("/api/conta/assinatura", { plan: "inicial", billingType: "PIX" });
    await api.get("/api/conta/arkobot");
    expect((await api.post("/api/conta/arkobot/abrir", {})).status).toBe(409);
    await f.api.post(`/api/clients/${orgId}/status`, { action: "suspend", reason: "pagamento em atraso" });
    expect((await api.get("/api/conta/arkobot")).data).toMatchObject({ status: "paused_payment", canOpen: false });
  });
});
