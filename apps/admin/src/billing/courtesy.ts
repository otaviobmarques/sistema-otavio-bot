import { audit, type Actor } from "../audit.ts";
import type { AppContext } from "../context.ts";
import { grantPlanPeriod } from "../credits/ledger.ts";
import type { Queryable } from "../db/db.ts";
import { applySubscriptionSignal, DomainError, lockOrganization, setOrganizationStatus, type SubscriptionRow } from "../domain/lifecycle.ts";
import { enqueue } from "../jobs/queue.ts";
import { CANCEL_PROVIDER_SUBSCRIPTION_JOB, type PlanRow } from "./service.ts";
import { addMonths, brasiliaDate, isoDate } from "./subscription-machine.ts";

export const COURTESY_ENDED_REASON = "Cortesia encerrada";
const REPLACED_BY_COURTESY = "Substituída por cortesia";

export interface GrantCourtesyInput {
  organizationId: string;
  planId: string;
  /** YYYY-MM-DD, the last day (Brasília) the courtesy is valid; omitted or null = no end. */
  until?: string | null;
  reason: string;
}

export interface CourtesySummary {
  renewed: number;
  ended: number;
}

function courtesyReference(subscriptionId: string, periodStart: Date): string {
  return `courtesy:${subscriptionId}:${isoDate(periodStart)}`;
}

async function replacePendingSubscription(q: Queryable, actor: Actor, sub: SubscriptionRow, now: Date): Promise<void> {
  await q.query("UPDATE subscriptions SET status = 'canceled', canceled_at = $2, cancel_reason = $3 WHERE id = $1", [sub.id, now, REPLACED_BY_COURTESY]);
  await q.query("UPDATE payments SET status = 'canceled' WHERE subscription_id = $1 AND status = 'pending'", [sub.id]);
  if (sub.provider_subscription_id) {
    await enqueue(q, CANCEL_PROVIDER_SUBSCRIPTION_JOB, { subscriptionId: sub.id }, { dedupeKey: `cancel_provider_subscription:${sub.id}`, runAt: now });
  }
  await audit(q, actor, {
    action: "subscription.canceled", targetType: "subscription", targetId: sub.id, organizationId: sub.organization_id,
    reason: REPLACED_BY_COURTESY, data: { from: sub.status, to: "canceled", signal: "replaced_by_courtesy" },
  });
}

/**
 * Gives a client a plan without charging: an active subscription with no billing account, its first
 * monthly quota at once, renewed by the cron tick until `until`. A pending (never paid) subscription is
 * replaced and cancelled at Asaas by a queued job; a paying one is refused, so a paying customer is never
 * dropped by accident.
 */
export async function grantCourtesy(ctx: AppContext, actor: Actor, input: GrantCourtesyInput): Promise<SubscriptionRow> {
  if (actor.type !== "admin" && actor.type !== "cli") throw new DomainError("Só a equipe ArkoBot libera cortesias", 403);
  const reason = input.reason.trim();
  if (reason.length < 5) throw new DomainError("Explique o motivo da cortesia (mínimo 5 caracteres)");
  const now = ctx.now();
  const until = input.until ?? null;
  if (until !== null && until < brasiliaDate(now)) throw new DomainError("A data final da cortesia já passou");

  return ctx.db.tx(async (q) => {
    const org = await lockOrganization(q, input.organizationId);
    if (org.status === "canceled") throw new DomainError("Cliente cancelado não recebe cortesia");
    const plan = (await q.query<PlanRow>("SELECT * FROM plans WHERE id = $1", [input.planId])).rows[0];
    if (!plan || !plan.active) throw new DomainError("Plano inexistente ou inativo");
    if (plan.free) throw new DomainError("O plano gratuito já não tem cobrança; escolha um plano pago para a cortesia");
    const current = (await q.query<SubscriptionRow>(
      "SELECT * FROM subscriptions WHERE organization_id = $1 AND status <> 'canceled' FOR UPDATE", [org.id])).rows[0];
    if (current?.courtesy) throw new DomainError("Este cliente já tem uma cortesia; encerre-a antes de liberar outra", 409);
    if (current && current.status !== "pending") {
      throw new DomainError("Este cliente tem uma assinatura paga em andamento. Cancele-a antes de liberar a cortesia", 409);
    }
    if (current) await replacePendingSubscription(q, actor, current, now);

    const end = addMonths(now, 1);
    const { rows } = await q.query<SubscriptionRow>(
      `INSERT INTO subscriptions (organization_id, plan_id, status, price_cents, credits_per_month, current_period_start, current_period_end,
         courtesy, courtesy_reason, courtesy_until, courtesy_granted_by)
       VALUES ($1, $2, 'active', 0, $3, $4, $5, true, $6, $7, $8) RETURNING *`,
      [org.id, plan.id, plan.credits_per_month, now, end, reason, until, actor.type === "admin" ? actor.id : null]);
    const sub = rows[0]!;
    await grantPlanPeriod(q, {
      organizationId: org.id, quota: Number(plan.credits_per_month), reference: courtesyReference(sub.id, now),
      metadata: { subscriptionId: sub.id, courtesy: true },
    });
    if (org.status === "suspended" && (org.status_reason_code === "billing" || org.status_reason_code === "subscription_ended")) {
      await setOrganizationStatus(q, actor, org.id, "active", null, "cortesia liberada");
    }
    await audit(q, actor, {
      action: "subscription.courtesy_granted", targetType: "subscription", targetId: sub.id, organizationId: org.id, reason,
      data: { plan: plan.code, until, creditsPerMonth: Number(plan.credits_per_month), replacedSubscriptionId: current?.id ?? null },
    });
    return sub;
  });
}

