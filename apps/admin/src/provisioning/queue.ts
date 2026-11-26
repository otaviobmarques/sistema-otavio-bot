// Job names for provisioning, kept apart so billing and lifecycle code can queue work without importing the service.
import type { Queryable } from "../db/db.ts";
import { enqueue } from "../jobs/queue.ts";

export const PROVISION_INSTANCE_JOB = "instance.provision";
export const SYNC_INSTANCE_PLAN_JOB = "instance.sync_plan";

/** Asks for this organisation's instance. Safe to call on every activation: the job does nothing when one exists. */
export async function queueProvisioning(q: Queryable, organizationId: string, runAt?: Date): Promise<void> {
  await enqueue(q, PROVISION_INSTANCE_JOB, { organizationId }, { dedupeKey: `${PROVISION_INSTANCE_JOB}:${organizationId}`, runAt });
}

export async function queuePlanSync(q: Queryable, instanceId: string, runAt?: Date): Promise<void> {
  await enqueue(q, SYNC_INSTANCE_PLAN_JOB, { instanceId }, { dedupeKey: `${SYNC_INSTANCE_PLAN_JOB}:${instanceId}`, maxAttempts: 6, runAt });
}
