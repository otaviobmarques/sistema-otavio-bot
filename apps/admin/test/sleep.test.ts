import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tick } from "../src/jobs/handlers.ts";
import { createAgent } from "../src/node-agent/main.ts";
import { createWakeHandler, WAKE_ASK_MS } from "../src/node-agent/wake-server.ts";
import { cloudRequestSignature } from "../src/provisioning/cloud-request.ts";
import { bootstrapContext, desiredOf } from "../src/provisioning/instances.ts";
import { WAKE_POKE_HEADER } from "../src/provisioning/protocol.ts";
import { POWER_CHECK_MS, powerStateOf, WAKE_LEAD_MS } from "../src/provisioning/sleep.ts";
import { createApp } from "../src/server/app.ts";
import { billingFixture, type BillingFixture } from "./billing-fixture.ts";
import { FakeDocker } from "./fake-docker.ts";
import { advance, client, cnpj, customerClient, TEST_URL, type TestContext } from "./helpers.ts";

type Row = Record<string, any>;

function codeFrom(ctx: TestContext, to: string): string {
  const last = [...ctx.mailer.sent].reverse().find((mail) => mail.to === to);
  const match = last?.text.match(/(\d{4})-(\d{4})/);
  if (!match) throw new Error("nenhum código enviado");
  return `${match[1]}${match[2]}`;
}

let seq = 0;
async function customer(ctx: TestContext, company: string) {
  const email = `dona${++seq}@${company.toLowerCase().replace(/\W/g, "")}.com.br`;
  const anonymous = customerClient(ctx);
  await anonymous.post("/api/conta/auth/otp/request", { email });
  const verified = await anonymous.post("/api/conta/auth/otp/verify", { email, code: codeFrom(ctx, email) });
  const cookie = (verified.headers.get("set-cookie") ?? "").split(";")[0]!;
  const api = customerClient(ctx, cookie);
  const done = await api.post("/api/conta/cadastro", {
    name: "Bia Lima", phone: "(11) 98765-4321", companyName: company, documentType: "cnpj",
    document: cnpj(String(500000000000 + seq * 7919).slice(0, 12)), acceptTerms: true,
  });
  if (done.status !== 200) throw new Error(JSON.stringify(done.data));
  return { api, email, orgId: done.data.organization.id as string };
}

const instanceOf = async (ctx: TestContext, orgId: string): Promise<Row> =>
  (await ctx.db.query<Row>("SELECT * FROM instances WHERE organization_id = $1 AND decommissioned_at IS NULL", [orgId])).rows[0]!;

/** Customer instances answering the Admin's signed requests, with a power report the test sets (server/cloud-power.ts). */
function fakeHomes(f: BillingFixture) {
  const power = { idle: true, busy: [] as string[], browsers: 1 as number | undefined, nextDueAt: null as number | null, accept: true };
  const seen: { host: string; target: string; body: any }[] = [];
  const pokes: string[] = [];
  const original = f.ctx.fetch;
  f.ctx.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (!url.hostname.endsWith(".arkobot.com.br")) return original(input, init);
    const headers = new Headers(init?.headers);
    if (headers.get(WAKE_POKE_HEADER) === "1") {
      pokes.push(url.hostname);
      return Response.json({ error: "waking" }, { status: 503 });
    }
    const row = (await f.ctx.db.query<Row>("SELECT id, bootstrap_secret_enc FROM instances WHERE public_url = $1", [url.origin])).rows[0];
    if (!row) throw new TypeError("fetch failed");
    const secret = f.ctx.box.decrypt(row.bootstrap_secret_enc, bootstrapContext(row.id));
    const body = String(init?.body ?? "");
    const target = `${url.pathname}${url.search}`;
    const expected = cloudRequestSignature(secret, headers.get("x-omb-cloud-timestamp")!, headers.get("x-omb-cloud-nonce")!, init?.method ?? "GET", target, body);
    if (headers.get("x-omb-cloud-signature") !== `v1=${expected}`) return Response.json({ error: "invalid_signature" }, { status: 401 });
    const parsed = body ? JSON.parse(body) : null;
    seen.push({ host: url.hostname, target, body: parsed });
    if (url.pathname === "/api/cloud/power") {
      const busy = [...power.busy, ...(url.searchParams.get("browsers") === "1" && (power.browsers ?? 0) > 0 ? ["browser"] : [])];
      return Response.json({ v: 1, idle: power.idle && busy.length === 0, busy, nextDueAt: power.nextDueAt, sleeping: false,
        ...(power.browsers === undefined ? {} : { browsers: power.browsers }) });
    }
    if (url.pathname === "/api/cloud/power/sleep") {
      return power.accept ? Response.json({ ok: true, nextDueAt: power.nextDueAt }) : Response.json({ ok: false, busy: ["recent-activity"] }, { status: 409 });
    }
    if (url.pathname === "/api/cloud/pairing") return Response.json({ credential: `omb_pair_${"B".repeat(43)}`, purpose: parsed.purpose });
    return Response.json({ ok: true });
  }) as typeof fetch;
  return { power, seen, pokes, reads: () => seen.filter((call) => call.target.startsWith("/api/cloud/power?")).length };
}

