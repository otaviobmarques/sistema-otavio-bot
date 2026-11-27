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

export const STORAGE_MAIL_JOB = "instance.storage_mail";
export const SYNC_INSTANCE_STORAGE_JOB = "instance.sync_storage";

/** One e-mail per threshold crossed (80 or 100); the dedupe key keeps a second measurement from queueing it twice. */
export async function queueStorageMail(q: Queryable, instanceId: string, level: 80 | 100, runAt?: Date): Promise<void> {
  await enqueue(q, STORAGE_MAIL_JOB, { instanceId, level }, { dedupeKey: `${STORAGE_MAIL_JOB}:${instanceId}:${level}`, maxAttempts: 5, runAt });
}

export async function queueStorageSync(q: Queryable, instanceId: string, runAt?: Date): Promise<void> {
  await enqueue(q, SYNC_INSTANCE_STORAGE_JOB, { instanceId }, { dedupeKey: `${SYNC_INSTANCE_STORAGE_JOB}:${instanceId}`, maxAttempts: 6, runAt });
}
