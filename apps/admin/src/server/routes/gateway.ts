import { z } from "zod";
import { audit } from "../../audit.ts";
import type { AppContext } from "../../context.ts";
import { DomainError } from "../../domain/lifecycle.ts";
import { freeModelAllowed } from "../../gateway/free-ai.ts";
import { GATEWAY_PROVIDERS, isOpenAiCompatible } from "../../gateway/pricing.ts";
import { actorOf, body, router } from "../http.ts";

const usd = z.number().min(0).max(10_000);
const markup = z.number().min(0).max(1000).nullable();
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const priceSchema = z.object({
  model: z.string().trim().regex(MODEL_ID, "use o id do modelo no provedor (ex.: claude-haiku-4-5, google/gemini-2.5-flash)"),
  provider: z.enum(GATEWAY_PROVIDERS),
  label: z.string().trim().max(80).default(""),
  inputUsd: usd, cachedInputUsd: usd, cacheWriteUsd: usd, outputUsd: usd,
  markupPercent: markup.default(null),
  defaultMaxOutput: z.number().int().min(1).max(1_000_000).default(8192),
  enabled: z.boolean().default(true),
  free: z.boolean().default(false),
  upstreamModel: z.string().trim().regex(MODEL_ID, "id inválido").nullable().default(null),
}).superRefine((price, issue) => {
  if (price.free && (price.inputUsd || price.cachedInputUsd || price.cacheWriteUsd || price.outputUsd)) {
    issue.addIssue({ code: "custom", path: ["free"], message: "modelo gratuito tem todos os preços zerados" });
  }
  if (price.free && !freeModelAllowed(price.provider, price.upstreamModel || price.model)) {
    issue.addIssue({ code: "custom", path: ["upstreamModel"], message: "no OpenRouter, modelo grátis precisa terminar em :free (os outros são cobrados da conta)" });
  }
  // The ArkoBot instance lists these providers' models on its OpenRouter engine, which only accepts "vendor/model" ids.
  if (isOpenAiCompatible(price.provider) && !price.model.includes("/")) {
    issue.addIssue({ code: "custom", path: ["model"], message: "para este provedor use um id com barra (ex.: gratis/gemini-2.5-flash) e ponha o id do provedor em \"Id no provedor\"" });
  }
});

const settingsSchema = z.object({
  markupPercent: z.number().min(0).max(1000),
  usdBrlRate: z.number().gt(0).max(100),
  overdraftCredits: z.number().int().min(0).max(100_000),
  rateLimitPerMinute: z.number().int().min(1).max(100_000),
  reservationMinutes: z.number().int().min(1).max(240),
});

