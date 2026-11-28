import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assignComputers, computerId, sshAccessFor, unassignComputer } from "../src/computers/assign.ts";
import { DEFAULT_RELAY_IMAGE } from "../src/node-agent/edges.ts";
import { createAgent } from "../src/node-agent/main.ts";
import { cloudRequestSignature } from "../src/provisioning/cloud-request.ts";
import { bootstrapContext } from "../src/provisioning/instances.ts";
import { createApp } from "../src/server/app.ts";
import { billingFixture, type BillingFixture } from "./billing-fixture.ts";
import { FakeDocker } from "./fake-docker.ts";
import { cnpj, customerClient, TEST_URL, type TestContext } from "./helpers.ts";

type Row = Record<string, any>;
const HOST_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl";
const ARKO_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIArkoBotPublicKeyOfTheCustomerHome0000 arkobot-cloud";

function codeFrom(ctx: TestContext, to: string): string {
  const match = [...ctx.mailer.sent].reverse().find((mail) => mail.to === to)?.text.match(/(\d{4})-(\d{4})/);
  if (!match) throw new Error("nenhum código enviado");
  return `${match[1]}${match[2]}`;
}

let seq = 0;
async function readyCustomer(f: BillingFixture, token: string) {
  const email = `pc${++seq}@lojapc${seq}.com.br`;
  const anonymous = customerClient(f.ctx);
  await anonymous.post("/api/conta/auth/otp/request", { email });
  const verified = await anonymous.post("/api/conta/auth/otp/verify", { email, code: codeFrom(f.ctx, email) });
  const api = customerClient(f.ctx, (verified.headers.get("set-cookie") ?? "").split(";")[0]!);
  const done = await api.post("/api/conta/cadastro", {
    name: "Caio Reis", phone: "(11) 98765-4321", companyName: `Loja PC ${seq}`, documentType: "cnpj",
    document: cnpj(String(700000000000 + seq * 7919).slice(0, 12)), acceptTerms: true,
  });
  const orgId = done.data.organization.id as string;
  expect((await api.post("/api/conta/assinatura", { plan: "inicial", billingType: "PIX" })).status).toBe(201);
  await api.get("/api/conta/arkobot");
  const app = createApp(f.ctx);
  const docker = new FakeDocker();
  docker.images.add(DEFAULT_RELAY_IMAGE);
  const agent = createAgent({ adminUrl: TEST_URL, token, socketPath: "/x", network: "arkobot-instances", proxyContainer: null, entrypoint: "websecure",
    certResolver: "letsencrypt", trustedProxies: null, registryAuth: null },
  { docker, fetch: ((input: RequestInfo | URL, init?: RequestInit) => app.request(String(input), init, { incoming: { socket: { remoteAddress: "198.51.100.9" } } })) as typeof fetch, log: () => undefined });
  await agent.once();
  const instance = (await f.ctx.db.query<Row>("SELECT * FROM instances WHERE organization_id = $1", [orgId])).rows[0]!;
  expect(instance.state).toBe("ready");
  return { orgId, instance };
}

/** The customer's ArkoBot answering /api/cloud/computers with a valid signature check. */
function fakeHome(f: BillingFixture, options: { removeStatus?: number } = {}) {
  const calls: { method: string; body: any }[] = [];
  const original = f.ctx.fetch;
  f.ctx.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (!url.hostname.endsWith(".arkobot.com.br")) return original(input, init);
    const row = (await f.ctx.db.query<Row>("SELECT id, bootstrap_secret_enc FROM instances WHERE public_url = $1", [url.origin])).rows[0]!;
    const secret = f.ctx.box.decrypt(row.bootstrap_secret_enc, bootstrapContext(row.id));
    const headers = new Headers(init?.headers);
    const body = String(init?.body ?? "");
    const method = init?.method ?? "GET";
    const expected = cloudRequestSignature(secret, headers.get("x-omb-cloud-timestamp")!, headers.get("x-omb-cloud-nonce")!, method, url.pathname, body);
    if (headers.get("x-omb-cloud-signature") !== `v1=${expected}`) return Response.json({ error: "invalid_signature" }, { status: 401 });
    calls.push({ method, body: body ? JSON.parse(body) : null });
    if (method === "GET") return Response.json({ v: 1, publicKey: ARKO_KEY, computers: [] });
    const parsed = JSON.parse(body);
    if (parsed.action === "remove") return Response.json(options.removeStatus === 409 ? { error: "in_use" } : { ok: true, removed: true }, { status: options.removeStatus ?? 200 });
    return Response.json({ ok: true, alias: `arko-${parsed.computer.id}`, check: { ok: true } });
  }) as typeof fetch;
  return calls;
}

async function extraComputer(f: BillingFixture, orgId: string) {
  const machine = (await f.ctx.db.query<Row>(
    `INSERT INTO vps_machines (provider, organization_id, purpose, status, ipv4, plan_ref, plan_code) VALUES ('hetzner', $1, 'computer', 'running', '203.0.113.20', 'cx23', 'cx23') RETURNING *`,
    [orgId])).rows[0]!;
  const node = (await f.ctx.db.query<Row>(
    "INSERT INTO nodes (name, kind, vps_machine_id, public_ip, status) VALUES ($1, 'dedicated', $2, '203.0.113.20', 'active') RETURNING *",
    [`vps-${machine.id.slice(0, 8)}`, machine.id])).rows[0]!;
  return { machine, node };
}

