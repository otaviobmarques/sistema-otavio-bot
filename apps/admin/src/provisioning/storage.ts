// Per-customer disk quota, soft and measured: Docker's local volumes have no hard quota and the node's disk is shared, so
// the node agent measures each instance's data volume (src/node-agent/disk.ts) and the Admin compares it with the plan's
// disk_gb. The customer gets one e-mail when crossing 80% and one at 100%; the instance learns the state through a signed
// POST /api/cloud/storage and refuses new uploads at 110% (server/host/cloud-storage-quota.ts). Nothing is ever deleted.
import type { AppContext } from "../context.ts";
import type { Queryable } from "../db/db.ts";
import { storageEmail } from "../mail/storage-mail.ts";
import { signedCloudRequest } from "./cloud-request.ts";
import { bootstrapContext, type InstanceRow } from "./instances.ts";
import { queueStorageMail, queueStorageSync } from "./queue.ts";

export type DiskState = "ok" | "warning" | "full" | "over";
export const DISK_STATES: readonly DiskState[] = ["ok", "warning", "full", "over"];

/** plans.disk_gb counts binary gigabytes, as the customer card shows them. */
export const GB = 1024 ** 3;
export const WARNING_RATIO = 0.8;
export const FULL_RATIO = 1;
export const OVER_RATIO = 1.1;
/** Below this the e-mails can be sent again: a customer hovering at 80% gets one, not one per measurement. */
const RESET_RATIO = 0.7;

/** The state for `usedBytes` of `quotaBytes`; null when the plan sets no limit. */
export function diskStateOf(usedBytes: number, quotaBytes: number | null): DiskState | null {
  if (!quotaBytes || quotaBytes <= 0) return null;
  const ratio = usedBytes / quotaBytes;
  if (ratio >= OVER_RATIO) return "over";
  if (ratio >= FULL_RATIO) return "full";
  if (ratio >= WARNING_RATIO) return "warning";
  return "ok";
}

/** Which warning (80 or 100) this measurement calls for, and the notified mark to keep. */
export function nextNotice(state: DiskState | null, ratio: number, notified: number): { send: 80 | 100 | null; notified: number } {
  const due = state === "full" || state === "over" ? 100 : state === "warning" ? 80 : 0;
  if (due > notified) return { send: due as 80 | 100, notified: due };
  if (state === null || ratio < RESET_RATIO) return { send: null, notified: 0 };
  if (notified === 100 && ratio < 0.9) return { send: null, notified: 80 };
  return { send: null, notified };
}

type DiskRow = Pick<InstanceRow, "id" | "organization_id"> & { disk_notified_percent: number; disk_state_synced: string | null; disk_gb: number | null };

/**
 * Records one measurement, inside the status report's transaction: the state against the plan's disk_gb, one e-mail per
 * threshold crossed upwards, and a sync to the instance whenever the state it knows is not this one.
 */
export async function recordDiskUsage(q: Queryable, instanceId: string, disk: { bytes: number; measuredAt: string }, now: Date): Promise<void> {
  const row = (await q.query<DiskRow>(
    `SELECT i.id, i.organization_id, i.disk_notified_percent, i.disk_state_synced, p.disk_gb FROM instances i
     LEFT JOIN LATERAL (SELECT s.plan_id FROM subscriptions s WHERE s.organization_id = i.organization_id
                        ORDER BY (s.status <> 'canceled') DESC, s.created_at DESC LIMIT 1) s ON true
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE i.id = $1`, [instanceId])).rows[0];
  if (!row) return;
  const quota = row.disk_gb && row.disk_gb > 0 ? row.disk_gb * GB : null;
  const state = diskStateOf(disk.bytes, quota);
  const ratio = quota ? disk.bytes / quota : 0;
  const notice = nextNotice(state, ratio, Number(row.disk_notified_percent));
  const measured = new Date(disk.measuredAt);
  const measuredAt = Number.isNaN(measured.getTime()) || measured > now ? now : measured;
  await q.query(
    `UPDATE instances SET disk_used_bytes = $2, disk_measured_at = $3, disk_quota_bytes = $4, disk_state = $5, disk_notified_percent = $6 WHERE id = $1`,
    [row.id, disk.bytes, measuredAt, quota, state, notice.notified]);
  if (notice.send) await queueStorageMail(q, row.id, notice.send, now);
  if ((state ?? "ok") !== (row.disk_state_synced ?? "ok")) await queueStorageSync(q, row.id, now);
}

/** The customer's e-mail for this organisation: its owner's, else the billing e-mail. */
async function recipientOf(q: Queryable, organizationId: string): Promise<string | null> {
  const { rows } = await q.query<{ email: string | null }>(
    `SELECT COALESCE((SELECT a.email FROM memberships m JOIN accounts a ON a.id = m.account_id WHERE m.organization_id = o.id AND m.role = 'owner'),
                     o.billing_email) AS email FROM organizations o WHERE o.id = $1`, [organizationId]);
  return rows[0]?.email ?? null;
}

/** The job behind one threshold's e-mail. The mark was set when it was queued, so a retry never sends a second kind. */
export async function sendStorageMail(ctx: AppContext, instanceId: string, level: 80 | 100): Promise<boolean> {
  const row = (await ctx.db.query<InstanceRow>(
    "SELECT * FROM instances WHERE id = $1", [instanceId])).rows[0];
  if (!row || row.decommissioned_at || row.disk_used_bytes === null || row.disk_quota_bytes === null) return false;
  const to = await recipientOf(ctx.db, row.organization_id);
  if (!to) return false;
  await ctx.mailer.send({
    ...storageEmail(to, { level, usedBytes: Number(row.disk_used_bytes), quotaBytes: Number(row.disk_quota_bytes), accountUrl: ctx.config.customerPublicUrl }),
    from: ctx.config.customerMailFrom,
  });
  return true;
}

/** The signed request that tells the instance its storage state. `/api/cloud/storage`. */
export const CLOUD_STORAGE_PATH = "/api/cloud/storage";

/**
 * Tells the instance its storage state, which it enforces at `over`. Returns whether it is in step. An instance whose
 * image predates the route answers 404: left for the next measurement, without retries. Throws on any other refusal.
 */
export async function syncInstanceStorage(ctx: AppContext, instanceId: string): Promise<boolean> {
  const row = (await ctx.db.query<InstanceRow>(
    "SELECT * FROM instances WHERE id = $1", [instanceId])).rows[0];
  if (!row || row.decommissioned_at || !row.public_url || !row.bootstrap_secret_enc) return false;
  if (row.state !== "ready" && row.state !== "payment_problem") return false;
  const state = row.disk_state ?? "ok";
  if (state === (row.disk_state_synced ?? "ok")) return true;
  const secret = ctx.box.decrypt(row.bootstrap_secret_enc, bootstrapContext(row.id));
  const answer = await signedCloudRequest(ctx, { publicUrl: row.public_url, secret }, "POST", CLOUD_STORAGE_PATH, {
    v: 1, state, usedBytes: Number(row.disk_used_bytes ?? 0), quotaBytes: row.disk_quota_bytes === null ? null : Number(row.disk_quota_bytes),
  });
  if (answer.status === 404) return false;
  if (answer.status !== 200) throw new Error(`a instância ${row.slug} recusou o estado do espaço (HTTP ${answer.status})`);
  await ctx.db.query("UPDATE instances SET disk_state_synced = $2 WHERE id = $1", [row.id, state]);
  return true;
}
