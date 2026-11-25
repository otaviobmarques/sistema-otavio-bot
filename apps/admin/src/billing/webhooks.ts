import { audit, type Actor } from "../audit.ts";
import type { AppContext } from "../context.ts";
import type { Queryable } from "../db/db.ts";
import { grantPlanPeriod, postLedger, reversePaymentCredits } from "../credits/ledger.ts";
import { applySubscriptionSignal, type SubscriptionRow } from "../domain/lifecycle.ts";
import { enqueue } from "../jobs/queue.ts";
import { safeEqual } from "../security/crypto.ts";
import { billingAccount, webhookTokenContext } from "./accounts.ts";
import { normalizeAsaasEvent } from "./asaas.ts";
import type { NormalizedEvent, NormalizedPayment } from "./provider.ts";
import { addMonths, isoDate, isPaid, paymentStatusFromAsaas } from "./subscription-machine.ts";

export const PROCESS_EVENT_JOB = "billing.process_event";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type IngestResult =
  | { status: 200; duplicate: boolean; billingEventId: string; jobId: number | null }
  | { status: 400 | 401 | 404; error: string };

/**
 * Stores the raw event once (unique per account and event id) and queues its
 * processing. Asaas delivers at least once and expects a quick 200, so all
 * business logic runs in the job.
 */
export async function ingestAsaasWebhook(ctx: AppContext, billingAccountId: string, token: string | undefined, body: unknown): Promise<IngestResult> {
  if (!UUID.test(billingAccountId)) return { status: 404, error: "conta de cobrança desconhecida" };
  const account = await billingAccount(ctx.db, billingAccountId);
  if (!account) return { status: 404, error: "conta de cobrança desconhecida" };
  const expected = ctx.box.decrypt(account.webhook_token_enc, webhookTokenContext(account.id));
  if (!token || !safeEqual(token, expected)) return { status: 401, error: "token do webhook inválido" };
  const event = normalizeAsaasEvent(body);
  if (!event) return { status: 400, error: "evento sem id ou tipo" };
  return ctx.db.tx(async (q) => {
    const inserted = await q.query<{ id: string }>(
      `INSERT INTO billing_events (billing_account_id, provider, event_id, event_type, payload, received_at)
       VALUES ($1, 'asaas', $2, $3, $4, $5) ON CONFLICT (billing_account_id, event_id) DO NOTHING RETURNING id`,
      [account.id, event.id, event.type, JSON.stringify(body), ctx.now()],
    );
    if (!inserted.rows[0]) {
      const existing = await q.query<{ id: string }>("SELECT id FROM billing_events WHERE billing_account_id = $1 AND event_id = $2", [account.id, event.id]);
      return { status: 200, duplicate: true, billingEventId: existing.rows[0]!.id, jobId: null } as const;
    }
    const id = inserted.rows[0].id;
    const jobId = await enqueue(q, PROCESS_EVENT_JOB, { billingEventId: id }, { dedupeKey: `billing_event:${id}` });
    return { status: 200, duplicate: false, billingEventId: id, jobId } as const;
  });
}

interface PaymentRow {
  id: string;
  organization_id: string;
  subscription_id: string | null;
  billing_account_id: string;
  kind: "subscription" | "credit_purchase";
  provider_payment_id: string;
  status: string;
  credits: number;
  value_cents: number;
  due_date: string | null;
}

const WEBHOOK: Actor = { type: "webhook", label: "Asaas" };

const FINAL = new Set(["refunded", "chargeback"]);

/** Whether a payment may move from `current` to `next`. Paid never goes back to pending or overdue; refunds and chargebacks are final. */
function paymentMayMove(current: string, next: string): boolean {
  if (current === next) return false;
  if (FINAL.has(current)) return false;
  if (isPaid(current)) return next === "received" || next === "refunded" || next === "chargeback";
  return true;
}

