// Customer backups and server moves. Each instance's data volume is copied once a day to an S3-compatible store
// (config.backups); the node agent does the work (src/node-agent/tasks.ts): it freezes the container a few seconds,
// packs the volume, and its helper sends the archive straight to the store in parts whose URLs this module signs. The
// same backups move an instance between servers: a "move" backup on the old node, then a restore on the new one before
// its container exists there. Nothing here holds or logs the store's keys; a node only ever gets short-lived signed URLs.
import { audit, SYSTEM, type Actor } from "../audit.ts";
import type { AppContext } from "../context.ts";
import type { Queryable } from "../db/db.ts";
import { DomainError } from "../domain/lifecycle.ts";
import type { DesiredTask } from "../provisioning/protocol.ts";
import { s3Client, type S3Client } from "./s3.ts";

/** A daily backup is due once the last one is this old. */
export const DAILY_EVERY_MS = 22 * 3600_000;
/** A backup or restore still open after this long failed (the agent or its helper died). */
export const TASK_TIMEOUT_MS = 6 * 3600_000;
/** Manual backups and the copies of a move are kept this long; daily ones by count (config.backups.keepDaily). */
export const KEEP_MANUAL_MS = 30 * 24 * 3600_000;
export const KEEP_MOVE_MS = 7 * 24 * 3600_000;

export interface BackupRow {
  id: string;
  instance_id: string;
  node_id: string;
  kind: "scheduled" | "manual" | "move";
  status: "pending" | "uploading" | "done" | "failed" | "deleted";
  object_key: string;
  upload_id: string | null;
  bytes: string | number | null;
  sha256: string | null;
  error: string | null;
  created_at: Date;
  finished_at: Date | null;
}

export function backupStore(ctx: Pick<AppContext, "config" | "fetch" | "now">): S3Client | null {
  const settings = ctx.config.backups;
  return settings ? s3Client(settings, ctx.fetch, ctx.now) : null;
}

const requireStore = (ctx: AppContext) => {
  const store = backupStore(ctx);
  if (!store) throw new DomainError("Backups não configurados: defina BACKUP_S3_* no Admin", 409);
  return store;
};

function objectKey(ctx: AppContext, slug: string, id: string): string {
  const day = ctx.now().toISOString().slice(0, 10);
  return `${ctx.config.backups?.prefix ?? ""}${slug}/${day}-${id}.tgz`;
}

