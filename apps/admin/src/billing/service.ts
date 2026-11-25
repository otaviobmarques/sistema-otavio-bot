import { randomUUID } from "node:crypto";
import { audit, type Actor } from "../audit.ts";
import type { AppContext } from "../context.ts";
import type { Queryable } from "../db/db.ts";
import { grantPlanPeriod } from "../credits/ledger.ts";
import { applySubscriptionSignal, DomainError, lockOrganization, type OrganizationRow, type SubscriptionRow } from "../domain/lifecycle.ts";
import { enqueue } from "../jobs/queue.ts";
import { activeBillingAccount, billingAccount, defaultProviderFactory, type BillingAccountRow, type ProviderFactory } from "./accounts.ts";
import type { BillingType, PixQrCode } from "./provider.ts";
import { ProviderError } from "./provider.ts";
import { addMonths, isoDate } from "./subscription-machine.ts";

export const CANCEL_PROVIDER_SUBSCRIPTION_JOB = "billing.cancel_provider_subscription";
/** 1 crédito ArkoBot = R$ 0,01. */
export const CENTS_PER_CREDIT = 1;

export interface PlanRow {
  id: string;
  code: string;
  name: string;
  price_cents: number;
  billing_cycle: "monthly" | "yearly";
  credits_per_month: number;
  free: boolean;
  active: boolean;
}

function providerMessage(error: unknown): never {
  if (error instanceof ProviderError) throw new DomainError(`Asaas: ${error.message}`, 502);
  throw error;
}

async function ensureCustomer(ctx: AppContext, factory: ProviderFactory, org: OrganizationRow, account: BillingAccountRow): Promise<string> {
  const existing = await ctx.db.query<{ provider_customer_id: string }>(
    "SELECT provider_customer_id FROM billing_customers WHERE organization_id = $1 AND billing_account_id = $2", [org.id, account.id]);
  if (existing.rows[0]) return existing.rows[0].provider_customer_id;
  const owner = await ctx.db.query<{ email: string; phone: string | null }>(
    `SELECT a.email, a.phone FROM memberships m JOIN accounts a ON a.id = m.account_id WHERE m.organization_id = $1 AND m.role = 'owner'`, [org.id]);
  const customer = await factory(ctx, account).createCustomer({
    name: org.name, cpfCnpj: org.document, email: org.billing_email ?? owner.rows[0]?.email ?? null,
    mobilePhone: org.phone ?? owner.rows[0]?.phone ?? null, externalReference: `org:${org.id}`,
  }).catch(providerMessage);
  await ctx.db.query(
    `INSERT INTO billing_customers (organization_id, billing_account_id, provider_customer_id) VALUES ($1, $2, $3)
     ON CONFLICT (organization_id, billing_account_id) DO NOTHING`, [org.id, account.id, customer.id]);
  const saved = await ctx.db.query<{ provider_customer_id: string }>(
    "SELECT provider_customer_id FROM billing_customers WHERE organization_id = $1 AND billing_account_id = $2", [org.id, account.id]);
  return saved.rows[0]!.provider_customer_id;
}

async function subscriptionTotalCents(q: Queryable, subscriptionId: string): Promise<number> {
  const { rows } = await q.query<{ total: number }>(
    `SELECT s.price_cents + COALESCE((SELECT SUM(quantity * unit_price_cents) FROM subscription_addons WHERE subscription_id = s.id), 0) AS total
     FROM subscriptions s WHERE s.id = $1`, [subscriptionId]);
  return Number(rows[0]?.total ?? 0);
}

export interface StartSubscriptionInput {
  organizationId: string;
  planId: string;
  billingType: BillingType;
  /** YYYY-MM-DD; defaults to today. */
  firstDueDate?: string;
}

/**
 * Starts a plan for a client. A paid plan is created in Asaas under the
 * billing account active for new subscriptions and stays `pending` until the
 * first payment's webhook. A free plan is active at once with its first quota.
 */
