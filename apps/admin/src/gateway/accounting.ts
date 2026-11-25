import { audit, SYSTEM } from "../audit.ts";
import { lockWallet, postLedger } from "../credits/ledger.ts";
import type { Db, Queryable } from "../db/db.ts";
import { isUniqueViolation } from "../db/db.ts";
import { brlCentsFor, costUsd, creditsFor, markupFor, type GatewayProvider, type GatewaySettings, type ModelPrice, type TokenUsage } from "./pricing.ts";
import type { GatewayCaller } from "./tokens.ts";

export type RefusalCode =
  | "invalid_token" | "plan_suspended" | "credits_used_up" | "daily_cap_reached" | "monthly_cap_reached" | "request_over_plan_limit"
  | "model_not_in_plan" | "model_unavailable" | "rate_limited" | "duplicate_request" | "invalid_request" | "not_found" | "upstream_unavailable";

const REFUSALS: Record<RefusalCode, [number, string]> = {
  invalid_token: [401, "Token do gateway ArkoBot inválido, revogado ou expirado."],
  plan_suspended: [402, "O plano desta conta está suspenso ou com pagamento pendente. Regularize a assinatura para voltar a usar a IA incluída."],
  credits_used_up: [402, "Os créditos de IA desta conta acabaram. Compre mais créditos ou aguarde a renovação do plano. Você também pode conectar sua própria conta de IA."],
  daily_cap_reached: [402, "O limite diário de créditos de IA do plano foi atingido. O uso volta amanhã."],
  monthly_cap_reached: [402, "O limite mensal de créditos de IA do plano foi atingido. O uso volta na renovação do plano."],
  request_over_plan_limit: [400, "Esta requisição passa do limite por requisição do plano. Use um pedido menor ou um modelo mais barato."],
  model_not_in_plan: [403, "Este modelo não está incluído no plano. Escolha um dos modelos do plano."],
  model_unavailable: [403, "Este modelo não está disponível no gateway ArkoBot."],
  rate_limited: [429, "Muitas requisições em pouco tempo. Aguarde alguns segundos e tente de novo."],
  duplicate_request: [409, "Esta requisição já foi recebida (mesmo identificador)."],
  invalid_request: [400, "Requisição inválida para o gateway ArkoBot."],
  not_found: [404, "Rota inexistente no gateway ArkoBot."],
  upstream_unavailable: [503, "O provedor de IA não respondeu. Tente de novo em instantes."],
};

/** A refusal the gateway answers with `{ code, message }` (pt-BR) and the matching HTTP status. */
export class GatewayRefusal extends Error {
  readonly code: RefusalCode;
  readonly status: number;
  constructor(code: RefusalCode, message?: string) {
    super(message ?? REFUSALS[code][1]);
    this.code = code;
    this.status = REFUSALS[code][0];
  }
}

export async function loadSettings(q: Queryable): Promise<GatewaySettings> {
  const { rows } = await q.query<Record<string, string | number>>("SELECT * FROM gateway_settings WHERE id");
  const row = rows[0];
  if (!row) throw new Error("gateway_settings vazia: rode as migrações");
  return {
    markupPercent: Number(row.markup_percent),
    usdBrlRate: Number(row.usd_brl_rate),
    overdraftCredits: Number(row.overdraft_credits),
    rateLimitPerMinute: Number(row.rate_limit_per_minute),
    reservationMinutes: Number(row.reservation_minutes),
  };
}

const BRT_OFFSET_MS = 3 * 60 * 60_000;

/** Midnight in Brasília (UTC−3, no daylight saving since 2019). */
export function brasiliaDayStart(now: Date): Date {
  const local = new Date(now.getTime() - BRT_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + BRT_OFFSET_MS);
}