describe("computadores extras ligados aos bots", () => {
  let f: BillingFixture;
  beforeEach(async () => {
    f = await billingFixture();
  });
  afterEach(() => f.close());

  it("chave do ArkoBot → acesso SSH na VPS limitado ao endereço dele → chaves de host → computador entregue", async () => {
    const created = await f.api.post("/api/instances/nodes", { name: "vps-shared-1", publicIp: "77.216.129.157", capacityInstances: 10 });
    const { orgId, instance } = await readyCustomer(f, created.data.token);
    const calls = fakeHome(f);
    const { machine, node } = await extraComputer(f, orgId);
    // Nobody may log in before the ArkoBot's key is known.
    expect(await sshAccessFor(f.ctx.db, node.id)).toEqual({ user: "arkobot", keys: [] });
    expect(await sshAccessFor(f.ctx.db, created.data.node.id)).toBeNull();

    expect(await assignComputers(f.ctx)).toEqual({ keysRead: 1, assigned: 0, waiting: 0 });
    expect(await sshAccessFor(f.ctx.db, node.id)).toEqual({ user: "arkobot", keys: [`from="77.216.129.157",no-agent-forwarding,no-X11-forwarding ${ARKO_KEY}`] });

    // No host keys reported yet: it waits.
    expect(await assignComputers(f.ctx)).toMatchObject({ assigned: 0, waiting: 1 });
    await f.ctx.db.query("UPDATE nodes SET ssh_host_keys = $2 WHERE id = $1", [node.id, [HOST_KEY]]);
    expect(await assignComputers(f.ctx)).toMatchObject({ assigned: 1 });
    expect(calls.at(-1)).toEqual({ method: "POST", body: { v: 1, action: "add", computer: {
      id: computerId(machine.id), name: `Computador ${machine.id.slice(0, 8)}`, host: "203.0.113.20", user: "arkobot", hostKeys: [HOST_KEY] } } });
    const assigned = (await f.ctx.db.query<Row>("SELECT assigned_instance_id, assign_error FROM vps_machines WHERE id = $1", [machine.id])).rows[0]!;
    expect(assigned).toEqual({ assigned_instance_id: instance.id, assign_error: null });
    // Once handed over, nothing more is sent.
    const before = calls.length;
    await assignComputers(f.ctx);
    expect(calls.length).toBe(before);

    await unassignComputer(f.ctx, machine.id);
    expect(calls.at(-1)!.body).toEqual({ v: 1, action: "remove", id: computerId(machine.id) });
    expect((await f.ctx.db.query<Row>("SELECT assigned_instance_id FROM vps_machines WHERE id = $1", [machine.id])).rows[0]!.assigned_instance_id).toBeNull();
  });

  it("não devolve um computador que um bot ainda usa", async () => {
    const created = await f.api.post("/api/instances/nodes", { name: "vps-shared-2", publicIp: "77.216.129.157", capacityInstances: 10 });
    const { orgId } = await readyCustomer(f, created.data.token);
    fakeHome(f, { removeStatus: 409 });
    const { machine, node } = await extraComputer(f, orgId);
    await f.ctx.db.query("UPDATE nodes SET ssh_host_keys = $2 WHERE id = $1", [node.id, [HOST_KEY]]);
    await assignComputers(f.ctx);
    await assignComputers(f.ctx);
    await expect(unassignComputer(f.ctx, machine.id)).rejects.toMatchObject({ status: 409 });
  });

  it("o agente da VPS extra grava as chaves autorizadas e manda as chaves de host", async () => {
    const docker = new FakeDocker();
    docker.images.add(DEFAULT_RELAY_IMAGE);
    docker.runsToEnd.add("arkossh-keys");
    docker.runsToEnd.add("arkossh-hostkeys");
    docker.outputs.set("arkossh-hostkeys", `${HOST_KEY} root@vps\nnot a key\n`);
    const { createSshAccess } = await import("../src/node-agent/ssh-access.ts");
    const ssh = createSshAccess(docker, { image: DEFAULT_RELAY_IMAGE, log: () => undefined });
    expect(await ssh.apply("n1", { user: "arkobot", keys: ["from=\"1.2.3.4\" ssh-ed25519 AAAA"] })).toBeNull();
    const created = docker.calls.filter((call) => call.startsWith("create"));
    expect(created).toEqual(["create arkossh-keys"]);
    // Same keys: nothing written again.
    expect(await ssh.apply("n1", { user: "arkobot", keys: ["from=\"1.2.3.4\" ssh-ed25519 AAAA"] })).toBeNull();
    expect(docker.calls.filter((call) => call.startsWith("create"))).toHaveLength(1);
    expect(await ssh.hostKeys("n1")).toEqual([HOST_KEY]);
    expect(docker.containers.size).toBe(0);
  });
});
