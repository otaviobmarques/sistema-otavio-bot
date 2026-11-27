import { audit, type Actor } from "../audit.ts";
import type { AppContext } from "../context.ts";
import { applySubscriptionSignal, DomainError, type SubscriptionRow } from "../domain/lifecycle.ts";
import { billingAccount, defaultProviderFactory, type ProviderFactory } from "./accounts.ts";
import type { BillingType } from "./provider.ts";
import { cancelAtProvider, providerMessage, subscriptionTotalCents } from "./service.ts";
import { isoDate } from "./subscription-machine.ts";

async function subscriptionById(ctx: AppContext, id: string): Promise<SubscriptionRow> {
  const sub = (await ctx.db.query<SubscriptionRow>("SELECT * FROM subscriptions WHERE id = $1", [id])).rows[0];
  if (!sub) throw new DomainError("Assinatura não encontrada", 404);
  return sub;
}

/**
 * Stops the charges at the provider now and keeps the subscription (and the ArkoBot) running until `endsAt`, when
 * `endScheduledCancellations` ends it. `cancel_at` is written before the provider call, so the provider's
 * SUBSCRIPTION_DELETED webhook, which may arrive before this returns, finds the cancellation already scheduled.
 */
export async function cancelAtPeriodEnd(
  ctx: AppContext, actor: Actor, subscriptionId: string, reason: string, endsAt: Date, factory: ProviderFactory = defaultProviderFactory,
): Promise<void> {
  const sub = await subscriptionById(ctx, subscriptionId);
  if (!sub.provider_subscription_id) throw new DomainError("Esta assinatura não tem cobrança recorrente para encerrar", 409);
  const scheduled = await ctx.db.query(
    "UPDATE subscriptions SET cancel_at = $2, cancel_reason = $3 WHERE id = $1 AND status = 'active' AND cancel_at IS NULL RETURNING id",
    [sub.id, endsAt, reason]);
  if (!scheduled.rows.length) throw new DomainError("O cancelamento desta assinatura já está agendado", 409);
  try {
    await cancelAtProvider(ctx, sub, factory);
  } catch (error) {
    await ctx.db.query("UPDATE subscriptions SET cancel_at = NULL, cancel_reason = NULL WHERE id = $1 AND status <> 'canceled'", [sub.id]);
    throw error;
  }
  await audit(ctx.db, actor, {
    action: "subscription.cancel_scheduled", targetType: "subscription", targetId: sub.id, organizationId: sub.organization_id,
    reason, data: { cancelAt: endsAt.toISOString(), providerSubscriptionId: sub.provider_subscription_id },
  });
}

/**
 * Undoes a scheduled cancellation. The provider's subscription was deleted when the cancellation was scheduled and
 * Asaas cannot restore a deleted subscription, so a new one starts at the same customer, value and payment method,
 * with its first charge on the date the next one was due.
 */
export async function undoCancelAtPeriodEnd(
  ctx: AppContext, actor: Actor, subscriptionId: string, factory: ProviderFactory = defaultProviderFactory,
): Promise<void> {
  const sub = await subscriptionById(ctx, subscriptionId);
  const now = ctx.now();
  if (sub.status === "canceled" || !sub.cancel_at) throw new DomainError("Não há cancelamento agendado", 404);
  if (new Date(sub.cancel_at) <= now) throw new DomainError("O período pago já terminou; assine de novo", 409);
  if (!sub.billing_account_id || !sub.current_period_end || !sub.billing_type) throw new DomainError("Fale com a gente para reativar esta assinatura", 409);
  const account = await billingAccount(ctx.db, sub.billing_account_id);
  const customer = (await ctx.db.query<{ provider_customer_id: string }>(
    "SELECT provider_customer_id FROM billing_customers WHERE organization_id = $1 AND billing_account_id = $2", [sub.organization_id, sub.billing_account_id])).rows[0];
  const plan = (await ctx.db.query<{ name: string; billing_cycle: string }>("SELECT name, billing_cycle FROM plans WHERE id = $1", [sub.plan_id])).rows[0]!;
  if (!account || !customer) throw new DomainError("Fale com a gente para reativar esta assinatura", 409);
  const provider = factory(ctx, account);
  const created = await provider.createSubscription({
    customerId: customer.provider_customer_id, billingType: sub.billing_type as BillingType, valueCents: await subscriptionTotalCents(ctx.db, sub.id),
    nextDueDate: isoDate(new Date(sub.current_period_end)), cycle: plan.billing_cycle === "yearly" ? "YEARLY" : "MONTHLY",
    description: `ArkoBot – plano ${plan.name}`, externalReference: `sub:${sub.id}`,
  }).catch(providerMessage);
  try {
    await ctx.db.tx(async (q) => {
      const { rows } = await q.query(
        `UPDATE subscriptions SET provider_subscription_id = $2, next_due_date = COALESCE($3::date, next_due_date), cancel_at = NULL, cancel_reason = NULL
         WHERE id = $1 AND status <> 'canceled' AND cancel_at > $4 RETURNING id`,
        [sub.id, created.id, created.nextDueDate, now]);
      if (!rows.length) throw new DomainError("O cancelamento já foi concluído; assine de novo", 409);
      await audit(q, actor, {
        action: "subscription.cancel_undone", targetType: "subscription", targetId: sub.id, organizationId: sub.organization_id,
        data: { previousProviderSubscriptionId: sub.provider_subscription_id, providerSubscriptionId: created.id },
      });
    });
  } catch (error) {
    await provider.cancelSubscription(created.id).catch(() => undefined);
    throw error;
  }
}

/** Run by the cron tick: ends the subscriptions whose paid period is over, as an immediate cancellation would. */
export async function endScheduledCancellations(ctx: AppContext): Promise<number> {
  const now = ctx.now();
  const system: Actor = { type: "system", label: "fim do período pago" };
  const due = await ctx.db.query<{ id: string; cancel_reason: string | null }>(
    "SELECT id, cancel_reason FROM subscriptions WHERE cancel_at <= $1 AND status <> 'canceled'", [now]);
  let ended = 0;
  for (const { id, cancel_reason } of due.rows) {
    const next = await ctx.db.tx((q) => applySubscriptionSignal(q, system, id, "paid_period_ended", now, cancel_reason ?? "fim do período pago"));
    if (next) ended++;
  }
  return ended;
}
