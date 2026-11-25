import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
    expect(data.plans.map((p: any) => [p.code, p.price_cents, p.credits_per_month, p.max_bots, p.included_vps, p.free])).toEqual([
      ["essencial", 15900, 4000, 3, 0, false],
      ["profissional", 59900, 20000, 10, 1, false],
      ["empresa", 99900, 40000, null, 2, false],
    ]);
    expect(data.plans.find((p: any) => p.code === "profissional").max_companies).toBe(3);
    expect(data.plans.every((p: any) => p.allow_byo_ai === true)).toBe(true);
    expect(data.addons).toMatchObject([{ code: "computador-adicional", price_cents: 15900, unit: "per_bot", paid_plans_only: true }]);
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