export async function startSubscription(ctx: AppContext, actor: Actor, input: StartSubscriptionInput, factory: ProviderFactory = defaultProviderFactory): Promise<SubscriptionRow> {
  const org = await lockOrganization(ctx.db, input.organizationId);
  if (org.status === "canceled") throw new DomainError("Cliente cancelado não recebe nova assinatura");
  const plan = (await ctx.db.query<PlanRow>("SELECT * FROM plans WHERE id = $1", [input.planId])).rows[0];
  if (!plan || !plan.active) throw new DomainError("Plano inexistente ou inativo");
  const current = await ctx.db.query("SELECT 1 FROM subscriptions WHERE organization_id = $1 AND status <> 'canceled'", [org.id]);
  if (current.rows.length) throw new DomainError("Este cliente já tem uma assinatura em andamento; cancele-a antes de iniciar outra", 409);
  const now = ctx.now();

  if (plan.free) {
    return ctx.db.tx(async (q) => {
      const end = addMonths(now, 1);
      const { rows } = await q.query<SubscriptionRow>(
        `INSERT INTO subscriptions (organization_id, plan_id, status, price_cents, credits_per_month, current_period_start, current_period_end, next_due_date)
         VALUES ($1, $2, 'active', 0, $3, $4, $5, $6) RETURNING *`,
        [org.id, plan.id, plan.credits_per_month, now, end, isoDate(end)]);
      const sub = rows[0]!;
      await grantPlanPeriod(q, { organizationId: org.id, quota: Number(plan.credits_per_month), reference: `free:${sub.id}:${isoDate(now)}` });
      await audit(q, actor, { action: "subscription.created", targetType: "subscription", targetId: sub.id, organizationId: org.id, data: { plan: plan.code, free: true } });
      return sub;
    });
  }

  const account = await activeBillingAccount(ctx.db);
  if (!account) throw new DomainError("Cadastre e ative uma conta Asaas em Cobrança antes de criar assinaturas pagas", 409);
  const customerId = await ensureCustomer(ctx, factory, org, account);
  const dueDate = input.firstDueDate ?? isoDate(now);
  const pending = await ctx.db.tx(async (q) => {
    const { rows } = await q.query<SubscriptionRow>(
      `INSERT INTO subscriptions (organization_id, plan_id, billing_account_id, status, billing_type, price_cents, credits_per_month, next_due_date)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7) RETURNING *`,
      [org.id, plan.id, account.id, input.billingType, plan.price_cents, plan.credits_per_month, dueDate]);
    return rows[0]!;
  });
  try {
    const created = await factory(ctx, account).createSubscription({
      customerId, billingType: input.billingType, valueCents: plan.price_cents, nextDueDate: dueDate,
      cycle: plan.billing_cycle === "yearly" ? "YEARLY" : "MONTHLY", description: `ArkoBot – plano ${plan.name}`,
      externalReference: `sub:${pending.id}`,
    });
    return await ctx.db.tx(async (q) => {
      const { rows } = await q.query<SubscriptionRow>(
        "UPDATE subscriptions SET provider_subscription_id = $2, next_due_date = COALESCE($3::date, next_due_date) WHERE id = $1 RETURNING *",
        [pending.id, created.id, created.nextDueDate]);
      await audit(q, actor, {
        action: "subscription.created", targetType: "subscription", targetId: pending.id, organizationId: org.id,
        data: { plan: plan.code, billingType: input.billingType, billingAccountId: account.id, providerSubscriptionId: created.id },
      });
      return rows[0]!;
    });
  } catch (error) {
    await ctx.db.query("UPDATE subscriptions SET status = 'canceled', canceled_at = now(), cancel_reason = $2 WHERE id = $1",
      [pending.id, `falha ao criar no Asaas: ${(error as Error).message}`.slice(0, 500)]);
    return providerMessage(error);
  }
}

/** Cancels at the provider first (so it stops charging), then locally. */
export async function cancelSubscription(ctx: AppContext, actor: Actor, subscriptionId: string, reason: string, factory: ProviderFactory = defaultProviderFactory): Promise<void> {
  const sub = (await ctx.db.query<SubscriptionRow>("SELECT * FROM subscriptions WHERE id = $1", [subscriptionId])).rows[0];
  if (!sub) throw new DomainError("Assinatura não encontrada", 404);
  if (sub.status === "canceled") throw new DomainError("A assinatura já está cancelada");
  if (sub.provider_subscription_id && sub.billing_account_id) {
    const account = await billingAccount(ctx.db, sub.billing_account_id);
    if (account) {
      await factory(ctx, account).cancelSubscription(sub.provider_subscription_id).catch((error) => {
        if (error instanceof ProviderError && error.status === 404) return;
        providerMessage(error);
      });
    }
  }
  await ctx.db.tx((q) => applySubscriptionSignal(q, actor, sub.id, "admin_cancel", ctx.now(), reason));
}

