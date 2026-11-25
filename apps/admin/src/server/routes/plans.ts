import { z } from "zod";
import { audit } from "../../audit.ts";
import type { AppContext } from "../../context.ts";
import { isUniqueViolation } from "../../db/db.ts";
import { DomainError } from "../../domain/lifecycle.ts";
import { actorOf, body, param, router } from "../http.ts";

const optionalPositive = z.number().int().positive().nullable().optional();

const planSchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,40}$/, "use letras minúsculas, números e hífen"),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(""),
  priceCents: z.number().int().min(0).max(100_000_000),
  billingCycle: z.enum(["monthly", "yearly"]),
  creditsPerMonth: z.number().int().min(0).max(1_000_000_000),
  maxBots: z.number().int().min(0).nullable(),
  maxCompanies: z.number().int().min(0).nullable(),
  ramMb: z.number().int().min(0).max(1_048_576),
  diskGb: z.number().int().min(0).max(100_000),
  includedVps: z.number().int().min(0).max(100),
  allowedModels: z.array(z.string().trim().min(1).max(120)).max(100),
  defaultModel: z.string().trim().max(120).nullable(),
  free: z.boolean(),
  cloudMode: z.enum(["dedicated", "shared_limited", "none"]),
  browserEnabled: z.boolean(),
  computerEnabled: z.boolean(),
  allowByoAi: z.boolean().default(true),
  idleSleepMinutes: optionalPositive,
  inactiveDeleteDays: optionalPositive,
  dailyCreditCap: optionalPositive,
  monthlyCreditCap: optionalPositive,
  perRequestCreditCap: optionalPositive,
  active: z.boolean(),
  visible: z.boolean(),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
}).superRefine((plan, issue) => {
  if (plan.free && plan.priceCents !== 0) issue.addIssue({ code: "custom", path: ["priceCents"], message: "plano gratuito tem preço zero" });
  if (!plan.free && plan.priceCents === 0) issue.addIssue({ code: "custom", path: ["priceCents"], message: "plano pago precisa de preço" });
  if (plan.defaultModel && plan.allowedModels.length && !plan.allowedModels.includes(plan.defaultModel)) {
    issue.addIssue({ code: "custom", path: ["defaultModel"], message: "o modelo padrão precisa estar na lista de permitidos" });
  }
});

type PlanInput = z.infer<typeof planSchema>;

function columns(plan: PlanInput): unknown[] {
  return [
    plan.code, plan.name, plan.description, plan.priceCents, plan.billingCycle, plan.creditsPerMonth, plan.maxBots, plan.maxCompanies,
    plan.ramMb, plan.diskGb, plan.includedVps, plan.allowedModels, plan.defaultModel || null, plan.free, plan.cloudMode,
    plan.browserEnabled, plan.computerEnabled, plan.allowByoAi, plan.idleSleepMinutes ?? null, plan.inactiveDeleteDays ?? null,
    plan.dailyCreditCap ?? null, plan.monthlyCreditCap ?? null, plan.perRequestCreditCap ?? null, plan.active, plan.visible, plan.sortOrder,
  ];
}

const COLUMN_NAMES = `code, name, description, price_cents, billing_cycle, credits_per_month, max_bots, max_companies, ram_mb, disk_gb,
  included_vps, allowed_models, default_model, free, cloud_mode, browser_enabled, computer_enabled, allow_byo_ai, idle_sleep_minutes,
  inactive_delete_days, daily_credit_cap, monthly_credit_cap, per_request_credit_cap, active, visible, sort_order`;

function conflict(error: unknown): never {
  if (isUniqueViolation(error)) throw new DomainError("Já existe um plano com este código", 409);
  throw error;
}

export function planRoutes(ctx: AppContext) {
  const app = router();

  app.get("/", async (c) => {
    const [plans, addons] = await Promise.all([
      ctx.db.query(`SELECT p.*,
          (SELECT count(*) FROM subscriptions s WHERE s.plan_id = p.id AND s.status <> 'canceled')::int AS subscribers
        FROM plans p ORDER BY p.sort_order, p.price_cents`),
      ctx.db.query("SELECT * FROM addons ORDER BY name"),
    ]);
    return c.json({ plans: plans.rows, addons: addons.rows });
  });

  app.post("/", async (c) => {
    const plan = await body(c, planSchema);
    const placeholders = columns(plan).map((_, i) => `$${i + 1}`).join(", ");
    const row = await ctx.db.tx(async (q) => {
      const { rows } = await q.query<{ id: string }>(`INSERT INTO plans (${COLUMN_NAMES}) VALUES (${placeholders}) RETURNING *`, columns(plan));
      await audit(q, actorOf(c), { action: "plan.created", targetType: "plan", targetId: rows[0]!.id, data: plan });
      return rows[0]!;
    }).catch(conflict);
    return c.json({ plan: row }, 201);
  });

  app.put("/:id", async (c) => {
    const id = param(c, "id");
    const plan = await body(c, planSchema);
    const sets = COLUMN_NAMES.split(",").map((name, i) => `${name.trim()} = $${i + 2}`).join(", ");
    const row = await ctx.db.tx(async (q) => {
      const before = (await q.query("SELECT * FROM plans WHERE id = $1 FOR UPDATE", [id])).rows[0];
      if (!before) throw new DomainError("Plano não encontrado", 404);
      const { rows } = await q.query(`UPDATE plans SET ${sets} WHERE id = $1 RETURNING *`, [id, ...columns(plan)]);
      await audit(q, actorOf(c), { action: "plan.updated", targetType: "plan", targetId: id, data: { before, after: plan } });
      return rows[0];
    }).catch(conflict);
    return c.json({ plan: row });
  });

  app.delete("/:id", async (c) => {
    const id = param(c, "id");
    await ctx.db.tx(async (q) => {
      const used = await q.query("SELECT 1 FROM subscriptions WHERE plan_id = $1 LIMIT 1", [id]);
      if (used.rows.length) throw new DomainError("Plano já usado por assinaturas: desative-o em vez de excluir", 409);
      const { rowCount } = await q.query("DELETE FROM plans WHERE id = $1", [id]);
      if (!rowCount) throw new DomainError("Plano não encontrado", 404);
      await audit(q, actorOf(c), { action: "plan.deleted", targetType: "plan", targetId: id });
    });
    return c.json({ ok: true });
  });

  app.put("/addons/:id", async (c) => {
    const id = param(c, "id");
    const input = await body(c, z.object({
      name: z.string().trim().min(2).max(120), description: z.string().trim().max(500), priceCents: z.number().int().positive().max(100_000_000),
      active: z.boolean(),
    }));
    await ctx.db.tx(async (q) => {
      const { rowCount } = await q.query("UPDATE addons SET name = $2, description = $3, price_cents = $4, active = $5 WHERE id = $1",
        [id, input.name, input.description, input.priceCents, input.active]);
      if (!rowCount) throw new DomainError("Adicional não encontrado", 404);
      await audit(q, actorOf(c), { action: "addon.updated", targetType: "addon", targetId: id, data: input });
    });
    return c.json({ ok: true });
  });

  return app;
}
