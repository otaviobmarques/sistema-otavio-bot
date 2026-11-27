import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computersView } from "../src/customer/computers.ts";
import { VpsProviderError } from "../src/computers/provider.ts";
import { tick } from "../src/jobs/handlers.ts";
import { createAgent } from "../src/node-agent/main.ts";
import { createApp } from "../src/server/app.ts";
import { billingFixture, type BillingFixture } from "./billing-fixture.ts";
import { FakeDocker } from "./fake-docker.ts";
import { FakeVps } from "./fake-vps.ts";
import { advance, client, sessionCookie, TEST_URL } from "./helpers.ts";

type Row = Record<string, any>;
let seq = 0;

async function registerSharedNode(f: BillingFixture) {
  const created = await f.api.post("/api/instances/nodes", { name: `compartilhada-${++seq}`, publicIp: "200.141.20.53", capacityInstances: 20 });
  expect(created.status).toBe(201);
  return created.data as { node: { id: string }; token: string };
}

function agentFor(f: BillingFixture, token: string, docker = new FakeDocker()) {
  const app = createApp(f.ctx);
  const appFetch = ((input: RequestInfo | URL, init?: RequestInit) => app.request(String(input), init, { incoming: { socket: { remoteAddress: "198.51.100.9" } } })) as typeof fetch;
  const agent = createAgent({
    adminUrl: TEST_URL, token, socketPath: "/nao/usado", network: "arkobot-instances", proxyContainer: null, entrypoint: "websecure", certResolver: "letsencrypt",
    trustedProxies: null, registryAuth: null, relayImage: "ghcr.io/otaviobmarques/arkobot-node-agent:latest",
  }, { docker, fetch: appFetch, log: () => undefined });
  return { agent, docker };
}

const machinesOf = async (f: BillingFixture, orgId: string): Promise<Row[]> =>
  (await f.ctx.db.query<Row>("SELECT * FROM vps_machines WHERE organization_id = $1 ORDER BY created_at", [orgId])).rows;
const instanceOf = async (f: BillingFixture, orgId: string): Promise<Row> =>
  (await f.ctx.db.query<Row>("SELECT * FROM instances WHERE organization_id = $1 AND decommissioned_at IS NULL", [orgId])).rows[0]!;

async function pay(f: BillingFixture, sub: { provider_subscription_id: string }, id: string, value: number, date = "2026-11-25") {
  const answer = await f.webhook(f.fake.paymentEvent("PAYMENT_RECEIVED", {
    id, subscription: sub.provider_subscription_id, value, status: "RECEIVED", billingType: "PIX", dueDate: date, paymentDate: date,
  }));
  expect(answer.status).toBe(200);
}

const enrollTokenOf = (script: string) => /ENROLL='(arko_enroll_[^']+)'/.exec(script)![1]!;