export function periodStart(caller: GatewayCaller, now: Date): Date {
  return caller.periodStart ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function spentSince(q: Queryable, organizationId: string, since: Date): Promise<number> {
  const { rows } = await q.query<{ n: number }>(
    "SELECT COALESCE(SUM(credits), 0)::bigint AS n FROM usage_events WHERE organization_id = $1 AND created_at >= $2", [organizationId, since]);
  return Number(rows[0]?.n ?? 0);
}

export interface ReserveInput {
  caller: GatewayCaller;
  requestId: string;
  /** Credits the request may cost at most, from max output tokens and the input estimate. */
  wanted: number;
  /** Below this the request is not worth sending (the input alone plus a short answer). */
  minimum: number;
  settings: GatewaySettings;
  now: Date;
}

/**
 * Sets credits aside for one request, inside one transaction that holds the
 * organisation's wallet row: two concurrent requests are serialised there, so
 * the second sees the first's reservation and cannot spend the same credits.
 * Returns how many credits were reserved (possibly fewer than wanted: the
 * caller then lowers the request's output limit to fit).
 */
export async function reserveCredits(db: Db, input: ReserveInput): Promise<number> {
  const { caller, settings, now } = input;
  try {
    return await db.tx(async (q) => {
      const wallet = await lockWallet(q, caller.organizationId);
      const held = await q.query<{ n: number }>(
        "SELECT COALESCE(SUM(credits), 0)::bigint AS n FROM credit_reservations WHERE organization_id = $1 AND status = 'held' AND expires_at > $2",
        [caller.organizationId, now]);
      const heldCredits = Number(held.rows[0]?.n ?? 0);
      const balance = wallet.plan + wallet.extra;
      if (balance <= 0) throw new GatewayRefusal("credits_used_up");
      let room = balance - heldCredits + settings.overdraftCredits;
      if (room < input.minimum) throw new GatewayRefusal("credits_used_up");
      if (caller.dailyCap !== null) {
        const left = caller.dailyCap - (await spentSince(q, caller.organizationId, brasiliaDayStart(now))) - heldCredits;
        if (left < input.minimum) throw new GatewayRefusal("daily_cap_reached");
        room = Math.min(room, left);
      }
      if (caller.monthlyCap !== null) {
        const left = caller.monthlyCap - (await spentSince(q, caller.organizationId, periodStart(caller, now))) - heldCredits;
        if (left < input.minimum) throw new GatewayRefusal("monthly_cap_reached");
        room = Math.min(room, left);
      }
      if (caller.perRequestCap !== null) {
        if (caller.perRequestCap < input.minimum) throw new GatewayRefusal("request_over_plan_limit");
        room = Math.min(room, caller.perRequestCap);
      }
      const credits = Math.max(1, Math.min(input.wanted, room));
      await q.query(
        `INSERT INTO credit_reservations (organization_id, gateway_token_id, request_id, credits, expires_at) VALUES ($1, $2, $3, $4, $5)`,
        [caller.organizationId, caller.tokenId, input.requestId, credits, new Date(now.getTime() + settings.reservationMinutes * 60_000)]);
      return credits;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new GatewayRefusal("duplicate_request");
    throw error;
  }
}

export interface UsageRecord {
  caller: GatewayCaller;
  requestId: string;
  provider: GatewayProvider;
  model: string;
  endpoint: string;
  company: string | null;
  bot: string | null;
  providerKeyId: string | null;
  httpStatus: number | null;
  durationMs: number;
}

export interface UsageAlert {
  organizationId: string;
  threshold: 50 | 80 | 100;
  usedCredits: number;
  quotaCredits: number;
  periodStart: Date;
}

async function insertEvent(q: Queryable, record: UsageRecord, fields: {
  status: "ok" | "error" | "refused"; usage: TokenUsage; costUsd: number; credits: number; reserved: number; brlCents: number;
  settings: GatewaySettings | null; markup: number | null; estimated: boolean; errorCode: string | null;
}, now: Date): Promise<boolean> {
  const inserted = await q.query(
    `INSERT INTO usage_events (organization_id, instance_id, gateway_token_id, ai_provider_key_id, request_id, provider, model, input_tokens, output_tokens,
       cache_read_tokens, cache_write_tokens, cost_usd_micros, credits, status, endpoint, company, bot, reserved_credits, cost_brl_cents, usd_brl_rate,
       markup_percent, usage_estimated, http_status, error_code, duration_ms, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
     ON CONFLICT (request_id) DO NOTHING`,
    [record.caller.organizationId, record.caller.instanceId, record.caller.tokenId, record.providerKeyId, record.requestId, record.provider, record.model,
      fields.usage.input, fields.usage.output, fields.usage.cacheRead, fields.usage.cacheWrite, Math.round(fields.costUsd * 1_000_000), fields.credits,
      fields.status, record.endpoint, record.company, record.bot, fields.reserved, fields.brlCents, fields.settings?.usdBrlRate ?? null, fields.markup,
      fields.estimated, record.httpStatus, fields.errorCode, record.durationMs, now]);
  return inserted.rowCount > 0;
}

/**
 * Charges what a finished request really cost: plan credits first, then the
 * extra bucket (which may go below zero within the tolerance), as immutable
 * ledger rows keyed by the request id. What was reserved and not used goes
 * back. Running it twice for one request changes nothing.
 */
export async function settleRequest(db: Db, input: {
  record: UsageRecord; usage: TokenUsage; price: ModelPrice; settings: GatewaySettings; estimated: boolean; now: Date;
}): Promise<{ credits: number; alerts: UsageAlert[] }> {
  const { record, price, settings, now } = input;
  const usd = costUsd(input.usage, price);
  const credits = creditsFor(usd, price, settings);
  return db.tx(async (q) => {
    const wallet = await lockWallet(q, record.caller.organizationId);
    const reservation = (await q.query<{ status: string; credits: number }>(
      "SELECT status, credits FROM credit_reservations WHERE request_id = $1 FOR UPDATE", [record.requestId])).rows[0];
    if (reservation?.status === "settled" || reservation?.status === "released") return { credits: 0, alerts: [] };
    const fresh = await insertEvent(q, record, {
      status: "ok", usage: input.usage, costUsd: usd, credits, reserved: Number(reservation?.credits ?? 0), brlCents: brlCentsFor(usd, settings),
      settings, markup: markupFor(price, settings), estimated: input.estimated, errorCode: null,
    }, now);
    if (!fresh) return { credits: 0, alerts: [] };
    await q.query("UPDATE credit_reservations SET status = 'settled', finished_at = $2 WHERE request_id = $1", [record.requestId, now]);
    const fromPlan = Math.min(credits, Math.max(0, wallet.plan));
    const metadata = { requestId: record.requestId, model: record.model, provider: record.provider, costUsd: usd };
    if (fromPlan > 0) {
      await postLedger(q, { organizationId: record.caller.organizationId, bucket: "plan", kind: "usage", amount: -fromPlan,
        externalReference: `usage:${record.requestId}:plan`, reason: `IA: ${record.model}`, metadata });
    }
    if (credits - fromPlan > 0) {
      await postLedger(q, { organizationId: record.caller.organizationId, bucket: "extra", kind: "usage", amount: -(credits - fromPlan),
        externalReference: `usage:${record.requestId}:extra`, reason: `IA: ${record.model}`, metadata, allowOverdraft: true });
    }
    const alerts = await recordThresholds(q, record.caller, now);
    return { credits, alerts };
  });
}

/** A request that failed or was refused before any usage: the reservation (if any) goes back and nothing is charged. */
export async function releaseRequest(db: Db, input: {
  record: UsageRecord; status: "error" | "refused"; errorCode: string; now: Date;
}): Promise<void> {
  await db.tx(async (q) => {
    const reservation = (await q.query<{ status: string; credits: number }>(
      "SELECT status, credits FROM credit_reservations WHERE request_id = $1 FOR UPDATE", [input.record.requestId])).rows[0];
    if (reservation?.status === "settled") return;
    if (reservation) await q.query("UPDATE credit_reservations SET status = 'released', finished_at = $2 WHERE request_id = $1 AND status IN ('held', 'expired')", [input.record.requestId, input.now]);
    await insertEvent(q, input.record, {
      status: input.status, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, costUsd: 0, credits: 0,
      reserved: Number(reservation?.credits ?? 0), brlCents: 0, settings: null, markup: null, estimated: false, errorCode: input.errorCode,
    }, input.now);
  });
}

const THRESHOLDS = [50, 80, 100] as const;

/** Records each of 50/80/100% of the period's plan quota once per period; the caller notifies after commit. */
export async function recordThresholds(q: Queryable, caller: GatewayCaller, now: Date): Promise<UsageAlert[]> {
  const quota = caller.creditsPerMonth;
  if (quota <= 0) return [];
  const start = periodStart(caller, now);
  const used = await spentSince(q, caller.organizationId, start);
  const alerts: UsageAlert[] = [];
  for (const threshold of THRESHOLDS) {
    if (used * 100 < quota * threshold) continue;
    const inserted = await q.query(
      `INSERT INTO usage_alerts (organization_id, period_start, threshold, used_credits, quota_credits) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`, [caller.organizationId, start, threshold, used, quota]);
    if (!inserted.rowCount) continue;
    await audit(q, SYSTEM, { action: `usage.threshold_${threshold}`, targetType: "organization", targetId: caller.organizationId,
      organizationId: caller.organizationId, data: { usedCredits: used, quotaCredits: quota, periodStart: start.toISOString() } });
    alerts.push({ organizationId: caller.organizationId, threshold, usedCredits: used, quotaCredits: quota, periodStart: start });
  }
  return alerts;
}

/** Reservations whose request never settled (a crashed gateway) stop holding credits; the cron calls this. */
export async function expireReservations(q: Queryable, now: Date): Promise<number> {
  const result = await q.query("UPDATE credit_reservations SET status = 'expired', finished_at = $1 WHERE status = 'held' AND expires_at <= $1", [now]);
  return result.rowCount;
}

/** A refusal before any reservation, for the panel's counts. Not written for bad tokens or rate limits. */
export async function recordRefusal(db: Db, record: UsageRecord, code: RefusalCode, now: Date): Promise<void> {
  await releaseRequest(db, { record, status: "refused", errorCode: code, now });
}
