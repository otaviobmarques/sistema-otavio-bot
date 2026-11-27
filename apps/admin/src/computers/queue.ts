// Job names for the customers' own computers, apart so billing code can queue them without importing the service.
import type { Queryable } from "../db/db.ts";
import { enqueue } from "../jobs/queue.ts";

export const SYNC_COMPUTERS_JOB = "computer.sync";
export const ADVANCE_COMPUTER_JOB = "computer.advance";

/**
 * Re-reads what the organisation is entitled to and makes or releases machine rows. Safe to call on every billing change:
 * an organisation with no computer in its plan, no add-on and no machine queues nothing.
 */
export async function queueComputerSync(q: Queryable, organizationId: string, runAt?: Date): Promise<void> {
  const { rows } = await q.query(
    `SELECT 1 WHERE EXISTS (SELECT 1 FROM vps_machines WHERE organization_id = $1)
       OR EXISTS (SELECT 1 FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.organization_id = $1
                  AND (p.included_vps > 0 OR EXISTS (SELECT 1 FROM subscription_addons sa WHERE sa.subscription_id = s.id)))`, [organizationId]);
  if (!rows.length) return;
  await enqueue(q, SYNC_COMPUTERS_JOB, { organizationId }, { dedupeKey: `${SYNC_COMPUTERS_JOB}:${organizationId}`, runAt, maxAttempts: 5 });
}

/** One step of a machine's purchase or installation (the cron takes the following steps). */
export async function queueComputerAdvance(q: Queryable, machineId: string, runAt?: Date): Promise<void> {
  await enqueue(q, ADVANCE_COMPUTER_JOB, { machineId }, { dedupeKey: `${ADVANCE_COMPUTER_JOB}:${machineId}`, runAt, maxAttempts: 1 });
}
