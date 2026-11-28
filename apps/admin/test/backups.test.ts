import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startRelocation, sweepBackups } from "../src/backups/backups.ts";
import { presign } from "../src/backups/s3.ts";
import { tick } from "../src/jobs/handlers.ts";
import { DEFAULT_RELAY_IMAGE } from "../src/node-agent/edges.ts";
import { createAgent } from "../src/node-agent/main.ts";
import { helperName } from "../src/node-agent/tasks.ts";
import { upload } from "../src/node-agent/task-helper.ts";
import { SYSTEM } from "../src/audit.ts";
import { createApp } from "../src/server/app.ts";
import { billingFixture, type BillingFixture } from "./billing-fixture.ts";
import { FakeDocker } from "./fake-docker.ts";
import { cnpj, customerClient, TEST_URL, type TestContext } from "./helpers.ts";

type Row = Record<string, any>;
const S3 = "https://s3.test";

describe("assinatura S3 (SigV4)", () => {
  it("assina igual à biblioteca oficial da AWS (mesmos parâmetros)", () => {
    // Expected value produced by @aws-sdk/s3-request-presigner 3.700.0 for the same call (forcePathStyle, signingDate).
    const settings = { endpoint: "https://usc1.contabostorage.com", region: "us-central-1", bucket: "arko-backups", accessKeyId: "AKIDEXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY" };
    const url = new URL(presign(settings, "PUT", "arkobot/otavio-marques/2026-11-28-abc def.tgz",
      { partNumber: "3", uploadId: "up/id+x=", "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD", "x-id": "UploadPart" }, 3600, new Date("2026-11-28T10:00:00Z")));
    expect(url.pathname).toBe("/arko-backups/arkobot/otavio-marques/2026-11-28-abc%20def.tgz");
    expect(url.searchParams.get("X-Amz-Signature")).toBe("3af38069e4ea3059f397a9ccdbdd4415023c84052f9be12de6de825cc3f3765a");
  });
});

function codeFrom(ctx: TestContext, to: string): string {
  const last = [...ctx.mailer.sent].reverse().find((mail) => mail.to === to);
  const match = last?.text.match(/(\d{4})-(\d{4})/);
  if (!match) throw new Error("nenhum código enviado");
  return `${match[1]}${match[2]}`;
}

let seq = 0;
async function customer(ctx: TestContext, company: string) {
  const email = `bk${++seq}@${company.toLowerCase().replace(/\W/g, "")}.com.br`;
  const anonymous = customerClient(ctx);
  await anonymous.post("/api/conta/auth/otp/request", { email });
  const verified = await anonymous.post("/api/conta/auth/otp/verify", { email, code: codeFrom(ctx, email) });
  const cookie = (verified.headers.get("set-cookie") ?? "").split(";")[0]!;
  const api = customerClient(ctx, cookie);
  const done = await api.post("/api/conta/cadastro", {
    name: "Rita Dias", phone: "(11) 98765-4321", companyName: company, documentType: "cnpj",
    document: cnpj(String(600000000000 + seq * 7919).slice(0, 12)), acceptTerms: true,
  });
  if (done.status !== 200) throw new Error(JSON.stringify(done.data));
  return { api, orgId: done.data.organization.id as string };
}

/** An S3-compatible store in memory: multipart create, parts, complete, abort, get, delete. */
function fakeStore(f: BillingFixture) {
  const objects = new Map<string, Buffer>();
  const uploads = new Map<string, Map<number, Buffer>>();
  const calls: string[] = [];
  const original = f.ctx.fetch;
  const handler = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.origin !== S3) return original(input, init);
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    const key = decodeURIComponent(url.pathname.replace(/^\/bucket\//, ""));
    const method = init?.method ?? "GET";
    const uploadId = url.searchParams.get("uploadId");
    calls.push(`${method} ${url.searchParams.has("uploads") ? "create" : url.searchParams.has("partNumber") ? "part" : uploadId ? "multipart" : "object"}`);
    if (method === "POST" && url.searchParams.has("uploads")) {
      const id = `up-${uploads.size + 1}`;
      uploads.set(id, new Map());
      return new Response(`<InitiateMultipartUploadResult><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`);
    }
    if (method === "PUT" && uploadId) {
      const body = Buffer.from(init!.body as Uint8Array);
      uploads.get(uploadId)!.set(Number(url.searchParams.get("partNumber")), body);
      return new Response(null, { headers: { etag: `"${createHash("md5").update(body).digest("hex")}"` } });
    }
    if (method === "POST" && uploadId) {
      const parts = uploads.get(uploadId)!;
      const listed = [...String(init!.body).matchAll(/<PartNumber>(\d+)<\/PartNumber>/g)].map((m) => Number(m[1]));
      objects.set(key, Buffer.concat(listed.map((n) => parts.get(n)!)));
      uploads.delete(uploadId);
      return new Response("<CompleteMultipartUploadResult/>");
    }
    if (method === "DELETE") {
      if (uploadId) uploads.delete(uploadId);
      else objects.delete(key);
      return new Response(null, { status: 204 });
    }
    const object = objects.get(key);
    return object ? new Response(new Uint8Array(object)) : new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 });
  }) as typeof fetch;
  f.ctx.fetch = handler;
  f.ctx.config.backups = { endpoint: S3, region: "us-east-1", bucket: "bucket", accessKeyId: "AK", secretAccessKey: "SK", prefix: "arkobot/", keepDaily: 7 };
  return { objects, uploads, calls };
}

