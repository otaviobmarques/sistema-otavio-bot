// Customer instances: one ArkoBot Cloud home per organisation with a live subscription, on a node with room. The
// billing lifecycle (domain/lifecycle.ts) moves `state`; this module turns rows into the desired state each node's
// agent pulls, and the agent's reports back into rows. Nothing here talks to Docker.
import { createHash, randomUUID } from "node:crypto";
import { audit, SYSTEM, type Actor } from "../audit.ts";
import type { AppContext } from "../context.ts";
import type { Queryable } from "../db/db.ts";
import { DomainError } from "../domain/lifecycle.ts";
import { insertGatewayToken } from "../gateway/tokens.ts";
import { randomToken } from "../security/crypto.ts";
import { CLOUD_TIER, signedCloudRequest } from "./cloud-request.ts";
import type { NodeRow } from "./nodes.ts";
import { AGENT_POLL_SECONDS, baseSlug, planResources, provisioningSettings, slugCandidate } from "./settings.ts";
import type { DesiredInstance, DesiredState, StatusReport } from "./protocol.ts";
import { queuePlanSync, queueStorageSync } from "./queue.ts";
import { recordDiskUsage } from "./storage.ts";

export interface InstanceRow {
  id: string;
  organization_id: string;
  subscription_id: string | null;
  node_id: string | null;
  slug: string;
  machine_id: string;
  role: "home" | "team";
  mode: "dedicated" | "shared_limited" | "desktop";
  bootstrap_secret_enc: string | null;
  state: "setting_up" | "ready" | "stopped" | "payment_problem" | "failed";
  state_reason: string | null;
  public_url: string | null;
  gateway_token_id: string | null;
  gateway_token_enc: string | null;
  generation: number;
  operator_stopped: boolean;
  decommissioned_at: Date | null;
  observed_state: "running" | "starting" | "stopped" | "absent" | "error" | null;
  observed_health: string | null;
  observed_error: string | null;
  observed_at: Date | null;
  container_id: string | null;
  ready_at: Date | null;
  plan_tier_synced: string | null;
  /** The data volume as last measured (storage.ts); bigint columns, so a string from some drivers. */
  disk_used_bytes: number | string | null;
  disk_quota_bytes: number | string | null;
  disk_state: "ok" | "warning" | "full" | "over" | null;
  disk_measured_at: Date | null;
  disk_notified_percent: number;
  disk_state_synced: string | null;
  created_at: Date;
}

export const bootstrapContext = (instanceId: string) => `instances.bootstrap_secret:${instanceId}`;
export const gatewayTokenContext = (instanceId: string) => `instances.gateway_token:${instanceId}`;

/** A subscription that entitles its organisation to a running instance. past_due still runs (the grace before suspension). */
const LIVE_SUBSCRIPTION = "s.status IN ('active', 'past_due')";

async function freeSlug(q: Queryable, base: string): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = slugCandidate(base, attempt);
    const taken = await q.query("SELECT 1 FROM instances WHERE slug = $1", [candidate]);
    if (!taken.rows.length) return candidate;
  }
  return `${base.slice(0, 40)}-${randomUUID().slice(0, 8)}`;
}

/** The active node with the fewest live instances that still has room, locked so two provisionings never overfill it. */
export async function pickNode(q: Queryable): Promise<string | null> {
  const load = "(SELECT count(*) FROM instances i WHERE i.node_id = n.id AND i.decommissioned_at IS NULL)";
  const { rows } = await q.query<{ id: string }>(
    `SELECT n.id FROM nodes n
     WHERE n.status = 'active' AND n.agent_token_hash IS NOT NULL AND (n.capacity_instances IS NULL OR ${load} < n.capacity_instances)
     ORDER BY ${load}, n.created_at LIMIT 1 FOR UPDATE OF n`);
  return rows[0]?.id ?? null;
}

export interface ProvisionResult {
  instance: InstanceRow;
  created: boolean;
}

/**
 * Makes the organisation's instance if it is entitled to one and has none: a row with its own slug, machine id,
 * bootstrap secret (sealed) and AI gateway token (sealed), on the least loaded node with room, or on none yet.
 * Idempotent: an existing live instance is returned as is. Null when the organisation has no live subscription.
 */