export async function cancelProviderSubscriptionJob(ctx: AppContext, payload: Record<string, unknown>): Promise<void> {
  const sub = (await ctx.db.query<SubscriptionRow>("SELECT * FROM subscriptions WHERE id = $1", [String(payload.subscriptionId)])).rows[0];
  if (!sub?.provider_subscription_id || !sub.billing_account_id) return;
  const account = await billingAccount(ctx.db, sub.billing_account_id);
  if (!account) return;
  await defaultProviderFactory(ctx, account).cancelSubscription(sub.provider_subscription_id).catch((error) => {
    if (error instanceof ProviderError && error.status === 404) return;
    throw error;
  });
}

/** Sets how many of an add-on (e.g. an extra computer per bot) the subscription carries and updates the recurring value at the provider. */
export async function setSubscriptionAddon(
  ctx: AppContext, actor: Actor, subscriptionId: string, addonId: string, quantity: number, factory: ProviderFactory = defaultProviderFactory,
): Promise<number> {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 500) throw new DomainError("Quantidade inválida");
  const sub = (await ctx.db.query<SubscriptionRow>("SELECT * FROM subscriptions WHERE id = $1", [subscriptionId])).rows[0];
  if (!sub || sub.status === "canceled") throw new DomainError("Assinatura inexistente ou cancelada", 404);
  const addon = (await ctx.db.query<{ id: string; code: string; price_cents: number; paid_plans_only: boolean; active: boolean }>(
    "SELECT * FROM addons WHERE id = $1", [addonId])).rows[0];
  if (!addon || !addon.active) throw new DomainError("Adicional inexistente ou inativo");
  if (addon.paid_plans_only && sub.price_cents === 0) throw new DomainError("Este adicional só está disponível nos planos pagos");
  const total = await ctx.db.tx(async (q) => {
    if (quantity === 0) await q.query("DELETE FROM subscription_addons WHERE subscription_id = $1 AND addon_id = $2", [sub.id, addon.id]);
    else {
      await q.query(
        `INSERT INTO subscription_addons (subscription_id, addon_id, quantity, unit_price_cents) VALUES ($1, $2, $3, $4)
         ON CONFLICT (subscription_id, addon_id) DO UPDATE SET quantity = excluded.quantity`,
        [sub.id, addon.id, quantity, addon.price_cents]);
    }
    const value = await subscriptionTotalCents(q, sub.id);
    await audit(q, actor, { action: "subscription.addon_changed", targetType: "subscription", targetId: sub.id, organizationId: sub.organization_id,
      data: { addon: addon.code, quantity, totalCents: value } });
    return value;
  });
  if (sub.provider_subscription_id && sub.billing_account_id) {
    const account = await billingAccount(ctx.db, sub.billing_account_id);
    if (account) await factory(ctx, account).updateSubscriptionValue(sub.provider_subscription_id, total, "ArkoBot – assinatura com adicionais").catch(providerMessage);
  }
  return total;
}

export interface CreditChargeResult {
  paymentId: string;
  providerPaymentId: string;
  valueCents: number;
  credits: number;
  invoiceUrl: string | null;
  pix: PixQrCode | null;
}