async function setup(f: BillingFixture, plan = "inicial") {
  const created = await f.api.post("/api/instances/nodes", { name: `vps-sono-${++seq}`, publicIp: "200.141.20.53", capacityInstances: 20 });
  const token = created.data.token as string;
  const app = createApp(f.ctx);
  const appFetch = ((input: RequestInfo | URL, init?: RequestInit) => app.request(String(input), init, { incoming: { socket: { remoteAddress: "198.51.100.9" } } })) as typeof fetch;
  const docker = new FakeDocker();
  const agent = createAgent({
    adminUrl: TEST_URL, token, socketPath: "/nao/usado", network: "arkobot-instances", proxyContainer: null, entrypoint: "websecure", certResolver: "letsencrypt",
    trustedProxies: null, registryAuth: null,
  }, { docker, fetch: appFetch, log: () => undefined });
  const who = await customer(f.ctx, `Café ${plan} ${seq}`);
  if (plan === "inicial") {
    expect((await who.api.post("/api/conta/assinatura", { plan: "inicial", billingType: "PIX" })).status).toBe(201);
  } else {
    await f.api.post(`/api/clients/${who.orgId}/courtesy`, { planId: f.plans[plan]!.id, reason: "teste de sono" });
  }
  await who.api.get("/api/conta/arkobot");
  return { ...who, agent, docker, token };
}