async function registerNode(f: BillingFixture) {
  const created = await f.api.post("/api/instances/nodes", { name: `vps-bk-${++seq}`, publicIp: "77.216.129.157", capacityInstances: 20 });
  expect(created.status).toBe(201);
  return created.data as { node: { id: string; name: string }; token: string };
}

function agentFor(f: BillingFixture, token: string) {
  const app = createApp(f.ctx);
  const appFetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    return url.startsWith(TEST_URL) ? app.request(url, init, { incoming: { socket: { remoteAddress: "198.51.100.9" } } }) : f.ctx.fetch(input, init);
  }) as typeof fetch;
  const docker = new FakeDocker();
  docker.images.add(DEFAULT_RELAY_IMAGE);
  const logs: string[] = [];
  const agent = createAgent({
    adminUrl: TEST_URL, token, socketPath: "/nao/usado", network: "arkobot-instances", proxyContainer: null, entrypoint: "websecure", certResolver: "letsencrypt",
    trustedProxies: null, registryAuth: null,
  }, { docker, fetch: appFetch, log: (line) => logs.push(line) });
  return { agent, docker, logs, appFetch };
}

/** What the "up" helper container does, run here against the app and the fake store. */
async function runUploadHelper(fetcher: typeof fetch, token: string, taskId: string, content: Buffer, partBytes: number) {
  const dir = mkdtempSync(join(tmpdir(), "arko-bk-"));
  const file = join(dir, `${taskId}.tgz`);
  writeFileSync(file, content);
  Object.assign(process.env, { ARKO_ADMIN_URL: TEST_URL, ARKO_NODE_TOKEN: token, ARKO_TASK_ID: taskId, ARKO_FILE: file });
  await upload(fetcher, partBytes, 1);
}

async function readyInstance(f: BillingFixture, token: string) {
  const { api, orgId } = await customer(f.ctx, `Loja ${++seq}`);
  expect((await api.post("/api/conta/assinatura", { plan: "inicial", billingType: "PIX" })).status).toBe(201);
  await api.get("/api/conta/arkobot");
  const handle = agentFor(f, token);
  await handle.agent.once();
  const instance = (await f.ctx.db.query<Row>("SELECT * FROM instances WHERE organization_id = $1", [orgId])).rows[0]!;
  expect(instance.state).toBe("ready");
  return { ...handle, instance };
}