export function gatewayRoutes(ctx: AppContext) {
  const app = router();

  app.get("/prices", async (c) => {
    const [prices, settings, plans] = await Promise.all([
      ctx.db.query(`SELECT p.*, a.email AS updated_by_email FROM model_prices p LEFT JOIN admins a ON a.id = p.updated_by ORDER BY p.provider, p.model`),
      ctx.db.query("SELECT * FROM gateway_settings WHERE id"),
      ctx.db.query("SELECT code, name, allowed_models, free_requests_per_day FROM plans WHERE active ORDER BY sort_order"),
    ]);
    return c.json({ prices: prices.rows, settings: settings.rows[0], plans: plans.rows });
  });

  app.put("/prices", async (c) => {
    const input = await body(c, priceSchema);
    const row = await ctx.db.tx(async (q) => {
      const before = (await q.query("SELECT * FROM model_prices WHERE model = $1", [input.model])).rows[0] ?? null;
      const { rows } = await q.query(
        `INSERT INTO model_prices (model, provider, label, input_usd, cached_input_usd, cache_write_usd, output_usd, markup_percent, default_max_output, enabled,
           free, upstream_model, source, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'painel', $13)
         ON CONFLICT (model) DO UPDATE SET provider = excluded.provider, label = excluded.label, input_usd = excluded.input_usd,
           cached_input_usd = excluded.cached_input_usd, cache_write_usd = excluded.cache_write_usd, output_usd = excluded.output_usd,
           markup_percent = excluded.markup_percent, default_max_output = excluded.default_max_output, enabled = excluded.enabled,
           free = excluded.free, upstream_model = excluded.upstream_model, source = 'painel', updated_by = excluded.updated_by
         RETURNING *`,
        [input.model, input.provider, input.label, input.inputUsd, input.cachedInputUsd, input.cacheWriteUsd, input.outputUsd, input.markupPercent,
          input.defaultMaxOutput, input.enabled, input.free, input.upstreamModel || null, c.get("admin").id]);
      await audit(q, actorOf(c), { action: before ? "model_price.updated" : "model_price.created", targetType: "model_price", targetId: input.model,
        data: { before, after: input } });
      return rows[0];
    });
    return c.json({ price: row });
  });

  app.put("/settings", async (c) => {
    const input = await body(c, settingsSchema);
    await ctx.db.tx(async (q) => {
      const before = (await q.query("SELECT markup_percent, usd_brl_rate, overdraft_credits, rate_limit_per_minute, reservation_minutes FROM gateway_settings WHERE id")).rows[0];
      await q.query(
        `UPDATE gateway_settings SET markup_percent = $1, usd_brl_rate = $2, overdraft_credits = $3, rate_limit_per_minute = $4, reservation_minutes = $5, updated_by = $6 WHERE id`,
        [input.markupPercent, input.usdBrlRate, input.overdraftCredits, input.rateLimitPerMinute, input.reservationMinutes, c.get("admin").id]);
      await audit(q, actorOf(c), { action: "gateway_settings.updated", targetType: "gateway_settings", data: { before, after: input } });
    });
    return c.json({ ok: true });
  });

  app.get("/usage", async (c) => {
    const days = Math.min(366, Math.max(1, Number(c.req.query("days")) || 30));
    const since = new Date(ctx.now().getTime() - days * 86_400_000);
    const organization = c.req.query("organization");
    if (organization && !z.uuid().safeParse(organization).success) throw new DomainError("Cliente inválido");
    const params: unknown[] = [since];
    let scope = "e.created_at >= $1";
    if (organization) {
      params.push(organization);
      scope += " AND e.organization_id = $2";
    }
    const totals = `count(*)::int AS requests, count(*) FILTER (WHERE e.status = 'ok')::int AS ok,
      count(*) FILTER (WHERE e.status = 'refused')::int AS refused, count(*) FILTER (WHERE e.status = 'error')::int AS errors,
      COALESCE(SUM(e.input_tokens + e.cache_read_tokens + e.cache_write_tokens), 0)::bigint AS input_tokens, COALESCE(SUM(e.output_tokens), 0)::bigint AS output_tokens,
      COALESCE(SUM(e.cost_usd_micros), 0)::bigint AS cost_usd_micros, COALESCE(SUM(e.cost_brl_cents), 0)::float8 AS cost_brl_cents,
      COALESCE(SUM(e.credits), 0)::bigint AS credits`;
    const group = (columns: string[][]) => ctx.db.query(
      `SELECT ${columns.map((column) => `${column[0]} AS ${column[1]}`).join(", ")}, ${totals} FROM usage_events e JOIN organizations o ON o.id = e.organization_id
       WHERE ${scope} GROUP BY ${columns.map((column) => column[0]).join(", ")} ORDER BY credits DESC, requests DESC LIMIT 100`, params);
    const org = [["o.id", "organization_id"], ["o.name", "organization_name"]];
    const company = ["COALESCE(e.company, '')", "company"];
    const [summary, byClient, byCompany, byBot, byModel, refusals, daily, recent] = await Promise.all([
      ctx.db.query(`SELECT ${totals} FROM usage_events e WHERE ${scope}`, params),
      group(org),
      group([...org, company]),
      group([...org, company, ["COALESCE(e.bot, '')", "bot"]]),
      group([["e.provider", "provider"], ["e.model", "model"]]),
      ctx.db.query(`SELECT e.error_code, count(*)::int AS n FROM usage_events e WHERE ${scope} AND e.status <> 'ok' GROUP BY e.error_code ORDER BY n DESC`, params),
      ctx.db.query(`SELECT to_char(e.created_at AT TIME ZONE 'UTC' - interval '3 hours', 'YYYY-MM-DD') AS day, COALESCE(SUM(e.credits), 0)::bigint AS credits,
        COALESCE(SUM(e.cost_brl_cents), 0)::float8 AS cost_brl_cents FROM usage_events e WHERE ${scope} GROUP BY day ORDER BY day`, params),
      ctx.db.query(`SELECT e.id, e.created_at, e.provider, e.model, e.status, e.error_code, e.company, e.bot, e.input_tokens, e.output_tokens, e.cache_read_tokens,
        e.credits, e.cost_brl_cents::float8 AS cost_brl_cents, e.usage_estimated, e.duration_ms, o.id AS organization_id, o.name AS organization_name
        FROM usage_events e JOIN organizations o ON o.id = e.organization_id WHERE ${scope} ORDER BY e.id DESC LIMIT 50`, params),
    ]);
    return c.json({ days, summary: summary.rows[0], byClient: byClient.rows, byCompany: byCompany.rows, byBot: byBot.rows, byModel: byModel.rows,
      refusals: refusals.rows, daily: daily.rows, recent: recent.rows });
  });

  return app;
}
