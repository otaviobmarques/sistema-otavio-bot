import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { diskUsageCopy } from "../src/customer/disk-usage.ts";
import { tick } from "../src/jobs/handlers.ts";
import { createDiskMeter } from "../src/node-agent/disk.ts";
import { createAgent } from "../src/node-agent/main.ts";
import { cloudRequestSignature } from "../src/provisioning/cloud-request.ts";
import { bootstrapContext } from "../src/provisioning/instances.ts";
import type { StatusReport } from "../src/provisioning/protocol.ts";
import { diskStateOf, GB, nextNotice } from "../src/provisioning/storage.ts";
import { createApp } from "../src/server/app.ts";
import { billingFixture, type BillingFixture } from "./billing-fixture.ts";
import { FakeDocker } from "./fake-docker.ts";
import { cnpj, customerClient, TEST_URL, type TestContext } from "./helpers.ts";

type Row = Record<string, any>;
const NODE = randomUUID();
const MIN = 60_000;

function report(...ids: string[]): StatusReport {
  return { agentVersion: "t", orphans: [], error: null, instances: ids.map((id) => ({ id, state: "running", health: "healthy", containerId: null, revision: null, error: null })) };
}

describe("medição do disco no agente", () => {
  it("mede só os volumes do ArkoBot deste nó, no máximo a cada 10 minutos, e repete a última medição se o Docker falhar", async () => {
    const docker = new FakeDocker();
    const mine = randomUUID();
    const other = randomUUID();
    docker.volumes.set(`arkoinst-${mine}-data`, { "arkobot.managed": "true", "arkobot.node": NODE, "arkobot.instance": mine });
    docker.volumes.set(`arkoinst-${other}-data`, { "arkobot.managed": "true", "arkobot.node": randomUUID(), "arkobot.instance": other });
    docker.volumes.set("n8n_data", { "arkobot.instance": other });
    docker.volumeBytes.set(`arkoinst-${mine}-data`, 3 * GB);
    docker.volumeBytes.set(`arkoinst-${other}-data`, 9 * GB);
    docker.volumeBytes.set("n8n_data", 7 * GB);
    let now = Date.parse("2026-11-25T12:00:00Z");
    const logs: string[] = [];
    const meter = createDiskMeter(docker, { now: () => now, log: (line) => logs.push(line) });

    const first = report(mine, other);
    await meter.attach(first, NODE);
    expect(first.instances[0]!.disk).toEqual({ bytes: 3 * GB, measuredAt: "2026-11-25T12:00:00.000Z" });
    expect(first.instances[1]!.disk).toBeUndefined();
    expect(docker.dfCalls).toBe(1);

    // Within the interval: the cached numbers, no new df.
    docker.volumeBytes.set(`arkoinst-${mine}-data`, 4 * GB);
    now += 9 * MIN;
    const cached = report(mine);
    await meter.attach(cached, NODE);
    expect(cached.instances[0]!.disk).toEqual({ bytes: 3 * GB, measuredAt: "2026-11-25T12:00:00.000Z" });
    expect(docker.dfCalls).toBe(1);

    now += MIN;
    const fresh = report(mine);
    await meter.attach(fresh, NODE);
    expect(fresh.instances[0]!.disk).toEqual({ bytes: 4 * GB, measuredAt: "2026-11-25T12:10:00.000Z" });

    docker.dfFails = true;
    now += 10 * MIN;
    const failed = report(mine);
    await meter.attach(failed, NODE);
    expect(failed.instances[0]!.disk?.bytes).toBe(4 * GB);
    expect(logs.join("\n")).toContain("não consegui medir os volumes");
    expect(docker.dfCalls).toBe(3);

    // A size Docker does not know (-1) is left out.
    docker.dfFails = false;
    docker.volumeBytes.delete(`arkoinst-${mine}-data`);
    now += 10 * MIN;
    const unknown = report(mine);
    await meter.attach(unknown, NODE);
    expect(unknown.instances[0]!.disk).toBeUndefined();
  });

  it("não segura o relatório quando o df demora: a medição termina em segundo plano", async () => {
    const id = randomUUID();
    let release!: () => void;
    const slow = {
      volumeUsage: () => new Promise<Awaited<ReturnType<FakeDocker["volumeUsage"]>>>((resolve) => {
        release = () => resolve([{ Name: "v", Labels: { "arkobot.managed": "true", "arkobot.node": NODE, "arkobot.instance": id }, UsageData: { Size: 123, RefCount: 1 } }]);
      }),
    };
    const meter = createDiskMeter(slow, { waitMs: 5 });
    const first = report(id);
    await meter.attach(first, NODE);
    expect(first.instances[0]!.disk).toBeUndefined();
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const next = report(id);
    await meter.attach(next, NODE);
    expect(next.instances[0]!.disk?.bytes).toBe(123);
  });
});

