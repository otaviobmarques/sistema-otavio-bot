import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadMigrations } from "../src/db/migrate.ts";
import { client, sessionCookie, testContext, type TestContext } from "./helpers.ts";

const base = {
  code: "teste", name: "Teste", description: "", priceCents: 1000, billingCycle: "monthly", creditsPerMonth: 100, maxBots: 1, maxCompanies: 1,
  ramMb: 512, diskGb: 5, includedVps: 0, allowedModels: ["claude-haiku-4-5"], defaultModel: "claude-haiku-4-5", free: false, cloudMode: "dedicated",
  browserEnabled: true, computerEnabled: true, active: true, visible: true,
};

describe("planos", () => {
  let ctx: TestContext;
  let api: ReturnType<typeof client>;
  beforeAll(async () => {
    ctx = await testContext();
    api = client(ctx, await sessionCookie(ctx));
  });
  afterAll(() => ctx.db.close());

  it("ships the owner's initial paid plans and the per-bot VPS add-on, with no free plan", async () => {
    const { data } = await api.get("/api/plans");
    expect(data.plans.map((p: any) => [p.code, p.price_cents, p.credits_per_month, p.max_bots, p.included_vps, p.free, p.computer_enabled, p.trial_days])).toEqual([
      ["inicial", 3900, 0, 1, 0, false, false, 7],
      ["essencial", 15900, 4000, 3, 0, false, false, 0],
      ["profissional", 59900, 20000, 10, 1, false, true, 0],
      ["empresa", 99900, 40000, null, 2, false, true, 0],
    ]);
    expect(data.plans.find((p: any) => p.code === "profissional").max_companies).toBe(3);
    const inicial = data.plans.find((p: any) => p.code === "inicial");
    expect(inicial).toMatchObject({ max_companies: 1, cloud_mode: "shared_limited", idle_sleep_minutes: 30, ram_mb: 1024, disk_gb: 5, browser_enabled: true,
      free_requests_per_day: 200, default_model: "gratis/gpt-oss-120b", visible: true, active: true, sort_order: 5 });
    expect(inicial.allowed_models.every((model: string) => model.startsWith("gratis/"))).toBe(true);
    expect(data.plans.filter((p: any) => p.code !== "inicial").every((p: any) => p.free_requests_per_day === 0)).toBe(true);
    expect(data.plans.map((p: any) => p.description)).toEqual([
      "Assistente pessoal 24 h com IA gratuita já inclusa.",
      "Bots que trabalham sozinhos: rotinas agendadas e aprovações pelo WhatsApp, com créditos de IA inclusos.",
      "Computador próprio na nuvem: seus bots usam sistemas, planilhas e notas fiscais.",
      "Gestão de várias empresas: um andar por empresa, com regras e orçamento de IA próprios.",
    ]);
    expect(data.plans.every((p: any) => p.allow_byo_ai === true)).toBe(true);
    expect(data.addons).toMatchObject([{ code: "computador-adicional", price_cents: 15900, unit: "per_bot", paid_plans_only: true }]);
  });

  it("0008 can run again without changing anything, and keeps the owner's own edits", async () => {
    const sql = loadMigrations().find((migration) => migration.version === "0008_plano_inicial")!.sql;
    const snapshot = async () => ({
      plans: (await ctx.db.query("SELECT code, description, computer_enabled, trial_days, free_requests_per_day, allowed_models FROM plans ORDER BY code")).rows,
      prices: (await ctx.db.query("SELECT model, provider, free, upstream_model FROM model_prices ORDER BY model")).rows,
    });
    await ctx.db.query("UPDATE plans SET description = 'Texto do dono' WHERE code = 'empresa'");
    const before = await snapshot();
    await ctx.db.tx((q) => q.query(sql));
    expect(await snapshot()).toEqual(before);
    expect(before.prices.filter((row: any) => row.free).map((row: any) => row.provider).sort()).toEqual(["cerebras", "google", "groq", "nvidia", "openrouter", "openrouter"]);
    await expect(ctx.db.query("UPDATE model_prices SET output_usd = 1 WHERE model = 'gratis/gemini-3.8-flash'")).rejects.toThrow(/model_prices_free_costs_nothing/);
  });

  it("creates and edits a plan; the customer's own AI can be switched off per plan", async () => {
    const created = await api.post("/api/plans", base);
    expect(created.status).toBe(201);
    expect(created.data.plan.allow_byo_ai).toBe(true);
    const updated = await api.put(`/api/plans/${created.data.plan.id}`, { ...base, allowByoAi: false, dailyCreditCap: 50 });
    expect(updated.data.plan).toMatchObject({ allow_byo_ai: false, daily_credit_cap: 50 });
    expect((await api.post("/api/plans", base)).status).toBe(409);
  });

  it("validates free plans, prices and the default model", async () => {
    expect((await api.post("/api/plans", { ...base, code: "gratis", free: true })).status).toBe(400);
    expect((await api.post("/api/plans", { ...base, code: "gratis", free: true, priceCents: 0 })).status).toBe(201);
    expect((await api.post("/api/plans", { ...base, code: "zero", priceCents: 0 })).status).toBe(400);
    expect((await api.post("/api/plans", { ...base, code: "modelo", defaultModel: "gpt-5" })).status).toBe(400);
  });
});