describe("backups dos clientes", () => {
  let f: BillingFixture;
  beforeEach(async () => {
    f = await billingFixture();
  });
  afterEach(() => f.close());

  it("sem armazenamento configurado nada é agendado nem entregue ao agente", async () => {
    const { token } = await registerNode(f);
    const { docker } = await readyInstance(f, token);
    const summary = await tick(f.ctx);
    expect(summary.backups).toEqual({ scheduled: 0, timedOut: 0, deleted: 0, relocations: 0 });
    expect(docker.calls.some((call) => call.includes("arkotask"))).toBe(false);
  });

  it("diário: congela, empacota, descongela, envia em partes e o Admin conclui", async () => {
    const store = fakeStore(f);
    const { token } = await registerNode(f);
    const { agent, docker, appFetch, instance } = await readyInstance(f, token);
    expect((await tick(f.ctx)).backups.scheduled).toBe(1);
    expect((await tick(f.ctx)).backups.scheduled).toBe(0);
    const backup = (await f.ctx.db.query<Row>("SELECT * FROM instance_backups WHERE instance_id = $1", [instance.id])).rows[0]!;
    expect(backup).toMatchObject({ kind: "scheduled", status: "pending" });
    expect(backup.object_key).toMatch(new RegExp(`^arkobot/${instance.slug}/2026-11-25-${backup.id}\\.tgz$`));

    docker.calls.length = 0;
    await agent.once();
    expect(docker.calls).toEqual([`volume arkobot-backup-staging`, `pause arkoinst-${instance.slug}`, `create ${helperName({ id: backup.id }, "pack")}`, `start ${helperName({ id: backup.id }, "pack")}`]);
    const pack = docker.byName(helperName({ id: backup.id }, "pack"))!;
    expect(pack.body.HostConfig).toMatchObject({ NetworkMode: "none" });
    expect((pack.body.HostConfig as any).Mounts[0]).toMatchObject({ Source: `arkoinst-${instance.id}-data`, Target: "/v", ReadOnly: true });
    expect(JSON.stringify(pack.body)).not.toContain(token);

    await agent.once();
    expect(docker.byName(`arkoinst-${instance.slug}`)!.paused).toBe(true);
    docker.finish(helperName({ id: backup.id }, "pack"));
    docker.calls.length = 0;
    await agent.once();
    expect(docker.calls).toEqual([`unpause arkoinst-${instance.slug}`, `create ${helperName({ id: backup.id }, "up")}`, `start ${helperName({ id: backup.id }, "up")}`]);
    const up = docker.byName(helperName({ id: backup.id }, "up"))!;
    expect(up.body.Env).toContain(`ARKO_TASK_ID=${backup.id}`);
    expect((up.body.HostConfig as any).Mounts.map((m: any) => m.Source)).toEqual(["arkobot-backup-staging"]);

    const archive = Buffer.from("um arquivo tgz de mentira, com doze partes!");
    await runUploadHelper(appFetch, token, backup.id, archive, 4);
    const done = (await f.ctx.db.query<Row>("SELECT * FROM instance_backups WHERE id = $1", [backup.id])).rows[0]!;
    expect(done).toMatchObject({ status: "done", sha256: createHash("sha256").update(archive).digest("hex") });
    expect(Number(done.bytes)).toBe(archive.length);
    expect(store.objects.get(backup.object_key)).toEqual(archive);
    expect(store.calls.filter((call) => call === "PUT part")).toHaveLength(Math.ceil(archive.length / 4));

    docker.finish(helperName({ id: backup.id }, "up"));
    docker.calls.length = 0;
    await agent.once();
    // The task is done, so the Admin no longer lists it: both helpers go.
    expect([...docker.calls].sort()).toEqual([`remove ${helperName({ id: backup.id }, "pack")}`, `remove ${helperName({ id: backup.id }, "up")}`]);
    expect(docker.byName(`arkoinst-${instance.slug}`)!.paused).toBe(false);
  });

  it("um envio que falha aborta o multipart, e a retenção guarda só os últimos diários", async () => {
    const store = fakeStore(f);
    const { token } = await registerNode(f);
    const { agent, docker, appFetch, instance } = await readyInstance(f, token);
    await tick(f.ctx);
    const backup = (await f.ctx.db.query<Row>("SELECT * FROM instance_backups WHERE instance_id = $1", [instance.id])).rows[0]!;
    await agent.once();
    docker.finish(helperName({ id: backup.id }, "pack"));
    await agent.once();
    const failing = ((input: RequestInfo | URL, init?: RequestInit) => String(input).startsWith(S3) && init?.method === "PUT"
      ? Promise.resolve(new Response("nope", { status: 500 })) : appFetch(input, init)) as typeof fetch;
    process.env.ARKO_TASK_ID = backup.id;
    await expect(runUploadHelper(failing, token, backup.id, Buffer.from("abc"), 1024)).rejects.toThrow(/parte 1/);
    expect((await f.ctx.db.query<Row>("SELECT status, error FROM instance_backups WHERE id = $1", [backup.id])).rows[0]).toMatchObject({ status: "failed" });
    expect(store.uploads.size).toBe(0);
    // A failed scheduled backup is retried an hour later, not at once.
    expect((await tick(f.ctx)).backups.scheduled).toBe(0);

    for (let day = 1; day <= 9; day++) {
      const key = `arkobot/${instance.slug}/old-${day}.tgz`;
      store.objects.set(key, Buffer.from("x"));
      await f.ctx.db.query(
        "INSERT INTO instance_backups (instance_id, node_id, kind, status, object_key, created_at, finished_at) VALUES ($1, $2, 'scheduled', 'done', $3, $4, $4)",
        [instance.id, instance.node_id, key, new Date(Date.UTC(2026, 10, 10 + day))]);
    }
    const sweep = await sweepBackups(f.ctx);
    expect(sweep.deleted).toBe(2);
    expect(store.objects.has(`arkobot/${instance.slug}/old-1.tgz`)).toBe(false);
    expect(store.objects.has(`arkobot/${instance.slug}/old-3.tgz`)).toBe(true);
  });

  it("mudança de servidor: para, copia, restaura no destino e liga lá; o antigo só remove o contêiner", async () => {
    fakeStore(f);
    const first = await registerNode(f);
    const { agent: oldAgent, docker: oldDocker, appFetch, instance } = await readyInstance(f, first.token);
    const second = await registerNode(f);
    const newer = agentFor(f, second.token);
    await newer.agent.once();
    await f.ctx.db.query("UPDATE nodes SET status = 'draining' WHERE id = $1", [first.node.id]);

    const backup = await startRelocation(f.ctx, SYSTEM, instance.id, second.node.id);
    expect(backup.kind).toBe("move");
    oldDocker.calls.length = 0;
    await oldAgent.once();
    // Stopped for the copy (no freeze needed), then packed.
    expect(oldDocker.calls).toEqual([`stop arkoinst-${instance.slug}`, "volume arkobot-backup-staging", `create ${helperName({ id: backup.id }, "pack")}`, `start ${helperName({ id: backup.id }, "pack")}`]);
    oldDocker.finish(helperName({ id: backup.id }, "pack"));
    await oldAgent.once();
    const archive = Buffer.from("dados do cliente");
    await runUploadHelper(appFetch, first.token, backup.id, archive, 1024);
    const restore = (await f.ctx.db.query<Row>("SELECT * FROM instance_restores WHERE instance_id = $1", [instance.id])).rows[0]!;
    expect(restore).toMatchObject({ node_id: second.node.id, backup_id: backup.id, status: "pending" });

    // The new server restores before any container of this instance exists there.
    newer.docker.calls.length = 0;
    await newer.agent.once();
    expect(newer.docker.calls).toEqual([`volume arkoinst-${instance.id}-data`, `create ${helperName({ id: restore.id }, "restore")}`, `start ${helperName({ id: restore.id }, "restore")}`]);
    const helper = newer.docker.byName(helperName({ id: restore.id }, "restore"))!;
    const url = (helper.body.Env as string[]).find((line) => line.startsWith("ARKO_RESTORE_URL="))!.slice("ARKO_RESTORE_URL=".length);
    expect(await (await f.ctx.fetch(url)).text()).toBe("dados do cliente");
    newer.docker.finish(helperName({ id: restore.id }, "restore"));
    await newer.agent.once();
    const moved = (await f.ctx.db.query<Row>("SELECT * FROM instances WHERE id = $1", [instance.id])).rows[0]!;
    expect(moved).toMatchObject({ node_id: second.node.id, previous_node_id: first.node.id, relocating_to_node_id: null, generation: instance.generation + 1 });

    await newer.agent.once();
    expect(newer.docker.byName(`arkoinst-${instance.slug}`)?.running).toBe(true);
    oldDocker.calls.length = 0;
    await oldAgent.once();
    expect(oldDocker.calls).toContain(`remove arkoinst-${instance.slug}`);
    expect(oldDocker.volumes.has(`arkoinst-${instance.id}-data`)).toBe(true);
  });

  it("se o backup da mudança falha, a mudança é cancelada e a instância volta a ligar onde estava", async () => {
    fakeStore(f);
    const first = await registerNode(f);
    const { agent, docker, instance } = await readyInstance(f, first.token);
    const second = await registerNode(f);
    const backup = await startRelocation(f.ctx, SYSTEM, instance.id, second.node.id);
    await agent.once();
    docker.finish(helperName({ id: backup.id }, "pack"), 2);
    await agent.once();
    const row = (await f.ctx.db.query<Row>("SELECT node_id, relocating_to_node_id FROM instances WHERE id = $1", [instance.id])).rows[0]!;
    expect(row).toEqual({ node_id: first.node.id, relocating_to_node_id: null });
    expect((await f.ctx.db.query<Row>("SELECT status FROM instance_backups WHERE id = $1", [backup.id])).rows[0]!.status).toBe("failed");
    await agent.once();
    expect(docker.byName(`arkoinst-${instance.slug}`)?.running).toBe(true);
  });
});