/** Ends a courtesy now, with the same effect on the client as a subscription that ended. */
export async function revokeCourtesy(ctx: AppContext, actor: Actor, subscriptionId: string, reason: string): Promise<void> {
  const text = reason.trim();
  if (text.length < 5) throw new DomainError("Explique o motivo (mínimo 5 caracteres)");
  await ctx.db.tx(async (q) => {
    const sub = (await q.query<SubscriptionRow>("SELECT * FROM subscriptions WHERE id = $1 FOR UPDATE", [subscriptionId])).rows[0];
    if (!sub?.courtesy) throw new DomainError("Cortesia não encontrada", 404);
    if (sub.status === "canceled") throw new DomainError("A cortesia já foi encerrada");
    await applySubscriptionSignal(q, actor, sub.id, "admin_cancel", ctx.now(), `${COURTESY_ENDED_REASON}: ${text}`.slice(0, 500));
    await audit(q, actor, {
      action: "subscription.courtesy_revoked", targetType: "subscription", targetId: sub.id, organizationId: sub.organization_id, reason: text,
    });
  });
}

/**
 * Run by the cron tick: ends courtesies whose last day has passed, then grants the next monthly quota
 * to the ones whose period is over. A period missed while the cron was down is skipped, not granted twice.
 */
export async function renewCourtesies(ctx: AppContext): Promise<CourtesySummary> {
  const now = ctx.now();
  const summary: CourtesySummary = { renewed: 0, ended: 0 };
  const system: Actor = { type: "system", label: "cortesia" };

  const expired = await ctx.db.query<{ id: string }>(
    "SELECT id FROM subscriptions WHERE courtesy AND status = 'active' AND courtesy_until < $1", [brasiliaDate(now)]);
  for (const { id } of expired.rows) {
    const next = await ctx.db.tx((q) => applySubscriptionSignal(q, system, id, "courtesy_expired", now, COURTESY_ENDED_REASON));
    if (next) summary.ended++;
  }

  const due = await ctx.db.query<{ id: string }>(
    "SELECT id FROM subscriptions WHERE courtesy AND status = 'active' AND current_period_end <= $1", [now]);
  for (const { id } of due.rows) {
    const renewed = await ctx.db.tx(async (q) => {
      const sub = (await q.query<SubscriptionRow>("SELECT * FROM subscriptions WHERE id = $1 FOR UPDATE", [id])).rows[0];
      if (!sub || sub.status !== "active" || !sub.current_period_end || sub.current_period_end > now) return false;
      const anchor = sub.current_period_end;
      let months = 0;
      while (addMonths(anchor, months + 1) <= now) months++;
      const start = addMonths(anchor, months);
      const end = addMonths(anchor, months + 1);
      await grantPlanPeriod(q, {
        organizationId: sub.organization_id, quota: Number(sub.credits_per_month), reference: courtesyReference(sub.id, start),
        metadata: { subscriptionId: sub.id, courtesy: true },
      });
      await q.query("UPDATE subscriptions SET current_period_start = $2, current_period_end = $3 WHERE id = $1", [sub.id, start, end]);
      return true;
    });
    if (renewed) summary.renewed++;
  }
  return summary;
}