describe("computador próprio (VPS)", () => {
  let f: BillingFixture;
  let hetzner: FakeVps;
  let hostinger: FakeVps;
  beforeEach(async () => {
    f = await billingFixture();
    hetzner = new FakeVps("hetzner");
    hostinger = new FakeVps("hostinger");
    f.ctx.vps = { hetzner, hostinger, contabo: new FakeVps("contabo") };
    await f.ctx.db.query("UPDATE plans SET trial_days = 0");
  });
  afterEach(() => f.close());

  it("Profissional pago → pedido pendente → aprovar → compra uma vez → inscrição → ArkoBot no computador próprio, pela borda", async () => {
    const shared = await registerSharedNode(f);
    const orgId = await f.newClient("Contabilidade Alfa");
    const sub = await f.subscribe(orgId, "profissional");
    await tick(f.ctx);
    expect(await machinesOf(f, orgId), "nothing before the first payment").toEqual([]);

    await pay(f, sub, "pay_p1", 599);
    await tick(f.ctx);
    const [pending] = await machinesOf(f, orgId);
    expect(pending).toMatchObject({ status: "awaiting_approval", purpose: "home", provider: "hetzner", plan_ref: "cx23", region: "fsn1", monthly_cost_cents: 2600 });
    expect(hetzner.orders).toEqual([]);
    await tick(f.ctx);
    expect(hetzner.orders, "automatic purchase is off by default").toEqual([]);

    const listed = await f.api.get("/api/computers");
    expect(listed.data.settings).toMatchObject({ auto_purchase: false, provider: "hetzner" });
    expect(listed.data.machines[0]).toMatchObject({ id: pending!.id, organization_name: "Contabilidade Alfa", status: "awaiting_approval" });

    expect((await f.api.post(`/api/computers/${pending!.id}/approve`)).status).toBe(200);
    await tick(f.ctx);
    await tick(f.ctx);
    expect(hetzner.orders).toHaveLength(1);
    const order = hetzner.orders[0]!;
    expect(order).toMatchObject({ planRef: "cx23", regionRef: "fsn1" });
    expect(order.script).toContain(`MACHINE='${pending!.id}'`);
    expect(order.script).toContain("EDGE_IP='200.141.20.53'");
    expect(order.script).not.toMatch(/arko_node_[A-Za-z0-9_-]{43}/);
    const bought = (await machinesOf(f, orgId))[0]!;
    expect(bought).toMatchObject({ status: "provisioning", provider_vm_id: "1001", ipv4: "198.51.100.1" });
    expect(bought.enroll_token_hash).toMatch(/^[0-9a-f]{64}$/);

    // Enrollment: wrong token or wrong address refused; the right one gets a node token.
    const enroll = enrollTokenOf(order.script);
    const fromVps = client(f.ctx, undefined, "198.51.100.1");
    expect((await fromVps.post("/api/agent/v1/enroll", { machineId: bought.id, enrollToken: `arko_enroll_${"x".repeat(43)}` })).status).toBe(401);
    expect((await client(f.ctx, undefined, "203.0.113.50").post("/api/agent/v1/enroll", { machineId: bought.id, enrollToken: enroll })).status).toBe(401);
    const enrolled = await fromVps.post("/api/agent/v1/enroll", { machineId: bought.id, enrollToken: enroll });
    expect(enrolled.status).toBe(200);
    expect(enrolled.data.token).toMatch(/^arko_node_/);
    const node = (await f.ctx.db.query<Row>("SELECT * FROM nodes WHERE vps_machine_id = $1", [bought.id])).rows[0]!;
    expect(node).toMatchObject({ kind: "dedicated", public_ip: "198.51.100.1", capacity_instances: 1 });

    // The instance was made on the shared node before the VPS existed and never ran there.
    const before = await instanceOf(f, orgId);
    expect(before.node_id).toBe(shared.node.id);

    const own = agentFor(f, enrolled.data.token);
    await own.agent.once();
    await tick(f.ctx);
    expect((await machinesOf(f, orgId))[0]).toMatchObject({ status: "running", enroll_token_hash: null });
    const moved = await instanceOf(f, orgId);
    expect(moved).toMatchObject({ node_id: node.id, previous_node_id: shared.node.id, mode: "dedicated" });

    await own.agent.once();
    expect(own.docker.byName(`arkoinst-${moved.slug}`)?.running).toBe(true);
    expect((await instanceOf(f, orgId)).state).toBe("ready");

    const edge = agentFor(f, shared.token);
    await edge.agent.once();
    const relay = edge.docker.byName(`arkoedge-${moved.slug}`)!;
    expect(relay.running).toBe(true);
    expect(relay.labels).toMatchObject({
      "arkobot.edge": "true", "arkobot.instance": moved.id,
      [`traefik.tcp.routers.arkoedge-${moved.slug}.rule`]: `HostSNI(\`${moved.slug}.arkobot.com.br\`)`,
      [`traefik.tcp.routers.arkoedge-${moved.slug}.tls.passthrough`]: "true",
    });
    expect(relay.body.Env).toEqual(["RELAY_TARGET=198.51.100.1:443", "RELAY_PORT=8443"]);
    expect((await instanceOf(f, orgId)).previous_node_id, "the shared node reported the old container gone").toBeNull();
    edge.docker.calls = [];
    await edge.agent.once();
    expect(edge.docker.calls).toEqual([]);

    // The customer sees it, in their words.
    const accountId = (await f.ctx.db.query<Row>("SELECT account_id FROM memberships WHERE organization_id = $1", [orgId])).rows[0]!.account_id;
    const view = await computersView(f.ctx, { session: { accountId } as never, ip: "203.0.113.1", userAgent: null });
    expect(view.computers).toEqual([{ id: bought.id, purpose: "home", status: "ready", since: expect.any(String), endsAt: null }]);
    expect(JSON.stringify(view)).not.toContain("198.51.100.1");

    // Cancelled: the machine waits for the operator, who must take the ArkoBot off it first; Hetzner deletes at once.
    expect((await f.api.post(`/api/clients/${orgId}/subscription/cancel`, { reason: "cliente pediu para sair" })).status).toBe(200);
    await tick(f.ctx);
    expect((await machinesOf(f, orgId))[0]).toMatchObject({ status: "release_pending" });
    expect(hetzner.cancels).toEqual([]);
    const refused = await f.api.post(`/api/computers/${bought.id}/release`, { reason: "fim do contrato", confirm: true });
    expect(refused.status).toBe(409);
    expect((await f.api.post(`/api/instances/${moved.id}/decommission`, { reason: "fim do contrato", confirm: true })).status).toBe(200);
    const released = await f.api.post(`/api/computers/${bought.id}/release`, { reason: "fim do contrato", confirm: true });
    expect(released.status).toBe(200);
    expect(released.data.deleted).toBe(true);
    expect(hetzner.cancels.map((ref) => ref.vmId)).toEqual(["1001"]);
    expect((await machinesOf(f, orgId))[0]).toMatchObject({ status: "deleted" });
  });

  it("compra automática só compra o que foi pago; Hostinger em 202 e máquina sem instalação", async () => {
    await registerSharedNode(f);
    const settings = (await f.api.get("/api/computers")).data.settings;
    const put = await f.api.put("/api/computers/settings", {
      autoPurchase: true, provider: "hostinger", hetznerServerType: settings.hetzner_server_type, hetznerLocation: settings.hetzner_location,
      hetznerImage: null, hetznerMonthlyCostCents: 2600, hostingerItemId: "hostingercombr-vps-kvm1-brl-1m", hostingerTemplateId: null,
      hostingerDataCenterId: null, hostingerMonthlyCostCents: 8799, hostingerSetupFeeCents: 0, contaboProductId: "V91", contaboRegion: "US-east",
      contaboImageId: null, contaboMonthlyCostCents: 0, contaboSetupFeeCents: 0,
    });
    expect(put.status).toBe(200);
    const orgId = await f.newClient("Padaria Beta");
    const sub = await f.subscribe(orgId, "essencial");
    const addonId = (await f.ctx.db.query<Row>("SELECT id FROM addons WHERE code = 'computador-adicional'")).rows[0]!.id;
    expect((await f.api.post(`/api/clients/${orgId}/subscription/addons`, { addonId, quantity: 1 })).status).toBe(200);

    await pay(f, sub, "pay_b1", 159);
    await tick(f.ctx);
    expect(await machinesOf(f, orgId), "the add-on was not in the paid invoice yet").toEqual([]);

    hostinger.pending = true;
    hostinger.initialPhase = "needs_setup";
    advance(f.ctx, 31 * 86_400_000);
    await pay(f, sub, "pay_b2", 318, "2026-12-26");
    await tick(f.ctx);
    await tick(f.ctx);
    const [machine] = await machinesOf(f, orgId);
    expect(machine).toMatchObject({ provider: "hostinger", status: "provisioning", provider_order_id: "ord_1001", provider_subscription_id: "sub_1001", post_install_script_id: "script_1001" });
    expect(hostinger.orders).toHaveLength(1);

    advance(f.ctx, 3 * 60_000);
    await tick(f.ctx);
    expect(hostinger.setups).toEqual(["1001"]);
    advance(f.ctx, 3 * 60_000);
    await tick(f.ctx);
    expect(hostinger.setups, "installed once").toEqual(["1001"]);
    expect(hostinger.orders, "bought once").toHaveLength(1);
    expect((await machinesOf(f, orgId))[0]).toMatchObject({ provider_vm_id: "1001", ipv4: "198.51.100.1" });
  });

  it("falha na compra: recusa clara pode tentar de novo; resposta incerta nunca recompra sozinha", async () => {
    await f.ctx.db.query("UPDATE vps_settings SET auto_purchase = true");
    const orgId = await f.newClient("Oficina Gama");
    const sub = await f.subscribe(orgId, "profissional");
    hetzner.failNext = new VpsProviderError("Hetzner: server type not available in location", 422, false);
    await pay(f, sub, "pay_g1", 599);
    await tick(f.ctx);
    await tick(f.ctx);
    const [failed] = await machinesOf(f, orgId);
    expect(failed).toMatchObject({ status: "failed", status_reason: "o provedor recusou a compra" });
    await tick(f.ctx);
    expect(hetzner.orders, "a failed machine still holds the unit").toHaveLength(1);
    expect((await f.api.post(`/api/computers/${failed!.id}/retry`)).status).toBe(200);
    await tick(f.ctx);
    expect(hetzner.orders).toHaveLength(2);
    expect((await machinesOf(f, orgId))[0]!.status).toBe("provisioning");

    const other = await f.newClient();
    const sub2 = await f.subscribe(other, "profissional");
    hetzner.failNext = new VpsProviderError("Hetzner sem resposta (TimeoutError)", null, true);
    await pay(f, sub2, "pay_d1", 599);
    await tick(f.ctx);
    await tick(f.ctx);
    const [uncertain] = await machinesOf(f, other);
    expect(uncertain).toMatchObject({ status: "failed" });
    expect(uncertain!.last_error).toMatch(/^\[compra incerta\]/);
    expect((await f.api.post(`/api/computers/${uncertain!.id}/retry`)).status).toBe(409);
    expect((await f.api.post(`/api/computers/${uncertain!.id}/discard`, { reason: "conferido no console" })).status).toBe(409);
    expect(hetzner.orders).toHaveLength(3);
  });

  it("a migração 0012 roda de novo sem erro e sem mudar as configurações", async () => {
    await f.ctx.db.query("UPDATE vps_settings SET auto_purchase = true");
    await f.ctx.db.query(readFileSync(new URL("../migrations/0012_computadores_vps.sql", import.meta.url), "utf8"));
    expect((await f.ctx.db.query<Row>("SELECT auto_purchase, provider FROM vps_settings")).rows).toEqual([{ auto_purchase: true, provider: "hetzner" }]);
    expect((await f.ctx.db.query<Row>("SELECT name FROM addons WHERE code = 'computador-adicional'")).rows[0]!.name).toBe("Computador próprio (VPS)");
  });

  it("só o dono muda a compra automática; leitura não aprova", async () => {
    const viewer = client(f.ctx, await sessionCookie(f.ctx, "viewer"));
    expect((await viewer.get("/api/computers")).status).toBe(200);
    const operator = client(f.ctx, await sessionCookie(f.ctx, "operator"));
    const current = (await operator.get("/api/computers")).data.settings;
    expect((await operator.put("/api/computers/settings", { ...current, autoPurchase: true })).status).toBe(403);
  });
});