describe("plano que dorme (Inicial)", () => {
  let f: BillingFixture;
  beforeEach(async () => {
    f = await billingFixture();
  });
  afterEach(() => f.close());

  it("não dorme com página aberta; dorme após o tempo sem uso; acorda ao abrir e abre já logado", async () => {
    const homes = fakeHomes(f);
    const { api, orgId, agent, docker } = await setup(f);
    expect((await f.ctx.db.query("SELECT idle_sleep_minutes FROM plans WHERE code = 'inicial'")).rows[0]).toEqual({ idle_sleep_minutes: 30 });

    // Up and ready; its first power read (from the agent's report) finds a page open.
    await agent.once();
    let instance = await instanceOf(f.ctx, orgId);
    const name = `arkoinst-${instance.slug}`;
    expect(instance).toMatchObject({ state: "ready", sleeping_since: null, power_busy: "browser" });
    expect(homes.seen.find((call) => call.target.startsWith("/api/cloud/power"))?.target).toBe("/api/cloud/power?idleMinutes=30&browsers=1");
    expect(homes.seen.some((call) => call.target === "/api/cloud/power/sleep")).toBe(false);

    // At most one read a minute, however often the agent reports.
    await agent.once();
    expect(homes.reads()).toBe(1);

    // The page closed and nothing ran for the window: it agrees to sleep; its next routine is in two hours.
    homes.power.browsers = 0;
    homes.power.nextDueAt = f.ctx.now().getTime() + 2 * 60 * 60_000;
    advance(f.ctx, POWER_CHECK_MS);
    await agent.once();
    instance = await instanceOf(f.ctx, orgId);
    expect(instance.sleeping_since).not.toBeNull();
    expect(new Date(instance.wake_at).getTime()).toBe(homes.power.nextDueAt - WAKE_LEAD_MS);
    expect(homes.seen.find((call) => call.target === "/api/cloud/power/sleep")?.body).toEqual({ v: 1, idleMinutes: 30, browsers: true });
    expect(instance.state).toBe("ready");

    // The next poll stops the container; the volume stays. Billing never sees a stop.
    await agent.once();
    expect(docker.byName(name)?.running).toBe(false);
    expect(docker.volumes.size).toBe(1);
    expect(agent.desired()!.instances[0]).toMatchObject({ desired: "stopped", sleeping: true });
    expect((await api.get("/api/conta/arkobot")).data).toMatchObject({ status: "sleeping", canOpen: true });
    const listed = (await f.api.get("/api/instances")).data.instances.find((row: Row) => row.id === instance.id);
    expect(listed).toMatchObject({ power: "asleep", desired: "stopped", idle_sleep_minutes: 30 });
    // Asleep, it is never asked anything (a signed request would hit the waking page).
    advance(f.ctx, 5 * POWER_CHECK_MS);
    const before = homes.seen.length;
    await tick(f.ctx);
    expect(homes.seen.length).toBe(before);

    // "Abrir meu ArkoBot": wakes it, nudges the node's agent through its address, and says waking.
    const opened = await api.post("/api/conta/arkobot/abrir", {});
    expect(opened).toMatchObject({ status: 200, data: { waking: true } });
    expect(homes.pokes).toEqual([instance.public_url.replace("https://", "")]);
    instance = await instanceOf(f.ctx, orgId);
    expect(instance).toMatchObject({ sleeping_since: null, wake_at: null });
    expect((await api.get("/api/conta/arkobot")).data).toMatchObject({ status: "waking", canOpen: true });
    expect((await api.post("/api/conta/arkobot/abrir", {})).data).toEqual({ waking: true });

    // Just booted, it says so for two minutes (server/cloud-power.ts), so the next read keeps it awake.
    homes.power.busy = ["just-woke"];
    await agent.once();
    expect(docker.byName(name)?.running).toBe(true);
    expect((await api.get("/api/conta/arkobot")).data).toMatchObject({ status: "ready" });
    expect((await api.post("/api/conta/arkobot/abrir", {})).data.url).toBe(`${instance.public_url}/pair#signin=omb_pair_${"B".repeat(43)}`);

    const actions = (await f.ctx.db.query<Row>("SELECT action, data FROM audit_log WHERE target_id = $1 AND action IN ('instance.slept', 'instance.woke') ORDER BY created_at, id", [instance.id])).rows;
    expect(actions.map((row) => [row.action, row.data.via ?? null])).toEqual([["instance.slept", null], ["instance.woke", "cliente"]]);
  });

  it("acorda sozinho para a próxima rotina, e de vez quando o plano deixa de dormir", async () => {
    const homes = fakeHomes(f);
    homes.power.browsers = 0;
    homes.power.nextDueAt = f.ctx.now().getTime() + 60 * 60_000;
    const { orgId, agent, docker } = await setup(f);
    await agent.once(); // up, and asleep at once (idle, nothing open)
    await agent.once(); // stopped
    let instance = await instanceOf(f.ctx, orgId);
    const name = `arkoinst-${instance.slug}`;
    expect(docker.byName(name)?.running).toBe(false);

    advance(f.ctx, 60 * 60_000 - WAKE_LEAD_MS);
    homes.power.idle = false;
    await agent.once(); // its poll wakes the due one and starts it in the same pass
    expect(docker.byName(name)?.running).toBe(true);
    instance = await instanceOf(f.ctx, orgId);
    expect(instance.sleeping_since).toBeNull();
    expect(powerStateOf(instance as never, f.ctx.now())).toBe("awake");

    // Asleep again with no routine ahead; then the plan stops sleeping: the cron wakes it for good.
    homes.power.idle = true;
    homes.power.nextDueAt = null;
    advance(f.ctx, POWER_CHECK_MS);
    await agent.once();
    expect((await instanceOf(f.ctx, orgId)).wake_at).toBeNull();
    expect((await instanceOf(f.ctx, orgId)).sleeping_since).not.toBeNull();
    await f.ctx.db.query("UPDATE plans SET idle_sleep_minutes = NULL WHERE code = 'inicial'");
    await tick(f.ctx);
    expect((await instanceOf(f.ctx, orgId)).sleeping_since).toBeNull();
    expect(homes.pokes).toHaveLength(1);
    const via = (await f.ctx.db.query<Row>("SELECT data->>'via' AS via FROM audit_log WHERE action = 'instance.woke' ORDER BY created_at, id")).rows.map((row) => row.via);
    expect(via).toEqual(["rotina", "plano"]);
  });

  it("nunca dorme sem a contagem de páginas (imagem antiga), nem num plano que não dorme", async () => {
    const homes = fakeHomes(f);
    homes.power.browsers = undefined;
    const inicial = await setup(f);
    await inicial.agent.once();
    expect(await instanceOf(f.ctx, inicial.orgId)).toMatchObject({ sleeping_since: null, power_busy: "imagem-antiga" });

    const essencial = await setup(f, "essencial");
    await tick(f.ctx);
    await essencial.agent.once();
    expect(homes.seen.filter((call) => call.target.startsWith("/api/cloud/power")).map((call) => call.host))
      .not.toContain(new URL((await instanceOf(f.ctx, essencial.orgId)).public_url).hostname);
    expect((await instanceOf(f.ctx, essencial.orgId)).power_checked_at).toBeNull();
  });

  it("na VPS própria do cliente (nó dedicado) nunca dorme, e acorda se já estava dormindo", async () => {
    const homes = fakeHomes(f);
    homes.power.browsers = 0;
    const { orgId, agent } = await setup(f);
    await f.ctx.db.query("UPDATE nodes SET kind = 'dedicated'");
    await agent.once();
    advance(f.ctx, POWER_CHECK_MS);
    await agent.once();
    const instance = await instanceOf(f.ctx, orgId);
    expect(instance.observed_state).toBe("running");
    expect(homes.seen.some((call) => call.target === "/api/cloud/power/sleep")).toBe(false);
    expect((await instanceOf(f.ctx, orgId)).sleeping_since).toBeNull();

    await f.ctx.db.query("UPDATE instances SET sleeping_since = $2 WHERE id = $1", [instance.id, f.ctx.now()]);
    await tick(f.ctx);
    expect((await instanceOf(f.ctx, orgId)).sleeping_since).toBeNull();
  });

  it("parada pelo operador ou por pagamento manda mais que o sono", () => {
    const asleep = { decommissioned_at: null, operator_stopped: false, state: "ready" as const, sleeping_since: new Date() };
    expect(desiredOf(asleep)).toBe("stopped");
    expect(desiredOf({ ...asleep, sleeping_since: null })).toBe("running");
    expect(desiredOf({ ...asleep, state: "setting_up" as never })).toBe("running");
    const row = { ...asleep, woke_at: null, observed_state: "stopped" as const, observed_health: null };
    expect(powerStateOf(row as never, new Date())).toBe("asleep");
    expect(powerStateOf({ ...row, operator_stopped: true } as never, new Date())).toBe("awake");
    expect(powerStateOf({ ...row, sleeping_since: null, woke_at: new Date() } as never, new Date())).toBe("waking");
  });
});