describe("estado do espaço", () => {
  it("ok < 80% ≤ warning < 100% ≤ full < 110% ≤ over; sem limite no plano, sem estado", () => {
    const quota = 5 * GB;
    expect(diskStateOf(0.79 * quota, quota)).toBe("ok");
    expect(diskStateOf(0.8 * quota, quota)).toBe("warning");
    expect(diskStateOf(quota, quota)).toBe("full");
    expect(diskStateOf(1.0999 * quota, quota)).toBe("full");
    expect(diskStateOf(1.1 * quota, quota)).toBe("over");
    expect(diskStateOf(100 * GB, null)).toBeNull();
    expect(nextNotice("warning", 0.85, 0)).toEqual({ send: 80, notified: 80 });
    expect(nextNotice("over", 1.2, 0)).toEqual({ send: 100, notified: 100 });
    expect(nextNotice("warning", 0.95, 100)).toEqual({ send: null, notified: 100 });
    expect(nextNotice("warning", 0.85, 100)).toEqual({ send: null, notified: 80 });
    expect(nextNotice("warning", 0.85, 80)).toEqual({ send: null, notified: 80 });
    expect(nextNotice("ok", 0.75, 80)).toEqual({ send: null, notified: 80 });
    expect(nextNotice("ok", 0.6, 100)).toEqual({ send: null, notified: 0 });
  });

  it("o cartão mostra \"X GB de Y GB usados\" e avisa a partir de 80%", () => {
    const at = (gb: number, state: "ok" | "warning" | "full" | "over") => diskUsageCopy({ usedBytes: gb * GB, quotaBytes: 5 * GB, state, measuredAt: "2026-11-25T12:00:00.000Z" });
    expect(at(1.5, "ok")).toEqual({ line: "1,5 GB de 5 GB usados", percent: 30, tone: "ok", warning: null });
    expect(at(4.2, "warning")).toMatchObject({ percent: 84, tone: "warning", warning: expect.stringContaining("mais de 80%") });
    expect(at(5, "full")).toMatchObject({ percent: 100, tone: "danger", warning: expect.stringContaining("Seu espaço acabou") });
    expect(at(6, "over")).toMatchObject({ line: "6 GB de 5 GB usados", percent: 100, warning: expect.stringContaining("Seu espaço acabou: apague arquivos ou mude de plano") });
  });
});

function codeFrom(ctx: TestContext, to: string): string {
  const last = [...ctx.mailer.sent].reverse().find((mail) => mail.to === to);
  const match = last?.text.match(/(\d{4})-(\d{4})/);
  if (!match) throw new Error("nenhum código enviado");
  return `${match[1]}${match[2]}`;
}