export async function provisionForOrganization(ctx: AppContext, actor: Actor, organizationId: string): Promise<ProvisionResult | null> {
  const settings = provisioningSettings(ctx.config);
  return ctx.db.tx(async (q) => {
    const org = (await q.query<{ id: string; slug: string; status: string }>("SELECT id, slug, status FROM organizations WHERE id = $1 FOR UPDATE", [organizationId])).rows[0];
    if (!org) return null;
    const existing = (await q.query<InstanceRow>("SELECT * FROM instances WHERE organization_id = $1 AND decommissioned_at IS NULL", [org.id])).rows[0];
    if (existing) return { instance: existing, created: false };
    if (org.status !== "active") return null;
    const sub = (await q.query<{ id: string; plan_code: string; cloud_mode: string }>(
      `SELECT s.id, p.code AS plan_code, p.cloud_mode FROM subscriptions s JOIN plans p ON p.id = s.plan_id
       WHERE s.organization_id = $1 AND ${LIVE_SUBSCRIPTION} ORDER BY s.created_at DESC LIMIT 1`, [org.id])).rows[0];
    if (!sub) return null;

    const id = randomUUID();
    const slug = await freeSlug(q, baseSlug(org.slug));
    const nodeId = await pickNode(q);
    const secret = randomToken(32);
    const mode = sub.cloud_mode === "dedicated" ? "dedicated" : "shared_limited";
    await q.query(
      `INSERT INTO instances (id, organization_id, subscription_id, node_id, slug, machine_id, role, mode, bootstrap_secret_enc, state, state_reason, public_url)
       VALUES ($1, $2, $3, $4, $5, $6, 'home', $7, $8, 'setting_up', $9, $10)`,
      [id, org.id, sub.id, nodeId, slug, id, mode, ctx.box.encrypt(secret, bootstrapContext(id)),
        nodeId ? "criando o contêiner" : "aguardando um servidor com vaga", `https://${slug}.${settings.baseDomain}`]);
    const token = await insertGatewayToken(q, actor, { organizationId: org.id, instanceId: id, label: `Instância ${slug}` });
    const { rows } = await q.query<InstanceRow>(
      "UPDATE instances SET gateway_token_id = $2, gateway_token_enc = $3 WHERE id = $1 RETURNING *",
      [id, token.id, ctx.box.encrypt(token.token, gatewayTokenContext(id))]);
    await audit(q, actor, { action: "instance.provisioned", targetType: "instance", targetId: id, organizationId: org.id,
      data: { slug, nodeId, plan: sub.plan_code, mode, subscriptionId: sub.id } });
    return { instance: rows[0]!, created: true };
  });
}

/** Puts instances that waited for room on a node that has it now. */
export async function assignPendingInstances(ctx: AppContext, limit = 20): Promise<number> {
  let assigned = 0;
  const { rows } = await ctx.db.query<{ id: string }>(
    "SELECT id FROM instances WHERE node_id IS NULL AND decommissioned_at IS NULL ORDER BY created_at LIMIT $1", [limit]);
  for (const row of rows) {
    const done = await ctx.db.tx(async (q) => {
      const nodeId = await pickNode(q);
      if (!nodeId) return false;
      const updated = await q.query<{ organization_id: string }>(
        `UPDATE instances SET node_id = $2, state_reason = CASE WHEN state = 'setting_up' THEN 'criando o contêiner' ELSE state_reason END
         WHERE id = $1 AND node_id IS NULL RETURNING organization_id`, [row.id, nodeId]);
      if (!updated.rows[0]) return false;
      await audit(q, SYSTEM, { action: "instance.assigned", targetType: "instance", targetId: row.id, organizationId: updated.rows[0].organization_id, data: { nodeId } });
      return true;
    });
    if (!done) break;
    assigned++;
  }
  return assigned;
}

export interface ProvisioningSweep {
  created: number;
  assigned: number;
  failed: number;
}

/**
 * The safety net behind the provisioning jobs: every organisation with a live subscription and no instance gets one,
 * and instances that waited for room get a node. Run by the cron tick and by each agent poll.
 */