/** A request as Traefik's catch-all router hands it to the agent's waking page. */
function visit(host: string, accept = "text/html") {
  const req = { headers: { host, accept }, url: "/" } as unknown as IncomingMessage;
  const res = {
    status: 0, headers: {} as Record<string, string>, body: "", headersSent: false,
    setHeader(name: string, value: string) { this.headers[name] = value; },
    writeHead(code: number, headers: Record<string, string> = {}) { this.status = code; Object.assign(this.headers, headers); },
    end(body: string) { this.body = body; },
  };
  return { req, res: res as unknown as ServerResponse & typeof res };
}

describe("página de despertar do agente", () => {
  let f: BillingFixture;
  beforeEach(async () => {
    f = await billingFixture();
  });
  afterEach(() => f.close());

  it("acorda a instância que dorme, recarrega sozinha e dá 404 para endereço desconhecido", async () => {
    const homes = fakeHomes(f);
    homes.power.browsers = 0;
    const { orgId, agent, docker } = await setup(f);
    await agent.once();
    await agent.once();
    const instance = await instanceOf(f.ctx, orgId);
    const host = new URL(instance.public_url).hostname;
    expect(docker.byName(`arkoinst-${instance.slug}`)?.running).toBe(false);

    let clock = 1_000_000;
    let nudges = 0;
    let asks = 0;
    const handle = createWakeHandler({
      desired: agent.desired, wake: (id) => { asks++; return agent.wake(id); }, nudge: () => { nudges++; agent.nudge(); }, log: () => undefined, now: () => clock,
    });

    const first = visit(`${host.toUpperCase()}:443`);
    expect(await handle(first.req, first.res)).toBe("waking");
    expect(first.res.status).toBe(503);
    expect(first.res.body).toContain("Seu ArkoBot está acordando…");
    expect(first.res.body).toContain('http-equiv="refresh"');
    expect(first.res.headers["retry-after"]).toBe("3");
    expect((await instanceOf(f.ctx, orgId)).sleeping_since).toBeNull();
    expect(nudges).toBe(1);

    // Reloads in the meantime don't ask the Admin again.
    const json = visit(host, "application/json");
    await handle(json.req, json.res);
    expect(json.res.body).toBe(JSON.stringify({ error: "waking" }));
    expect(asks).toBe(1);
    clock += WAKE_ASK_MS;

    // The nudged poll starts it; Traefik then routes to the instance itself.
    await agent.once();
    expect(agent.nudged()).toBe(false);
    expect(docker.byName(`arkoinst-${instance.slug}`)?.running).toBe(true);
    const audit = (await f.ctx.db.query<Row>("SELECT actor_label, data FROM audit_log WHERE action = 'instance.woke'")).rows;
    expect(audit).toEqual([expect.objectContaining({ actor_label: "visita ao endereço", data: expect.objectContaining({ via: "visita" }) })]);

    const stranger = visit("nao-existe.arkobot.com.br");
    expect(await handle(stranger.req, stranger.res)).toBe("unknown");
    expect(stranger.res.status).toBe(404);
    expect(stranger.res.body).toContain("Endereço não encontrado");

    // Stopped by the operator: a visit wakes nothing.
    await f.api.post(`/api/instances/${instance.id}/stop`, { reason: "manutenção do servidor" });
    await agent.once();
    const paused = visit(host);
    expect(await handle(paused.req, paused.res)).toBe("paused");
    expect(paused.res.status).toBe(503);
    expect(paused.res.body).toContain("pausado");
    expect(asks).toBe(1);
  });

  it("antes do primeiro estado desejado pede para tentar de novo", async () => {
    const handle = createWakeHandler({ desired: () => null, wake: async () => ({ ok: true, state: "waking" }), nudge: () => undefined, log: () => undefined });
    const early = visit("qualquer.arkobot.com.br");
    expect(await handle(early.req, early.res)).toBe("not_ready");
    expect(early.res.status).toBe(503);
  });

  it("o agente recusa o despertar de uma instância de outro servidor", async () => {
    const { token } = await setup(f);
    const other = await f.api.post("/api/instances/nodes", { name: "vps-outro", publicIp: "200.141.20.54" });
    const instance = (await f.ctx.db.query<Row>("SELECT id FROM instances LIMIT 1")).rows[0]!;
    const answer = await client(f.ctx).post("/api/agent/v1/wake", { instanceId: instance.id }, { authorization: `Bearer ${other.data.token}` });
    expect(answer).toMatchObject({ status: 404, data: { ok: false, state: "unknown" } });
    const mine = await client(f.ctx).post("/api/agent/v1/wake", { instanceId: instance.id }, { authorization: `Bearer ${token}` });
    expect(mine).toMatchObject({ status: 200, data: { ok: true, state: "not_sleeping" } });
    expect((await client(f.ctx).post("/api/agent/v1/wake", { instanceId: "x" }, { authorization: `Bearer ${token}` })).status).toBe(400);
  });
});