async function subscriptionByProviderId(q: Queryable, billingAccountId: string, providerId: string): Promise<SubscriptionRow | null> {
  const { rows } = await q.query<SubscriptionRow>(
    "SELECT * FROM subscriptions WHERE billing_account_id = $1 AND provider_subscription_id = $2", [billingAccountId, providerId]);
  return rows[0] ?? null;
}

/** The local payment for a provider payment, created from the event when only the subscription is known. */
async function upsertPayment(q: Queryable, billingAccountId: string, payment: NormalizedPayment): Promise<PaymentRow | null> {
  const found = await q.query<PaymentRow>(
    "SELECT * FROM payments WHERE billing_account_id = $1 AND provider_payment_id = $2 FOR UPDATE", [billingAccountId, payment.id]);
  if (found.rows[0]) return found.rows[0];
  if (!payment.subscriptionId) return null;
  const sub = await subscriptionByProviderId(q, billingAccountId, payment.subscriptionId);
  if (!sub) return null;
  const { rows } = await q.query<PaymentRow>(
    `INSERT INTO payments (organization_id, subscription_id, billing_account_id, kind, provider_payment_id, status, billing_type, value_cents, due_date, invoice_url, external_reference)
     VALUES ($1, $2, $3, 'subscription', $4, 'pending', $5, $6, $7, $8, $9)
     ON CONFLICT (billing_account_id, provider_payment_id) DO UPDATE SET updated_at = now()
     RETURNING *`,
    [sub.organization_id, sub.id, billingAccountId, payment.id, payment.billingType, payment.valueCents, payment.dueDate, payment.invoiceUrl, payment.externalReference],
  );
  return rows[0]!;
}

async function setPaymentStatus(q: Queryable, row: PaymentRow, next: string, payment: NormalizedPayment, now: Date): Promise<boolean> {
  if (!paymentMayMove(row.status, next)) return false;
  await q.query(
    `UPDATE payments SET status = $2, paid_at = CASE WHEN $2 IN ('confirmed', 'received') THEN COALESCE(paid_at, $3) ELSE paid_at END,
       billing_type = COALESCE($4, billing_type), invoice_url = COALESCE($5, invoice_url), value_cents = $6, due_date = COALESCE($7, due_date)
     WHERE id = $1`,
    [row.id, next, payment.paidAt ? new Date(payment.paidAt) : now, payment.billingType, payment.invoiceUrl, payment.valueCents, payment.dueDate],
  );
  return true;
}

async function onPaid(ctx: AppContext, q: Queryable, row: PaymentRow, payment: NormalizedPayment, wasPaid: boolean): Promise<string> {
  const now = ctx.now();
  if (row.kind === "credit_purchase") {
    if (row.credits <= 0) return "compra de créditos sem quantidade";
    const post = await postLedger(q, {
      organizationId: row.organization_id, bucket: "extra", kind: "purchase", amount: row.credits,
      externalReference: `payment:${row.id}:purchase`, billingAccountId: row.billing_account_id, paymentId: row.id,
      reason: "Compra avulsa de créditos",
    });
    return post.applied ? `${Number(row.credits).toLocaleString("pt-BR")} créditos avulsos creditados` : "créditos já creditados";
  }
  if (!row.subscription_id) return "pagamento sem assinatura";
  const { rows } = await q.query<SubscriptionRow>("SELECT * FROM subscriptions WHERE id = $1 FOR UPDATE", [row.subscription_id]);
  const sub = rows[0]!;
  if (sub.status === "canceled") {
    await audit(q, WEBHOOK, { action: "payment.after_cancel", targetType: "payment", targetId: row.id, organizationId: row.organization_id,
      reason: "Pagamento recebido de uma assinatura cancelada; nada foi reativado" });
    return "assinatura cancelada: pagamento registrado sem reativar";
  }
  const granted = await grantPlanPeriod(q, {
    organizationId: row.organization_id, quota: Number(sub.credits_per_month), reference: `payment:${row.id}`,
    billingAccountId: row.billing_account_id, paymentId: row.id, metadata: { subscriptionId: sub.id },
  });
  if (!wasPaid) {
    const dueDate = payment.dueDate ?? row.due_date;
    const start = dueDate ? new Date(`${dueDate.slice(0, 10)}T00:00:00Z`) : now;
    const months = await cycleMonths(q, sub.plan_id);
    const end = addMonths(start, months);
    await q.query(
      `UPDATE subscriptions SET current_period_start = GREATEST(COALESCE(current_period_start, $2), $2),
         current_period_end = GREATEST(COALESCE(current_period_end, $3), $3), next_due_date = $4 WHERE id = $1`,
      [sub.id, start, end, isoDate(end)],
    );
  }
  await applySubscriptionSignal(q, WEBHOOK, sub.id, "payment_paid", now, "pagamento confirmado");
  return granted ? `cota de ${Number(sub.credits_per_month).toLocaleString("pt-BR")} créditos do plano creditada` : "cota do período já creditada";
}