export async function sweepProvisioning(ctx: AppContext, limit = 10): Promise<ProvisioningSweep> {
  const summary: ProvisioningSweep = { created: 0, assigned: 0, failed: 0 };
  const { rows } = await ctx.db.query<{ id: string }>(
    `SELECT o.id FROM organizations o JOIN subscriptions s ON s.organization_id = o.id AND ${LIVE_SUBSCRIPTION}
     WHERE o.status = 'active' AND NOT EXISTS (SELECT 1 FROM instances i WHERE i.organization_id = o.id AND i.decommissioned_at IS NULL)
     ORDER BY s.created_at LIMIT $1`, [limit]);
  for (const row of rows) {
    try {
      if ((await provisionForOrganization(ctx, SYSTEM, row.id))?.created) summary.created++;
    } catch (error) {
      summary.failed++;
      console.error(`[provisionamento] cliente ${row.id}: ${(error as Error).message}`);
    }
  }
  summary.assigned = await assignPendingInstances(ctx);
  return summary;
}

/**
 * What the node should be doing with this instance.
 * TODO(inicial-sleep): the Inicial plan sleeps after plans.idle_sleep_minutes (30) idle. The instance already answers the
 * signed power read and sleep handshake (GET /api/cloud/power, POST /api/cloud/power/sleep, docs/cloud-pro.md), but on
 * Docker nothing wakes a stopped container on the next request (Fly does that natively). Needs a waking proxy (e.g.
 * Sablier on Traefik) or a start on "Abrir meu ArkoBot" plus routine wake-ups at nextDueAt; until then it stays running.
 */
export function desiredOf(row: Pick<InstanceRow, "decommissioned_at" | "operator_stopped" | "state">): DesiredInstance["desired"] {
  if (row.decommissioned_at) return "absent";
  if (row.operator_stopped || row.state === "stopped" || row.state === "failed") return "stopped";
  return "running";
}

type DesiredRow = InstanceRow & { plan_code: string | null; ram_mb: number | null };

function desiredInstance(ctx: AppContext, row: DesiredRow): DesiredInstance {
  const settings = provisioningSettings(ctx.config);
  const publicUrl = row.public_url ?? `https://${row.slug}.${settings.baseDomain}`;
  const host = new URL(publicUrl).hostname;
  const env: Record<string, string> = {
    OMB_CLOUD_ROLE: row.role,
    OMB_CLOUD_MACHINE_ID: row.machine_id,
    OMB_CLOUD_ADMIN_URL: settings.adminOrigin,
    OMB_PUBLIC_URL: new URL(publicUrl).origin,
    OMB_CLOUD_IMAGE: settings.image,
    // While the server (re)starts, the edge holds a request instead of answering 502 (deploy/fly/Caddyfile).
    OMB_CLOUD_EDGE_HOLD: "30s",
    TZ: "America/Sao_Paulo",
  };
  if (row.bootstrap_secret_enc) env.OMB_CLOUD_BOOTSTRAP_SECRET = ctx.box.decrypt(row.bootstrap_secret_enc, bootstrapContext(row.id));
  if (row.gateway_token_enc) {
    env.OMB_CLOUD_AI_GATEWAY_URL = settings.gatewayUrl;
    env.OMB_CLOUD_AI_GATEWAY_TOKEN = ctx.box.decrypt(row.gateway_token_enc, gatewayTokenContext(row.id));
  }
  const resources = planResources(row.ram_mb);
  const revision = createHash("sha256")
    .update(JSON.stringify({ image: settings.image, host, resources, generation: row.generation, env: Object.entries(env).sort(([a], [b]) => a.localeCompare(b)) }))
    .digest("hex").slice(0, 32);
  return { id: row.id, slug: row.slug, desired: desiredOf(row), host, image: settings.image, revision, env, resources };
}

