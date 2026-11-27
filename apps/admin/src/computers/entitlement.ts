// How many own computers an organisation may have: the plan's included ones (plans.included_vps) plus the "Computador
// próprio (VPS)" add-on. Buying waits for money: nothing during a free trial, and add-on units only once a confirmed
// payment covered them. Keeping is looser: a late payment keeps the machines; only the end of the subscription releases them.
import type { Queryable } from "../db/db.ts";
import { EXTRA_COMPUTER_ADDON } from "../customer/catalog.ts";

export interface Entitlement {
  subscriptionId: string | null;
  /** Machines that may be bought now. */
  buy: number;
  /** Machines that may be kept; more than this are released. */
  keep: number;
}

export const NO_ENTITLEMENT: Entitlement = { subscriptionId: null, buy: 0, keep: 0 };

interface Row {
  id: string;
  status: string;
  courtesy: boolean;
  trial_ends_at: Date | null;
  price_cents: number;
  included_vps: number;
  quantity: number | null;
  unit_price_cents: number | null;
  last_paid_cents: number | null;
  org_status: string;
}

export async function entitlementOf(q: Queryable, organizationId: string, now: Date): Promise<Entitlement> {
  const { rows } = await q.query<Row>(
    `SELECT s.id, s.status, s.courtesy, s.trial_ends_at, s.price_cents, p.included_vps, sa.quantity, sa.unit_price_cents, o.status AS org_status,
       (SELECT pay.value_cents FROM payments pay WHERE pay.subscription_id = s.id AND pay.status IN ('confirmed', 'received')
        ORDER BY pay.paid_at DESC NULLS LAST, pay.created_at DESC LIMIT 1) AS last_paid_cents
     FROM subscriptions s JOIN plans p ON p.id = s.plan_id JOIN organizations o ON o.id = s.organization_id
     LEFT JOIN subscription_addons sa ON sa.subscription_id = s.id AND sa.addon_id = (SELECT id FROM addons WHERE code = $2)
     WHERE s.organization_id = $1 AND s.status <> 'canceled'
     ORDER BY s.created_at DESC LIMIT 1`, [organizationId, EXTRA_COMPUTER_ADDON]);
  const row = rows[0];
  if (!row || row.org_status === "canceled") return NO_ENTITLEMENT;
  const included = Number(row.included_vps ?? 0);
  const extra = Number(row.quantity ?? 0);
  const keep = ["active", "past_due", "suspended"].includes(row.status) ? included + extra : 0;
  let buy = 0;
  const inTrial = row.trial_ends_at !== null && new Date(row.trial_ends_at) > now;
  if (row.status === "active" && row.org_status === "active" && !inTrial) {
    if (row.courtesy) buy = included;
    else if (row.last_paid_cents !== null) {
      const unit = Number(row.unit_price_cents ?? 0);
      const paidExtra = unit > 0 ? Math.floor(Math.max(0, Number(row.last_paid_cents) - Number(row.price_cents)) / unit) : 0;
      buy = included + Math.min(extra, paidExtra);
    }
  }
  return { subscriptionId: row.id, buy: Math.min(buy, keep), keep };
}