async function insertBackup(q: Queryable, ctx: AppContext, instance: { id: string; slug: string; node_id: string }, kind: BackupRow["kind"], by: string): Promise<BackupRow> {
  const id = crypto.randomUUID();
  const { rows } = await q.query<BackupRow>(
    `INSERT INTO instance_backups (id, instance_id, node_id, kind, object_key, requested_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [id, instance.id, instance.node_id, kind, objectKey(ctx, instance.slug, id), by.slice(0, 200), ctx.now()]);
  return rows[0]!;
}

const OPEN = "status IN ('pending', 'uploading')";

/** Operator: back this instance up now. */
export async function requestBackup(ctx: AppContext, actor: Actor, instanceId: string): Promise<BackupRow> {
  requireStore(ctx);
  return ctx.db.tx(async (q) => {
    const instance = (await q.query<{ id: string; slug: string; node_id: string | null; organization_id: string; decommissioned_at: Date | null }>(
      "SELECT id, slug, node_id, organization_id, decommissioned_at FROM instances WHERE id = $1 FOR UPDATE", [instanceId])).rows[0];
    if (!instance || instance.decommissioned_at) throw new DomainError("Instância não encontrada", 404);
    if (!instance.node_id) throw new DomainError("A instância ainda não tem servidor", 409);
    const open = await q.query(`SELECT 1 FROM instance_backups WHERE instance_id = $1 AND ${OPEN}`, [instanceId]);
    if (open.rows.length) throw new DomainError("Já existe um backup desta instância em andamento", 409);
    const row = await insertBackup(q, ctx, { ...instance, node_id: instance.node_id }, "manual", actor.label ?? actor.type);
    await audit(q, actor, { action: "instance.backup_requested", targetType: "instance", targetId: instanceId, organizationId: instance.organization_id,
      data: { backupId: row.id } });
    return row;
  });
}

/** Cron: a daily backup for each instance that has data and whose last one is older than DAILY_EVERY_MS. */
export async function scheduleDailyBackups(ctx: AppContext, limit = 20): Promise<number> {
  if (!ctx.config.backups) return 0;
  const now = ctx.now();
  const { rows } = await ctx.db.query<{ id: string; slug: string; node_id: string }>(
    `SELECT i.id, i.slug, i.node_id FROM instances i JOIN nodes n ON n.id = i.node_id
     WHERE i.decommissioned_at IS NULL AND i.ready_at IS NOT NULL AND i.relocating_to_node_id IS NULL
       AND n.status <> 'offline' AND n.last_seen_at > $1
       AND NOT EXISTS (SELECT 1 FROM instance_backups b WHERE b.instance_id = i.id AND (b.status IN ('pending', 'uploading')
         OR (b.status = 'done' AND b.created_at > $2) OR (b.kind = 'scheduled' AND b.status = 'failed' AND b.created_at > $3)))
     ORDER BY i.created_at LIMIT $4`,
    [new Date(now.getTime() - 10 * 60_000), new Date(now.getTime() - DAILY_EVERY_MS), new Date(now.getTime() - 3600_000), limit]);
  let created = 0;
  for (const row of rows) {
    try {
      await insertBackup(ctx.db, ctx, row, "scheduled", "diário");
      created++;
    } catch (error) {
      // A unique-index race with a manual one: that one stands.
      if (!/instance_backups_one_open|duplicate key/.test((error as Error).message)) throw error;
    }
  }
  return created;
}

/** The backups and restores a node's agent should run now (part of its desired state). */
export async function tasksFor(ctx: AppContext, nodeId: string): Promise<DesiredTask[]> {
  const store = backupStore(ctx);
  if (!store) return [];
  const backups = await ctx.db.query<{ id: string; instance_id: string; slug: string }>(
    `SELECT b.id, b.instance_id, i.slug FROM instance_backups b JOIN instances i ON i.id = b.instance_id
     WHERE b.node_id = $1 AND b.${OPEN} ORDER BY b.created_at LIMIT 50`, [nodeId]);
  const restores = await ctx.db.query<{ id: string; instance_id: string; slug: string; object_key: string }>(
    `SELECT r.id, r.instance_id, i.slug, b.object_key FROM instance_restores r JOIN instances i ON i.id = r.instance_id
     JOIN instance_backups b ON b.id = r.backup_id WHERE r.node_id = $1 AND r.status = 'pending' ORDER BY r.created_at LIMIT 20`, [nodeId]);
  return [
    ...backups.rows.map((row): DesiredTask => ({ id: row.id, kind: "backup", instanceId: row.instance_id, slug: row.slug })),
    ...restores.rows.map((row): DesiredTask => ({ id: row.id, kind: "restore", instanceId: row.instance_id, slug: row.slug, url: store.downloadUrl(row.object_key) })),
  ];
}

async function openBackup(q: Queryable, nodeId: string, id: string): Promise<BackupRow> {
  const row = (await q.query<BackupRow>(`SELECT * FROM instance_backups WHERE id = $1 AND node_id = $2 AND ${OPEN} FOR UPDATE`, [id, nodeId])).rows[0];
  if (!row) throw new DomainError("Backup não encontrado ou já encerrado", 404);
  return row;
}

/** The helper's next part: the multipart upload starts at the first one. */
export async function backupPartUrl(ctx: AppContext, nodeId: string, id: string, partNumber: number): Promise<string> {
  const store = requireStore(ctx);
  return ctx.db.tx(async (q) => {
    const row = await openBackup(q, nodeId, id);
    let uploadId = row.upload_id;
    if (!uploadId) {
      uploadId = await store.createMultipart(row.object_key);
      await q.query("UPDATE instance_backups SET upload_id = $2, status = 'uploading', started_at = $3 WHERE id = $1", [id, uploadId, ctx.now()]);
    }
    return store.partUrl(row.object_key, uploadId, partNumber);
  });
}

/** The helper sent every part: the store joins them; a move then restores on the new server. */
export async function completeBackup(ctx: AppContext, nodeId: string, id: string, input: { parts: { partNumber: number; etag: string }[]; bytes: number; sha256: string }): Promise<void> {
  const store = requireStore(ctx);
  const row = await ctx.db.tx((q) => openBackup(q, nodeId, id));
  if (!row.upload_id) throw new DomainError("Nenhuma parte foi enviada", 409);
  await store.completeMultipart(row.object_key, row.upload_id, input.parts);
  await ctx.db.tx(async (q) => {
    const done = await q.query<{ instance_id: string }>(
      `UPDATE instance_backups SET status = 'done', bytes = $2, sha256 = $3, finished_at = $4, error = NULL WHERE id = $1 AND ${OPEN} RETURNING instance_id`,
      [id, input.bytes, input.sha256, ctx.now()]);
    if (!done.rows[0]) return;
    const instance = (await q.query<{ organization_id: string; relocating_to_node_id: string | null }>(
      "SELECT organization_id, relocating_to_node_id FROM instances WHERE id = $1 FOR UPDATE", [row.instance_id])).rows[0];
    await audit(q, SYSTEM, { action: "instance.backup_done", targetType: "instance", targetId: row.instance_id, organizationId: instance?.organization_id,
      data: { backupId: id, kind: row.kind, bytes: input.bytes } });
    if (row.kind === "move" && instance?.relocating_to_node_id) {
      await q.query("INSERT INTO instance_restores (instance_id, node_id, backup_id, created_at) VALUES ($1, $2, $3, $4)",
        [row.instance_id, instance.relocating_to_node_id, id, ctx.now()]);
    }
  });
}

async function cancelRelocation(q: Queryable, instanceId: string, why: string): Promise<void> {
  const row = (await q.query<{ organization_id: string; relocating_to_node_id: string | null }>(
    "UPDATE instances SET relocating_to_node_id = NULL, relocation_started_at = NULL WHERE id = $1 AND relocating_to_node_id IS NOT NULL RETURNING organization_id, relocating_to_node_id",
    [instanceId])).rows[0];
  if (row) await audit(q, SYSTEM, { action: "instance.relocation_failed", targetType: "instance", targetId: instanceId, organizationId: row.organization_id, reason: why.slice(0, 500) });
}

/** A backup or restore that went wrong (the helper said so, or it timed out): the move, if any, is called off. */
export async function failTask(ctx: AppContext, nodeId: string | null, id: string, error: string): Promise<void> {
  const store = backupStore(ctx);
  const message = error.slice(0, 1000) || "erro";
  const backup = (await ctx.db.query<BackupRow>(
    `UPDATE instance_backups SET status = 'failed', error = $3, finished_at = $4 WHERE id = $1 AND ($2::uuid IS NULL OR node_id = $2) AND ${OPEN} RETURNING *`,
    [id, nodeId, message, ctx.now()])).rows[0];
  if (backup) {
    if (backup.upload_id && store) await store.abortMultipart(backup.object_key, backup.upload_id).catch(() => undefined);
    if (backup.kind === "move") await ctx.db.tx((q) => cancelRelocation(q, backup.instance_id, `backup: ${message}`));
    return;
  }
  const restore = (await ctx.db.query<{ instance_id: string }>(
    `UPDATE instance_restores SET status = 'failed', error = $3, finished_at = $4 WHERE id = $1 AND ($2::uuid IS NULL OR node_id = $2) AND status = 'pending' RETURNING instance_id`,
    [id, nodeId, message, ctx.now()])).rows[0];
  if (restore) await ctx.db.tx((q) => cancelRelocation(q, restore.instance_id, `restauração: ${message}`));
}

/** The new server unpacked the data: the instance now lives there (the old one removes its container, keeps its volume). */
export async function completeRestore(ctx: AppContext, nodeId: string, id: string): Promise<void> {
  await ctx.db.tx(async (q) => {
    const restore = (await q.query<{ instance_id: string }>(
      "UPDATE instance_restores SET status = 'done', finished_at = $3 WHERE id = $1 AND node_id = $2 AND status = 'pending' RETURNING instance_id",
      [id, nodeId, ctx.now()])).rows[0];
    if (!restore) throw new DomainError("Restauração não encontrada ou já encerrada", 404);
    const target = (await q.query<{ kind: string }>("SELECT kind FROM nodes WHERE id = $1", [nodeId])).rows[0];
    const moved = (await q.query<{ organization_id: string; previous_node_id: string | null }>(
      `UPDATE instances SET previous_node_id = node_id, node_id = $2, relocating_to_node_id = NULL, relocation_started_at = NULL, move_to_node_id = NULL,
         mode = CASE WHEN $3 = 'dedicated' THEN 'dedicated' ELSE mode END, generation = generation + 1, sleeping_since = NULL, wake_at = NULL,
         state = CASE WHEN state IN ('ready', 'failed') THEN 'setting_up' ELSE state END,
         state_reason = CASE WHEN state IN ('ready', 'failed') THEN 'mudou de servidor' ELSE state_reason END
       WHERE id = $1 AND relocating_to_node_id = $2 RETURNING organization_id, previous_node_id`,
      [restore.instance_id, nodeId, target?.kind ?? "shared_free"])).rows[0];
    if (moved) {
      await audit(q, SYSTEM, { action: "instance.moved", targetType: "instance", targetId: restore.instance_id, organizationId: moved.organization_id,
        data: { from: moved.previous_node_id, nodeId, copied: true, restoreId: id } });
    }
  });
}

/**
 * Operator (or the cron, for a customer's own VPS): move the instance to another server with its data. It stops, a
 * "move" backup runs on the old server, the new one restores it, then it starts there. Minutes, not hours.
 */
export async function startRelocation(ctx: AppContext, actor: Actor, instanceId: string, targetNodeId: string, q0?: Queryable): Promise<BackupRow> {
  requireStore(ctx);
  const run = async (q: Queryable) => {
    const instance = (await q.query<{ id: string; slug: string; node_id: string | null; organization_id: string; decommissioned_at: Date | null; relocating_to_node_id: string | null }>(
      "SELECT id, slug, node_id, organization_id, decommissioned_at, relocating_to_node_id FROM instances WHERE id = $1 FOR UPDATE", [instanceId])).rows[0];
    if (!instance || instance.decommissioned_at) throw new DomainError("Instância não encontrada", 404);
    if (!instance.node_id) throw new DomainError("A instância ainda não tem servidor", 409);
    if (instance.relocating_to_node_id) throw new DomainError("Esta instância já está mudando de servidor", 409);
    if (instance.node_id === targetNodeId) throw new DomainError("A instância já está nesse servidor", 409);
    const target = (await q.query<{ status: string; agent_token_hash: string | null }>("SELECT status, agent_token_hash FROM nodes WHERE id = $1", [targetNodeId])).rows[0];
    if (!target || target.status === "offline" || !target.agent_token_hash) throw new DomainError("Servidor de destino indisponível", 409);
    const open = await q.query(`SELECT 1 FROM instance_backups WHERE instance_id = $1 AND ${OPEN}`, [instanceId]);
    if (open.rows.length) throw new DomainError("Espere o backup em andamento terminar", 409);
    await q.query("UPDATE instances SET relocating_to_node_id = $2, relocation_started_at = $3 WHERE id = $1", [instanceId, targetNodeId, ctx.now()]);
    const backup = await insertBackup(q, ctx, { ...instance, node_id: instance.node_id }, "move", actor.label ?? actor.type);
    await audit(q, actor, { action: "instance.relocation_started", targetType: "instance", targetId: instanceId, organizationId: instance.organization_id,
      data: { from: instance.node_id, to: targetNodeId, backupId: backup.id } });
    return backup;
  };
  return q0 ? run(q0) : ctx.db.tx(run);
}

export interface BackupSweep {
  scheduled: number;
  timedOut: number;
  deleted: number;
  relocations: number;
}

/**
 * Cron: daily backups, open tasks that timed out, retention, and the moves to a customer's own VPS that waited for a
 * copy (computers/placement.ts move_to_node_id): with backups configured they now happen by themselves.
 */
export async function sweepBackups(ctx: AppContext): Promise<BackupSweep> {
  const summary: BackupSweep = { scheduled: 0, timedOut: 0, deleted: 0, relocations: 0 };
  const store = backupStore(ctx);
  if (!store) return summary;
  const now = ctx.now();
  const stale = new Date(now.getTime() - TASK_TIMEOUT_MS);
  const late = await ctx.db.query<{ id: string }>(
    `SELECT id FROM instance_backups WHERE ${OPEN} AND created_at < $1 UNION ALL SELECT id FROM instance_restores WHERE status = 'pending' AND created_at < $1`, [stale]);
  for (const row of late.rows) {
    await failTask(ctx, null, row.id, "o servidor não concluiu a tempo");
    summary.timedOut++;
  }
  summary.scheduled = await scheduleDailyBackups(ctx);
  const keep = ctx.config.backups?.keepDaily ?? 7;
  // A backup a pending restore still needs is never deleted.
  const old = await ctx.db.query<{ id: string; object_key: string }>(
    `SELECT b.id, b.object_key FROM (
       SELECT *, row_number() OVER (PARTITION BY instance_id, kind ORDER BY created_at DESC) AS rank FROM instance_backups WHERE status = 'done'
     ) b WHERE ((b.kind = 'scheduled' AND b.rank > $1) OR (b.kind = 'manual' AND b.created_at < $2) OR (b.kind = 'move' AND b.created_at < $3))
       AND NOT EXISTS (SELECT 1 FROM instance_restores r WHERE r.backup_id = b.id AND r.status = 'pending')
     LIMIT 100`,
    [keep, new Date(now.getTime() - KEEP_MANUAL_MS), new Date(now.getTime() - KEEP_MOVE_MS)]);
  for (const row of old.rows) {
    try {
      await store.deleteObject(row.object_key);
      await ctx.db.query("UPDATE instance_backups SET status = 'deleted', deleted_at = $2 WHERE id = $1", [row.id, now]);
      summary.deleted++;
    } catch (error) {
      console.error(`[backups] apagar ${row.id}: ${(error as Error).message}`);
    }
  }
  const waiting = await ctx.db.query<{ id: string; move_to_node_id: string }>(
    `SELECT id, move_to_node_id FROM instances WHERE move_to_node_id IS NOT NULL AND relocating_to_node_id IS NULL AND decommissioned_at IS NULL LIMIT 10`);
  for (const row of waiting.rows) {
    try {
      await startRelocation(ctx, SYSTEM, row.id, row.move_to_node_id);
      summary.relocations++;
    } catch (error) {
      console.error(`[backups] mudança ${row.id}: ${(error as Error).message}`);
    }
  }
  return summary;
}

/** The latest backups of an instance, for the panel. */
export async function listBackups(ctx: AppContext, instanceId: string, limit = 20) {
  const { rows } = await ctx.db.query<BackupRow>(
    "SELECT * FROM instance_backups WHERE instance_id = $1 ORDER BY created_at DESC LIMIT $2", [instanceId, limit]);
  return rows.map((row) => ({
    id: row.id, kind: row.kind, status: row.status, bytes: row.bytes === null ? null : Number(row.bytes), error: row.error,
    createdAt: row.created_at, finishedAt: row.finished_at,
  }));
}

/** Operator: a link to download one backup (valid for an hour). */
export async function backupDownloadUrl(ctx: AppContext, instanceId: string, backupId: string): Promise<string> {
  const store = requireStore(ctx);
  const row = (await ctx.db.query<BackupRow>("SELECT * FROM instance_backups WHERE id = $1 AND instance_id = $2 AND status = 'done'", [backupId, instanceId])).rows[0];
  if (!row) throw new DomainError("Backup não encontrado", 404);
  return store.downloadUrl(row.object_key, 3600);
}
