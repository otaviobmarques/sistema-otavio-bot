import { audit, type Actor } from "../audit.ts";
import { nextSubscriptionStatus, type BillingSignal, type SubscriptionStatus } from "../billing/subscription-machine.ts";
import type { Queryable } from "../db/db.ts";

export type OrgStatus = "active" | "suspended" | "canceled";
export type OrgReasonCode = "manual" | "billing" | "chargeback" | "subscription_ended";

export interface SubscriptionRow {
  id: string;
  organization_id: string;
  plan_id: string;
  billing_account_id: string | null;
  status: SubscriptionStatus;
  billing_type: string | null;
  provider_subscription_id: string | null;
  price_cents: number;
  credits_per_month: number;
  current_period_start: Date | null;
  current_period_end: Date | null;
  next_due_date: string | null;
  past_due_since: Date | null;
  canceled_at: Date | null;
  courtesy: boolean;
  courtesy_reason: string | null;
  /** YYYY-MM-DD, the last day of the courtesy (Brasília); null = no end. */
  courtesy_until: string | null;
  courtesy_granted_by: string | null;
  /** End of the free trial, when the subscription started with one; also its first due date. */
  trial_ends_at: Date | null;
}

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  document_type: "cpf" | "cnpj";
  document: string;
  billing_email: string | null;
  phone: string | null;
  status: OrgStatus;
  status_reason: string | null;
  status_reason_code: OrgReasonCode | null;
  status_changed_at: Date | null;
  created_at: Date;
}

export class DomainError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function lockOrganization(q: Queryable, id: string): Promise<OrganizationRow> {
  const { rows } = await q.query<OrganizationRow>("SELECT * FROM organizations WHERE id = $1 FOR UPDATE", [id]);
  if (!rows[0]) throw new DomainError("Cliente não encontrado", 404);
  return rows[0];
}

/** Instance states that follow the organisation's billing. Provisioning (next part) acts on these states. */
async function setInstancesForBilling(q: Queryable, organizationId: string, mode: "payment_problem" | "recovered" | "stopped" | "restart", reason: string) {
  if (mode === "payment_problem") {
    await q.query("UPDATE instances SET state = 'payment_problem', state_reason = $2 WHERE organization_id = $1 AND state IN ('ready', 'setting_up')", [organizationId, reason]);
  } else if (mode === "recovered") {
    await q.query("UPDATE instances SET state = 'ready', state_reason = NULL WHERE organization_id = $1 AND state = 'payment_problem'", [organizationId]);
  } else if (mode === "stopped") {
    await q.query("UPDATE instances SET state = 'stopped', state_reason = $2 WHERE organization_id = $1 AND state <> 'failed'", [organizationId, reason]);
  } else {
    await q.query("UPDATE instances SET state = 'setting_up', state_reason = $2 WHERE organization_id = $1 AND state IN ('stopped', 'payment_problem')", [organizationId, reason]);
  }
}

export async function setOrganizationStatus(
  q: Queryable,
  actor: Actor,
  organizationId: string,
  status: OrgStatus,
  reasonCode: OrgReasonCode | null,
  reason: string | null,
): Promise<boolean> {
  const org = await lockOrganization(q, organizationId);
  if (org.status === status && org.status_reason_code === reasonCode) return false;
  if (org.status === "canceled" && status !== "canceled" && actor.type !== "admin") return false;
  await q.query(
    "UPDATE organizations SET status = $2, status_reason_code = $3, status_reason = $4, status_changed_at = now() WHERE id = $1",
    [organizationId, status, status === "active" ? null : reasonCode, status === "active" ? null : reason],
  );
  if (status === "active") await setInstancesForBilling(q, organizationId, "restart", "cliente reativado");
  else await setInstancesForBilling(q, organizationId, "stopped", status === "canceled" ? "cliente cancelado" : `cliente suspenso: ${reason ?? ""}`.trim());
  await audit(q, actor, {
    action: `organization.${status === "active" ? "reactivated" : status}`,
    targetType: "organization", targetId: organizationId, organizationId, reason,
    data: { from: org.status, to: status, reasonCode },
  });
  return true;
}

/**
 * Moves a subscription by a billing signal and carries the consequences to the
 * organisation and its instances. Returns the new status, or null if unchanged.
 */
export async function applySubscriptionSignal(
  q: Queryable,
  actor: Actor,
  subscriptionId: string,
  signal: BillingSignal,
  now: Date,
  reason?: string,
): Promise<SubscriptionStatus | null> {
  const { rows } = await q.query<SubscriptionRow>("SELECT * FROM subscriptions WHERE id = $1 FOR UPDATE", [subscriptionId]);
  const sub = rows[0];
  if (!sub) throw new DomainError("Assinatura não encontrada", 404);
  const next = nextSubscriptionStatus(sub.status, signal);
  if (!next) return null;
  await q.query(
    `UPDATE subscriptions SET status = $2,
       past_due_since = CASE WHEN $2 = 'active' THEN NULL WHEN $2 = 'past_due' THEN COALESCE(past_due_since, $3) ELSE past_due_since END,
       canceled_at = CASE WHEN $2 = 'canceled' THEN $3 ELSE canceled_at END,
       cancel_reason = CASE WHEN $2 = 'canceled' THEN $4 ELSE cancel_reason END
     WHERE id = $1`,
    [sub.id, next, now, reason ?? signal],
  );
  await audit(q, actor, {
    action: `subscription.${next}`, targetType: "subscription", targetId: sub.id, organizationId: sub.organization_id,
    reason: reason ?? null, data: { from: sub.status, to: next, signal },
  });

  const org = await lockOrganization(q, sub.organization_id);
  if (next === "active") {
    await setInstancesForBilling(q, sub.organization_id, "recovered", "");
    if (org.status === "suspended" && (org.status_reason_code === "billing" || org.status_reason_code === "subscription_ended")) {
      await setOrganizationStatus(q, actor, org.id, "active", null, "pagamento regularizado");
    }
  } else if (next === "past_due") {
    await setInstancesForBilling(q, sub.organization_id, "payment_problem", "pagamento em atraso");
  } else if (next === "suspended") {
    const code: OrgReasonCode = signal === "chargeback" ? "chargeback" : "billing";
    const why = signal === "chargeback" ? "contestação (chargeback) do pagamento" : "pagamento em atraso além do prazo";
    if (org.status === "active") await setOrganizationStatus(q, actor, org.id, "suspended", code, why);
  } else if (next === "canceled") {
    if (signal === "dunning_cancel") {
      await setOrganizationStatus(q, actor, org.id, "canceled", "subscription_ended", "assinatura cancelada por falta de pagamento");
    } else if (org.status === "active") {
      await setOrganizationStatus(q, actor, org.id, "suspended", "subscription_ended", reason ?? "assinatura encerrada");
    }
  }
  return next;
}
