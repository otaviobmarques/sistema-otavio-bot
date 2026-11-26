import type { Queryable } from "../db/db.ts";
import type { OrganizationRow } from "../domain/lifecycle.ts";

const DAY_MS = 24 * 60 * 60_000;

/**
 * One free trial per organisation and per CPF/CNPJ, and none for whoever already paid a
 * subscription. `subscription_trials` (document is its primary key) also enforces it in the database.
 */
export async function trialAvailable(q: Queryable, org: Pick<OrganizationRow, "id" | "document">): Promise<boolean> {
  const { rows } = await q.query<{ used: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM subscription_trials WHERE organization_id = $1 OR document = $2)
       OR EXISTS (SELECT 1 FROM subscriptions WHERE organization_id = $1 AND trial_ends_at IS NOT NULL)
       OR EXISTS (SELECT 1 FROM payments WHERE organization_id = $1 AND kind = 'subscription'
                  AND status IN ('confirmed', 'received', 'refunded', 'chargeback')) AS used`,
    [org.id, org.document]);
  return !rows[0]?.used;
}

export function trialEnd(start: Date, days: number): Date {
  return new Date(start.getTime() + days * DAY_MS);
}

/** The plan's monthly quota for the trial's share of a 30-day month, rounded up. */
export function trialCredits(creditsPerMonth: number, days: number): number {
  return Math.ceil((creditsPerMonth * days) / 30);
}
