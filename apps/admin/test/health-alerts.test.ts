import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";
import { tick } from "../src/jobs/handlers.ts";
import { applyStatusReport } from "../src/provisioning/instances.ts";
import { INSTANCE_BROKEN_MS, NODE_DOWN_MS } from "../src/provisioning/health-alerts.ts";
import { billingFixture, type BillingFixture } from "./billing-fixture.ts";
import { advance, insertAdmin } from "./helpers.ts";

type Row = Record<string, any>;

describe("avisos de servidor e instância", () => {
  let f: BillingFixture;
  beforeEach(async () => {
    f = await billingFixture();
  });
  afterEach(() => f.close());

  const alerts = () => f.ctx.mailer.sent.filter((mail) => mail.subject.startsWith("[ArkoBot]"));

  async function nodeWithInstance() {
    const created = await f.api.post("/api/instances/nodes", { name: "vps-avisos", publicIp: "200.141.20.53" });
    const node = { id: created.data.node.id as string };
    const orgId = await f.newClient("Mercado Avisos");
    await f.api.post(`/api/clients/${orgId}/courtesy`, { planId: f.plans.essencial!.id, reason: "teste de avisos" });
    await tick(f.ctx);
    const instance = (await f.ctx.db.query<Row>("SELECT id, slug FROM instances WHERE organization_id = $1", [orgId])).rows[0]!;
    const report = (state: "running" | "error", health: "healthy" | "unhealthy" | null = "healthy") => applyStatusReport(f.ctx, node, {
      agentVersion: "0.2.0", orphans: [], error: null,
      instances: [{ id: instance.id, state, health: state === "error" ? null : health, containerId: null, revision: null, error: state === "error" ? "OCI runtime error" : null }],
    });
    return { node, instance, report };
  }

  it("avisa os donos uma vez quando o servidor para de responder e de novo quando volta", async () => {
    await insertAdmin(f.ctx, "socia@domma.com.br", "owner");
    await insertAdmin(f.ctx, "operador@domma.com.br", "operator");
    const { report } = await nodeWithInstance();
    await report("running");
    await tick(f.ctx);
    expect(alerts()).toEqual([]);

    advance(f.ctx, NODE_DOWN_MS + 1000);
    await tick(f.ctx);
    const down = alerts();
    expect(down.map((mail) => mail.subject)).toEqual(expect.arrayContaining(["[ArkoBot] Servidor vps-avisos sem contato"]));
    const recipients = down.map((mail) => mail.to);
    expect(recipients).toContain("socia@domma.com.br");
    expect(recipients).not.toContain("operador@domma.com.br");
    expect(down[0]!.text).toContain("1 instância(s)");
    expect(down[0]!.text).toContain("https://admin.test/instancias");

    // Once per episode, and the panel shows it.
    advance(f.ctx, 10 * 60_000);
    await tick(f.ctx);
    expect(alerts()).toHaveLength(down.length);
    const listed = (await f.api.get("/api/instances")).data.nodes[0];
    expect(listed).toMatchObject({ online: false, down_alerted_at: expect.any(String) });

    await report("running");
    await tick(f.ctx);
    const back = alerts().slice(down.length);
    expect(back.map((mail) => mail.subject)).toEqual(back.map(() => "[ArkoBot] Servidor vps-avisos voltou"));
    expect(back.map((mail) => mail.to).sort()).toEqual([...recipients].sort());
    expect((await f.api.get("/api/instances")).data.nodes[0].down_alerted_at).toBeNull();
  });

  it("um servidor tirado de serviço não gera aviso", async () => {
    const { node, report } = await nodeWithInstance();
    await report("running");
    await f.api.post(`/api/instances/nodes/${node.id}/status`, { status: "offline" });
    advance(f.ctx, NODE_DOWN_MS * 3);
    await tick(f.ctx);
    expect(alerts()).toEqual([]);
  });

  it("avisa uma vez quando a instância fica com erro por mais de 10 minutos, e quando volta ao normal", async () => {
    f.ctx.config.alertEmails = ["plantao@domma.com.br"];
    const { instance, report } = await nodeWithInstance();
    await report("error");
    advance(f.ctx, INSTANCE_BROKEN_MS / 2);
    await report("error");
    await tick(f.ctx);
    expect(alerts()).toEqual([]);

    advance(f.ctx, INSTANCE_BROKEN_MS / 2 + 1000);
    await report("error");
    await tick(f.ctx);
    expect(alerts()).toEqual([expect.objectContaining({ to: "plantao@domma.com.br", subject: `[ArkoBot] Instância ${instance.slug} com erro no Docker` })]);
    expect(alerts()[0]!.text).toContain("OCI runtime error");
    await report("running", "unhealthy");
    await tick(f.ctx);
    expect(alerts()).toHaveLength(1);
    expect((await f.api.get("/api/instances")).data.instances[0]).toMatchObject({ unhealthy_alerted_at: expect.any(String) });

    await report("running", "healthy");
    await tick(f.ctx);
    expect(alerts().map((mail) => mail.subject)).toEqual([
      `[ArkoBot] Instância ${instance.slug} com erro no Docker`, `[ArkoBot] Instância ${instance.slug} voltou ao normal`,
    ]);

    // A new episode: health check failing this time.
    await report("running", "unhealthy");
    advance(f.ctx, INSTANCE_BROKEN_MS + 1000);
    await report("running", "unhealthy");
    await tick(f.ctx);
    expect(alerts().at(-1)!.subject).toBe(`[ArkoBot] Instância ${instance.slug} falhando no health check`);
  });

  it("lê ADMIN_ALERT_EMAIL (vários, separados por vírgula) e recusa um inválido", () => {
    const base = { ADMIN_SESSION_SECRET: "s".repeat(40), DATABASE_URL: "postgres://x", ADMIN_ENCRYPTION_KEY: "k" };
    expect(loadConfig({ ...base, ADMIN_ALERT_EMAIL: "A@domma.com.br, b@domma.com.br" }).alertEmails).toEqual(["a@domma.com.br", "b@domma.com.br"]);
    expect(loadConfig(base).alertEmails).toBeUndefined();
    expect(() => loadConfig({ ...base, ADMIN_ALERT_EMAIL: "nao-e-email" })).toThrow(/ADMIN_ALERT_EMAIL/);
  });
});