/** A one-off charge for extra credits; the credits land in the wallet when the payment is confirmed. */
export async function createCreditCharge(
  ctx: AppContext, actor: Actor, input: { organizationId: string; credits: number; billingType: BillingType; dueDate?: string },
  factory: ProviderFactory = defaultProviderFactory,
): Promise<CreditChargeResult> {
  if (!Number.isInteger(input.credits) || input.credits < 500 || input.credits > 10_000_000) {
    throw new DomainError("Compra mínima de 500 créditos (R$ 5,00)");
  }
  const org = await lockOrganization(ctx.db, input.organizationId);
  if (org.status === "canceled") throw new DomainError("Cliente cancelado");
  const account = await activeBillingAccount(ctx.db);
  if (!account) throw new DomainError("Nenhuma conta Asaas ativa para novas cobranças", 409);
  const customerId = await ensureCustomer(ctx, factory, org, account);
  const paymentId = randomUUID();
  const valueCents = input.credits * CENTS_PER_CREDIT;
  const provider = factory(ctx, account);
  const charge = await provider.createCharge({
    customerId, billingType: input.billingType, valueCents, dueDate: input.dueDate ?? isoDate(addMonths(ctx.now(), 0)),
    description: `ArkoBot – ${input.credits.toLocaleString("pt-BR")} créditos`, externalReference: `credits:${paymentId}`,
  }).catch(providerMessage);
  const pix = input.billingType === "PIX" ? await provider.pixQrCode(charge.id).catch(() => null) : null;
  await ctx.db.tx(async (q) => {
    await q.query(
      `INSERT INTO payments (id, organization_id, billing_account_id, kind, provider_payment_id, status, billing_type, value_cents, credits, due_date, invoice_url, pix_payload, external_reference)
       VALUES ($1, $2, $3, 'credit_purchase', $4, 'pending', $5, $6, $7, $8, $9, $10, $11)`,
      [paymentId, org.id, account.id, charge.id, input.billingType, valueCents, input.credits, charge.dueDate, charge.invoiceUrl, pix?.payload ?? null, `credits:${paymentId}`]);
    await audit(q, actor, { action: "payment.credit_charge_created", targetType: "payment", targetId: paymentId, organizationId: org.id,
      data: { credits: input.credits, valueCents, billingType: input.billingType } });
  });
  return { paymentId, providerPaymentId: charge.id, valueCents, credits: input.credits, invoiceUrl: charge.invoiceUrl, pix };
}

export interface DunningSummary {
  suspended: number;
  canceled: number;
  freeRenewed: number;
}

/**
 * The overdue ladder, run by the cron tick: overdue (past_due, instances flagged
 * payment_problem) → suspended after `suspendAfterDays` → subscription and
 * client canceled after `cancelAfterDays`, with the provider subscription
 * cancelled by a queued job. Free plans get their monthly quota here too.
 */
export async function runDunning(ctx: AppContext): Promise<DunningSummary> {
  const now = ctx.now();
  const day = 24 * 60 * 60_000;
  const summary: DunningSummary = { suspended: 0, canceled: 0, freeRenewed: 0 };
  const system: Actor = { type: "system", label: "régua de inadimplência" };

  const toSuspend = await ctx.db.query<{ id: string }>(
    "SELECT id FROM subscriptions WHERE status = 'past_due' AND past_due_since <= $1",
    [new Date(now.getTime() - ctx.config.dunning.suspendAfterDays * day)]);
  for (const { id } of toSuspend.rows) {
    const next = await ctx.db.tx((q) => applySubscriptionSignal(q, system, id, "dunning_suspend", now,
      `${ctx.config.dunning.suspendAfterDays} dias em atraso`));
    if (next) summary.suspended++;
  }

  const toCancel = await ctx.db.query<{ id: string }>(
    `SELECT s.id FROM subscriptions s JOIN organizations o ON o.id = s.organization_id
     WHERE s.status = 'suspended' AND o.status_reason_code = 'billing' AND s.past_due_since <= $1`,
    [new Date(now.getTime() - ctx.config.dunning.cancelAfterDays * day)]);
  for (const { id } of toCancel.rows) {
    const next = await ctx.db.tx(async (q) => {
      const result = await applySubscriptionSignal(q, system, id, "dunning_cancel", now, `${ctx.config.dunning.cancelAfterDays} dias em atraso`);
      if (result) await enqueue(q, CANCEL_PROVIDER_SUBSCRIPTION_JOB, { subscriptionId: id }, { dedupeKey: `cancel_provider_subscription:${id}` });
      return result;
    });
    if (next) summary.canceled++;
  }

  const freeDue = await ctx.db.query<SubscriptionRow>(
    `SELECT s.* FROM subscriptions s JOIN plans p ON p.id = s.plan_id
     WHERE p.free AND s.status = 'active' AND s.current_period_end <= $1`, [now]);
  for (const sub of freeDue.rows) {
    await ctx.db.tx(async (q) => {
      const start = sub.current_period_end!;
      const end = addMonths(start, 1);
      await grantPlanPeriod(q, { organizationId: sub.organization_id, quota: Number(sub.credits_per_month), reference: `free:${sub.id}:${isoDate(start)}` });
      await q.query("UPDATE subscriptions SET current_period_start = $2, current_period_end = $3, next_due_date = $4 WHERE id = $1",
        [sub.id, start, end, isoDate(end)]);
    });
    summary.freeRenewed++;
  }
  return summary;
}