async function cycleMonths(q: Queryable, planId: string): Promise<number> {
  const { rows } = await q.query<{ billing_cycle: string }>("SELECT billing_cycle FROM plans WHERE id = $1", [planId]);
  return rows[0]?.billing_cycle === "yearly" ? 12 : 1;
}

async function handlePaymentEvent(ctx: AppContext, q: Queryable, accountId: string, event: NormalizedEvent): Promise<{ status: "processed" | "ignored"; note: string }> {
  const payment = event.payment;
  if (!payment) return { status: "ignored", note: "evento de cobrança sem cobrança" };
  const row = await upsertPayment(q, accountId, payment);
  if (!row) return { status: "ignored", note: "cobrança desconhecida (sem assinatura ou compra registrada)" };
  const now = ctx.now();
  const wasPaid = isPaid(row.status);
  switch (event.type) {
    case "PAYMENT_CREATED":
    case "PAYMENT_UPDATED": {
      const next = paymentStatusFromAsaas(payment.status);
      if (next && !isPaid(row.status) && !FINAL.has(row.status)) await setPaymentStatus(q, row, next, payment, now);
      return { status: "processed", note: "cobrança registrada" };
    }
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED": {
      if (FINAL.has(row.status)) return { status: "ignored", note: `cobrança já ${row.status}` };
      await setPaymentStatus(q, row, event.type === "PAYMENT_RECEIVED" ? "received" : "confirmed", payment, now);
      return { status: "processed", note: await onPaid(ctx, q, row, payment, wasPaid) };
    }
    case "PAYMENT_OVERDUE": {
      if (wasPaid || FINAL.has(row.status)) return { status: "ignored", note: "aviso de atraso de uma cobrança já paga ou encerrada" };
      await setPaymentStatus(q, row, "overdue", payment, now);
      if (row.subscription_id) await applySubscriptionSignal(q, WEBHOOK, row.subscription_id, "payment_overdue", now, "cobrança vencida");
      return { status: "processed", note: "cobrança vencida" };
    }
    case "PAYMENT_REFUNDED": {
      if (!(await setPaymentStatus(q, row, "refunded", payment, now))) return { status: "ignored", note: "estorno já registrado" };
      const reversed = await reversePaymentCredits(q, {
        organizationId: row.organization_id, paymentId: row.id, kind: "refund_reversal", reference: `payment:${row.id}:refund`,
        billingAccountId: row.billing_account_id, reason: "Pagamento estornado",
      });
      await audit(q, WEBHOOK, { action: "payment.refunded", targetType: "payment", targetId: row.id, organizationId: row.organization_id, data: { reversedCredits: reversed } });
      return { status: "processed", note: `estorno: ${reversed} créditos retirados` };
    }
    case "PAYMENT_CHARGEBACK_REQUESTED":
    case "PAYMENT_CHARGEBACK_DISPUTE": {
      if (!(await setPaymentStatus(q, row, "chargeback", payment, now))) return { status: "ignored", note: "chargeback já registrado" };
      const reversed = await reversePaymentCredits(q, {
        organizationId: row.organization_id, paymentId: row.id, kind: "chargeback_reversal", reference: `payment:${row.id}:chargeback`,
        billingAccountId: row.billing_account_id, reason: "Contestação (chargeback) do pagamento",
      });
      if (row.subscription_id) await applySubscriptionSignal(q, WEBHOOK, row.subscription_id, "chargeback", now, "chargeback");
      return { status: "processed", note: `chargeback: ${reversed} créditos retirados e cliente suspenso` };
    }
    case "PAYMENT_DELETED": {
      if (wasPaid || FINAL.has(row.status)) return { status: "ignored", note: "cobrança paga não é removida" };
      await q.query("UPDATE payments SET status = 'canceled' WHERE id = $1", [row.id]);
      return { status: "processed", note: "cobrança removida no Asaas" };
    }
    default:
      return { status: "ignored", note: `evento ${event.type} sem efeito` };
  }
}