/** The node's desired state. A removed instance stays listed (as absent) until its agent reports the container gone. */
export async function desiredStateFor(ctx: AppContext, node: Pick<NodeRow, "id" | "name">): Promise<DesiredState> {
  const { rows } = await ctx.db.query<DesiredRow>(
    `SELECT i.*, p.code AS plan_code, p.ram_mb FROM instances i
     LEFT JOIN LATERAL (SELECT s.plan_id FROM subscriptions s WHERE s.organization_id = i.organization_id
                        ORDER BY (s.status <> 'canceled') DESC, s.created_at DESC LIMIT 1) s ON true
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE i.node_id = $1 AND (i.decommissioned_at IS NULL OR i.observed_state IS DISTINCT FROM 'absent')
     ORDER BY i.created_at`, [node.id]);
  const instances: DesiredInstance[] = [];
  for (const row of rows) {
    try {
      instances.push(desiredInstance(ctx, row));
    } catch (error) {
      // A secret that no longer opens (a lost ADMIN_ENCRYPTION_KEY) leaves this one out: the agent then leaves it as it is.
      console.error(`[provisionamento] instância ${row.slug}: ${(error as Error).message}`);
    }
  }
  return { node: { id: node.id, name: node.name }, pollSeconds: AGENT_POLL_SECONDS, instances };
}

/** Records what the agent saw; an instance being set up becomes ready once its container runs and answers its health check. */
export async function applyStatusReport(ctx: AppContext, node: Pick<NodeRow, "id">, report: StatusReport): Promise<{ ready: string[] }> {
  const now = ctx.now();
  const ready: string[] = [];
  await ctx.db.tx(async (q) => {
    await q.query("UPDATE nodes SET last_seen_at = $2, agent_version = $3, last_error = $4, orphan_containers = $5 WHERE id = $1",
      [node.id, now, report.agentVersion, report.error, report.orphans.length]);
    for (const seen of report.instances) {
      const row = (await q.query<Pick<InstanceRow, "id" | "state" | "organization_id" | "slug" | "decommissioned_at">>(
        "SELECT id, state, organization_id, slug, decommissioned_at FROM instances WHERE id = $1 AND node_id = $2 FOR UPDATE", [seen.id, node.id])).rows[0];
      if (!row) continue;
      await q.query(
        `UPDATE instances SET observed_state = $2, observed_health = $3, observed_error = $4, observed_revision = $5, observed_at = $6,
           container_id = COALESCE($7, CASE WHEN $2 = 'absent' THEN NULL ELSE container_id END) WHERE id = $1`,
        [row.id, seen.state, seen.health, seen.error, seen.revision, now, seen.containerId]);
      if (seen.disk && !row.decommissioned_at) await recordDiskUsage(q, row.id, seen.disk, now);
      const healthy = seen.state === "running" && (seen.health === "healthy" || seen.health === "none" || seen.health === null);
      if (!row.decommissioned_at && row.state === "setting_up" && healthy) {
        await q.query("UPDATE instances SET state = 'ready', state_reason = NULL, ready_at = $2 WHERE id = $1", [row.id, now]);
        await audit(q, SYSTEM, { action: "instance.ready", targetType: "instance", targetId: row.id, organizationId: row.organization_id, data: { slug: row.slug } });
        await queuePlanSync(q, row.id, now);
        await queueStorageSync(q, row.id, now);
        ready.push(row.id);
      }
    }
  });
  return { ready };
}

async function lockInstance(q: Queryable, id: string): Promise<InstanceRow> {
  const row = (await q.query<InstanceRow>("SELECT * FROM instances WHERE id = $1 FOR UPDATE", [id])).rows[0];
  if (!row) throw new DomainError("Instância não encontrada", 404);
  if (row.decommissioned_at) throw new DomainError("Esta instância foi desativada");
  return row;
}

/** Operator: stop it and keep it stopped, whatever billing says, until started again. */
export async function stopInstance(ctx: AppContext, actor: Actor, id: string, reason: string): Promise<void> {
  await ctx.db.tx(async (q) => {
    const row = await lockInstance(q, id);
    await q.query("UPDATE instances SET operator_stopped = true WHERE id = $1", [id]);
    await audit(q, actor, { action: "instance.stopped", targetType: "instance", targetId: id, organizationId: row.organization_id, reason });
  });
}