describe("limite de espaço de ponta a ponta", () => {
  let f: BillingFixture;
  beforeEach(async () => {
    f = await billingFixture();
  });
  afterEach(() => f.close());

  it("agente mede → Admin compara com o plano → um e-mail aos 80% e um aos 100% → a instância fica sabendo", async () => {
    // A customer instance that answers the Admin's signed requests, as server/routes/cloud-signed.ts does.
    const seen: { path: string; body: any }[] = [];
    const original = f.ctx.fetch;
    f.ctx.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (!url.hostname.endsWith(".arkobot.com.br")) return original(input, init);
      const row = (await f.ctx.db.query<Row>("SELECT id, bootstrap_secret_enc FROM instances WHERE public_url = $1", [url.origin])).rows[0]!;
      const secret = f.ctx.box.decrypt(row.bootstrap_secret_enc, bootstrapContext(row.id));
      const headers = new Headers(init?.headers);
      const body = String(init?.body ?? "");
      const expected = cloudRequestSignature(secret, headers.get("x-omb-cloud-timestamp")!, headers.get("x-omb-cloud-nonce")!, init?.method ?? "GET", url.pathname, body);
      if (headers.get("x-omb-cloud-signature") !== `v1=${expected}`) return Response.json({ error: "invalid_signature" }, { status: 401 });
      seen.push({ path: url.pathname, body: JSON.parse(body) });
      return Response.json({ ok: true });
    }) as typeof fetch;

    const created = await f.api.post("/api/instances/nodes", { name: "vps-espaco", publicIp: "200.141.20.53", capacityInstances: 20 });
    const email = "dona@livraria.com.br";
    const anonymous = customerClient(f.ctx);
    await anonymous.post("/api/conta/auth/otp/request", { email });
    const verified = await anonymous.post("/api/conta/auth/otp/verify", { email, code: codeFrom(f.ctx, email) });
    const api = customerClient(f.ctx, (verified.headers.get("set-cookie") ?? "").split(";")[0]!);
    const signup = await api.post("/api/conta/cadastro", {
      name: "Ana Souza", phone: "(11) 98765-4321", companyName: "Livraria Central", documentType: "cnpj", document: cnpj("412345678901"), acceptTerms: true,
    });
    expect(signup.status).toBe(200);
    expect((await api.post("/api/conta/assinatura", { plan: "inicial", billingType: "PIX" })).status).toBe(201);
    await api.get("/api/conta/arkobot");

    const app = createApp(f.ctx);
    const appFetch = ((input: RequestInfo | URL, init?: RequestInit) => app.request(String(input), init, { incoming: { socket: { remoteAddress: "198.51.100.9" } } })) as typeof fetch;
    const docker = new FakeDocker();
    const agent = createAgent({
      adminUrl: TEST_URL, token: created.data.token, socketPath: "/nao/usado", network: "arkobot-instances", entrypoint: "websecure", certResolver: "letsencrypt",
      trustedProxies: null, registryAuth: null,
    }, { docker, fetch: appFetch, log: () => undefined, now: () => f.ctx.now().getTime() });
    const instanceRow = async () => (await f.ctx.db.query<Row>("SELECT * FROM instances WHERE organization_id = $1", [signup.data.organization.id])).rows[0]!;
    const storageMails = () => f.ctx.mailer.sent.filter((mail) => /espaço/.test(mail.subject));
    const storageSyncs = () => seen.filter((call) => call.path === "/api/cloud/storage");

    // First poll: the container is made; its new volume has no size yet.
    await agent.once();
    const instance = await instanceRow();
    expect(instance).toMatchObject({ state: "ready", disk_used_bytes: null, disk_state: null });
    const volume = `arkoinst-${instance.id}-data`;
    const measure = async (gb: number) => {
      docker.volumeBytes.set(volume, Math.round(gb * GB));
      f.ctx.clock.now = new Date(f.ctx.clock.now.getTime() + 10 * MIN);
      await agent.once();
      await tick(f.ctx);
      return instanceRow();
    };

    // Inicial: 5 GB. 60%: fine, nothing sent.
    expect(await measure(3)).toMatchObject({ disk_state: "ok", disk_notified_percent: 0 });
    expect(Number((await instanceRow()).disk_used_bytes)).toBe(3 * GB);
    expect(Number((await instanceRow()).disk_quota_bytes)).toBe(5 * GB);
    expect(storageMails()).toEqual([]);
    expect(storageSyncs()).toEqual([]);
    expect((await api.get("/api/conta/arkobot")).data.disk).toMatchObject({ usedBytes: 3 * GB, quotaBytes: 5 * GB, state: "ok" });

    // 84%: one e-mail, and the instance learns it.
    expect(await measure(4.2)).toMatchObject({ disk_state: "warning", disk_notified_percent: 80, disk_state_synced: "warning" });
    expect(storageMails().map((mail) => [mail.to, mail.subject])).toEqual([[email, "Seu ArkoBot está chegando no limite de espaço"]]);
    expect(storageMails()[0]!.text).toContain("4,2 GB de 5 GB");
    expect(storageMails()[0]!.from).toBe(f.ctx.config.customerMailFrom);
    expect(storageSyncs().at(-1)!.body).toEqual({ v: 1, state: "warning", usedBytes: Math.round(4.2 * GB), quotaBytes: 5 * GB });

    // Still 80-something: no second e-mail, no second sync.
    await measure(4.4);
    expect(storageMails()).toHaveLength(1);
    expect(storageSyncs()).toHaveLength(1);

    // 102%: the second e-mail.
    expect(await measure(5.1)).toMatchObject({ disk_state: "full", disk_notified_percent: 100, disk_state_synced: "full" });
    expect(storageMails().map((mail) => mail.subject)).toEqual(["Seu ArkoBot está chegando no limite de espaço", "Seu ArkoBot ficou sem espaço"]);

    // 112%: over; no third e-mail, but the instance must now refuse new files.
    expect(await measure(5.6)).toMatchObject({ disk_state: "over", disk_state_synced: "over" });
    expect(storageMails()).toHaveLength(2);
    expect(storageSyncs().at(-1)!.body).toMatchObject({ v: 1, state: "over" });
    const card = (await api.get("/api/conta/arkobot")).data;
    expect(card.disk).toMatchObject({ state: "over", quotaBytes: 5 * GB });
    expect(diskUsageCopy(card.disk).warning).toContain("Seu espaço acabou: apague arquivos ou mude de plano");
    const listed = await f.api.get("/api/instances");
    expect(listed.data.instances[0]).toMatchObject({ disk_state: "over" });
    expect(Number(listed.data.instances[0].disk_used_bytes)).toBe(Math.round(5.6 * GB));

    // Files deleted: back to ok, and the e-mails can come again on a later crossing.
    expect(await measure(2)).toMatchObject({ disk_state: "ok", disk_notified_percent: 0, disk_state_synced: "ok" });
    expect(storageSyncs().at(-1)!.body).toMatchObject({ state: "ok" });
    await measure(4.5);
    expect(storageMails()).toHaveLength(3);
  });
});