async function handleSubscriptionEvent(ctx: AppContext, q: Queryable, accountId: string, event: NormalizedEvent): Promise<{ status: "processed" | "ignored"; note: string }> {
  if (!event.subscription) return { status: "ignored", note: "evento de assinatura sem assinatura" };
  if (event.type !== "SUBSCRIPTION_DELETED" && event.type !== "SUBSCRIPTION_INACTIVATED") return { status: "ignored", note: `evento ${event.type} sem efeito` };
  const sub = await subscriptionByProviderId(q, accountId, event.subscription.id);
  if (!sub) return { status: "ignored", note: "assinatura desconhecida" };
  const next = await applySubscriptionSignal(q, WEBHOOK, sub.id, "provider_ended", ctx.now(),
    event.type === "SUBSCRIPTION_DELETED" ? "assinatura removida no Asaas" : "assinatura inativada no Asaas");
  return { status: "processed", note: next ? "assinatura encerrada" : "assinatura já estava encerrada" };
}

/** Processes one stored event exactly once: the row lock and its final status make a replay a no-op. */
export async function processBillingEvent(ctx: AppContext, billingEventId: string): Promise<string> {
  return ctx.db.tx(async (q) => {
    const { rows } = await q.query<{ id: string; billing_account_id: string; payload: unknown; status: string }>(
      "SELECT id, billing_account_id, payload, status FROM billing_events WHERE id = $1 FOR UPDATE", [billingEventId]);
    const stored = rows[0];
    if (!stored) throw new Error("evento de cobrança não encontrado");
    if (stored.status === "processed" || stored.status === "ignored") return "já processado";
    const payload = typeof stored.payload === "string" ? JSON.parse(stored.payload) : stored.payload;
    const event = normalizeAsaasEvent(payload);
    const result = !event
      ? { status: "ignored" as const, note: "evento ilegível" }
      : event.type.startsWith("PAYMENT_")
        ? await handlePaymentEvent(ctx, q, stored.billing_account_id, event)
        : event.type.startsWith("SUBSCRIPTION_")
          ? await handleSubscriptionEvent(ctx, q, stored.billing_account_id, event)
          : { status: "ignored" as const, note: "tipo de evento não tratado" };
    await q.query("UPDATE billing_events SET status = $2, processed_at = $3, error = $4 WHERE id = $1",
      [stored.id, result.status, ctx.now(), result.note]);
    return result.note;
  });
}

export async function markBillingEventFailed(ctx: AppContext, billingEventId: string, message: string): Promise<void> {
  await ctx.db.query("UPDATE billing_events SET error = $2 WHERE id = $1 AND status = 'received'", [billingEventId, message.slice(0, 1000)]);
}