/** Operator: undo a stop. A stop for billing stays until billing lifts it. */
export async function startInstance(ctx: AppContext, actor: Actor, id: string): Promise<void> {
  await ctx.db.tx(async (q) => {
    const row = await lockInstance(q, id);
    await q.query(
      `UPDATE instances SET operator_stopped = false,
         state = CASE WHEN state IN ('ready', 'failed') THEN 'setting_up' ELSE state END,
         state_reason = CASE WHEN state IN ('ready', 'failed') THEN 'ligada pelo operador' ELSE state_reason END
       WHERE id = $1`, [id]);
    await audit(q, actor, { action: "instance.started", targetType: "instance", targetId: id, organizationId: row.organization_id });
  });
}

/** Operator: recreate the container from a fresh pull of the image. The data volume is kept. */
export async function reprovisionInstance(ctx: AppContext, actor: Actor, id: string, reason: string): Promise<void> {
  await ctx.db.tx(async (q) => {
    const row = await lockInstance(q, id);
    await q.query(
      `UPDATE instances SET generation = generation + 1, observed_error = NULL,
         state = CASE WHEN state IN ('ready', 'failed') THEN 'setting_up' ELSE state END,
         state_reason = CASE WHEN state IN ('ready', 'failed') THEN 'recriando o contêiner' ELSE state_reason END
       WHERE id = $1`, [id]);
    await audit(q, actor, { action: "instance.reprovisioned", targetType: "instance", targetId: id, organizationId: row.organization_id, reason,
      data: { generation: row.generation + 1 } });
  });
  await assignPendingInstances(ctx);
}

/**
 * Operator: remove it for good. The agent removes the container; the data volume stays on the node until someone deletes
 * it by hand. The instance's AI token is revoked. The organisation can then get a new instance (new slug, new volume).
 */
export async function decommissionInstance(ctx: AppContext, actor: Actor, id: string, reason: string): Promise<void> {
  await ctx.db.tx(async (q) => {
    const row = await lockInstance(q, id);
    await q.query("UPDATE instances SET decommissioned_at = $2, state = 'stopped', state_reason = $3 WHERE id = $1", [id, ctx.now(), `desativada: ${reason}`.slice(0, 500)]);
    if (row.gateway_token_id) await q.query("UPDATE gateway_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL", [row.gateway_token_id]);
    await audit(q, actor, { action: "instance.decommissioned", targetType: "instance", targetId: id, organizationId: row.organization_id, reason,
      data: { slug: row.slug, nodeId: row.node_id } });
  });
}

/** The plan code of the organisation's live subscription, or null. */
export async function livePlanCode(q: Queryable, organizationId: string): Promise<string | null> {
  const { rows } = await q.query<{ code: string }>(
    `SELECT p.code FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.organization_id = $1 AND ${LIVE_SUBSCRIPTION} ORDER BY s.created_at DESC LIMIT 1`,
    [organizationId]);
  return rows[0]?.code ?? null;
}

/**
 * Tells the instance its plan (signed POST /api/cloud/plan), which sets its bot limit. Returns whether it is in step.
 * Throws when the instance answered with an error, so the job retries.
 */
export async function syncInstancePlan(ctx: AppContext, instanceId: string): Promise<boolean> {
  const row = (await ctx.db.query<InstanceRow>("SELECT * FROM instances WHERE id = $1", [instanceId])).rows[0];
  if (!row || row.decommissioned_at || !row.public_url || !row.bootstrap_secret_enc) return false;
  if (row.state !== "ready" && row.state !== "payment_problem") return false;
  const code = await livePlanCode(ctx.db, row.organization_id);
  if (!code || !CLOUD_TIER.test(code)) return false;
  if (row.plan_tier_synced === code) return true;
  const secret = ctx.box.decrypt(row.bootstrap_secret_enc, bootstrapContext(row.id));
  const answer = await signedCloudRequest(ctx, { publicUrl: row.public_url, secret }, "POST", "/api/cloud/plan", { v: 1, tier: code });
  if (answer.status !== 200) throw new Error(`a instância ${row.slug} recusou o plano (HTTP ${answer.status})`);
  await ctx.db.query("UPDATE instances SET plan_tier_synced = $2 WHERE id = $1", [row.id, code]);
  return true;
}
