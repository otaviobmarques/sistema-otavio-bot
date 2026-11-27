// Sleeping instances: a plan with idle_sleep_minutes (the Inicial: 30) stops its instance's container once the
// instance says it is idle that long, and starts it again when someone opens it, visits its address or its next routine
// is near. The instance decides what idle means (server/cloud-power.ts: no turn, routine run, hand-off, cloud computer
// or maintenance, nobody using it for the window, and here also no page open); the Admin only asks, about once a minute,
// through the signed GET /api/cloud/power and POST /api/cloud/power/sleep (docs/cloud-pro.md, "Sleeping homes").
// Sleeping is not a stop: instances.state stays as it is, the volume is kept, and billing or the operator never see it.
import { audit, SYSTEM, type Actor } from "../audit.ts";
import type { AppContext } from "../context.ts";
import { InstanceUnreachable, signedCloudRequest } from "./cloud-request.ts";
import { bootstrapContext, type InstanceRow } from "./instances.ts";
import { WAKE_POKE_HEADER } from "./protocol.ts";
import { queuePlanSync, queueStorageSync } from "./queue.ts";

/** How often each awake instance of a sleeping plan is asked whether it is idle. */
export const POWER_CHECK_MS = 60_000;
/** A sleeping instance is started this long before its next routine (a stopped container boots in about 20 s). */
export const WAKE_LEAD_MS = 3 * 60_000;
/** After a wake, the customer area says "Acordando…" for at most this long while the instance is not answering yet. */
export const WAKING_MS = 5 * 60_000;

/** The plan of the organisation's live subscription, as a lateral join on `i` (instances). */
const LIVE_PLAN = `LEFT JOIN LATERAL (SELECT p.idle_sleep_minutes FROM subscriptions s JOIN plans p ON p.id = s.plan_id
  WHERE s.organization_id = i.organization_id AND s.status IN ('active', 'past_due') ORDER BY s.created_at DESC LIMIT 1) lp ON true`;
/** Where sleeping makes sense: the instance should be running (not stopped by billing or the operator). */
const MAY_SLEEP = "i.decommissioned_at IS NULL AND NOT i.operator_stopped AND i.state IN ('ready', 'payment_problem')";

export type PowerState = "asleep" | "waking" | "awake";

type PowerRow = Pick<InstanceRow, "sleeping_since" | "woke_at" | "observed_state" | "observed_health" | "state" | "operator_stopped" | "decommissioned_at">;

/** Asleep, waking (woken a moment ago and not answering yet) or awake, for the panels. */
export function powerStateOf(row: PowerRow, now: Date): PowerState {
  const eligible = !row.decommissioned_at && !row.operator_stopped && (row.state === "ready" || row.state === "payment_problem");
  if (eligible && row.sleeping_since) return "asleep";
  const answering = row.observed_state === "running" && row.observed_health !== "starting" && row.observed_health !== "unhealthy";
  if (eligible && row.woke_at && now.getTime() - new Date(row.woke_at).getTime() < WAKING_MS && !answering) return "waking";
  return "awake";
}

export interface WakeResult {
  woke: boolean;
  publicUrl: string | null;
}

/**
 * Wakes a sleeping instance: the next desired state the agent pulls says running. Idempotent: false when it was not
 * asleep. `via` goes to the audit log (cliente, visita, rotina, plano). The instance learns its plan and space again.
 */
export async function wakeInstance(ctx: AppContext, actor: Actor, instanceId: string, via: string): Promise<WakeResult> {
  return ctx.db.tx(async (q) => {
    const now = ctx.now();
    const { rows } = await q.query<{ organization_id: string; slug: string; public_url: string | null; sleeping_since: Date }>(
      `WITH before AS (SELECT id, sleeping_since FROM instances WHERE id = $1 AND sleeping_since IS NOT NULL FOR UPDATE)
       UPDATE instances i SET sleeping_since = NULL, wake_at = NULL, woke_at = $2, power_busy = NULL FROM before
       WHERE i.id = before.id RETURNING i.organization_id, i.slug, i.public_url, before.sleeping_since`, [instanceId, now]);
    const row = rows[0];
    if (!row) return { woke: false, publicUrl: null };
    await audit(q, actor, { action: "instance.woke", targetType: "instance", targetId: instanceId, organizationId: row.organization_id,
      data: { slug: row.slug, via, sleptMinutes: Math.round((now.getTime() - new Date(row.sleeping_since).getTime()) / 60_000) } });
    await queuePlanSync(q, instanceId, now);
    await queueStorageSync(q, instanceId, now);
    return { woke: true, publicUrl: row.public_url };
  });
}

/**
 * The fast path of a wake: one request to the instance's address. While it sleeps that address is the node agent's
 * waking page (Traefik's catch-all router), which takes it as a visit and polls the Admin at once instead of within
 * 15 s. Never throws; a few seconds at most.
 */
export async function pokeWakingPage(ctx: Pick<AppContext, "fetch">, publicUrl: string | null): Promise<void> {
  if (!publicUrl) return;
  try {
    const response = await ctx.fetch(`${publicUrl}/api/health`, {
      headers: { [WAKE_POKE_HEADER]: "1", accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(3_000),
    });
    await response.body?.cancel().catch(() => undefined);
  } catch {
    // The agent still sees it at its next poll.
  }
}

/**
 * Wakes the sleeping instances whose next routine is near, and those that should no longer sleep (the plan changed,
 * billing or the operator stopped it: their own stop takes over). On one node (`nodeId`, from its agent's poll) or all.
 */
export async function wakeDueInstances(ctx: AppContext, options: { nodeId?: string; poke?: boolean } = {}): Promise<number> {
  const now = ctx.now();
  const { rows } = await ctx.db.query<{ id: string; due: boolean }>(
    `SELECT i.id, (i.wake_at IS NOT NULL AND i.wake_at <= $1) AS due FROM instances i ${LIVE_PLAN}
     WHERE i.sleeping_since IS NOT NULL AND ($2::uuid IS NULL OR i.node_id = $2)
       AND ((i.wake_at IS NOT NULL AND i.wake_at <= $1) OR lp.idle_sleep_minutes IS NULL OR NOT (${MAY_SLEEP}))
     ORDER BY i.wake_at NULLS FIRST LIMIT 50`, [now, options.nodeId ?? null]);
  let woken = 0;
  for (const row of rows) {
    const result = await wakeInstance(ctx, SYSTEM, row.id, row.due ? "rotina" : "plano");
    if (!result.woke) continue;
    woken++;
    if (options.poke) await pokeWakingPage(ctx, result.publicUrl);
  }
  return woken;
}

interface PowerReport {
  idle?: unknown;
  busy?: unknown;
  browsers?: unknown;
  nextDueAt?: unknown;
}

/** Why an awake instance did not sleep, as the fixed codes it gave (or ours: http_NNN, sem-resposta, imagem-antiga). */
function busyCodes(report: PowerReport | null): string {
  const busy = Array.isArray(report?.busy) ? report.busy.filter((code): code is string => typeof code === "string" && /^[a-z-]{1,20}$/.test(code)) : [];
  return busy.join(",").slice(0, 200) || "ocupada";
}

export type IdleVerdict = "slept" | "busy" | "unreachable" | "skipped";

/** One instance: read its power, and if it is idle with no page open, ask it to sleep and record the sleep. */
async function checkOne(ctx: AppContext, row: InstanceRow & { idle_sleep_minutes: number }): Promise<IdleVerdict> {
  const minutes = row.idle_sleep_minutes;
  const secret = ctx.box.decrypt(row.bootstrap_secret_enc!, bootstrapContext(row.id));
  const instance = { publicUrl: row.public_url!, secret };
  const note = (busy: string) => ctx.db.query("UPDATE instances SET power_busy = $2 WHERE id = $1", [row.id, busy.slice(0, 200)]);
  try {
    const read = await signedCloudRequest(ctx, instance, "GET", `/api/cloud/power?idleMinutes=${minutes}&browsers=1`);
    const report = read.data as PowerReport | null;
    if (read.status !== 200 || !report) return await note(`http_${read.status}`).then(() => "busy");
    // An image from before the page count can't promise no page is open: it stays awake until it is updated.
    if (typeof report.browsers !== "number") return await note("imagem-antiga").then(() => "busy");
    if (report.idle !== true || report.browsers > 0) return await note(busyCodes(report)).then(() => "busy");
    const asked = await signedCloudRequest(ctx, instance, "POST", "/api/cloud/power/sleep", { v: 1, idleMinutes: minutes, browsers: true });
    if (asked.status !== 200 || asked.data?.ok !== true) return await note(busyCodes(asked.data as PowerReport | null)).then(() => "busy");
    const nextDueAt = typeof asked.data.nextDueAt === "number" && Number.isFinite(asked.data.nextDueAt) ? asked.data.nextDueAt : null;
    const now = ctx.now();
    const wakeAt = nextDueAt === null ? null : new Date(Math.max(now.getTime(), nextDueAt - WAKE_LEAD_MS));
    return await ctx.db.tx(async (q) => {
      const updated = await q.query<{ organization_id: string }>(
        `UPDATE instances i SET sleeping_since = $2, wake_at = $3, power_busy = NULL WHERE i.id = $1 AND i.sleeping_since IS NULL AND ${MAY_SLEEP}
         RETURNING i.organization_id`, [row.id, now, wakeAt]);
      if (!updated.rows[0]) return "skipped";
      await audit(q, SYSTEM, { action: "instance.slept", targetType: "instance", targetId: row.id, organizationId: updated.rows[0].organization_id,
        data: { slug: row.slug, idleMinutes: minutes, wakeAt: wakeAt?.toISOString() ?? null } });
      return "slept";
    });
  } catch (error) {
    if (!(error instanceof InstanceUnreachable)) throw error;
    await note("sem-resposta");
    return "unreachable";
  }
}

export interface IdleSweep {
  checked: number;
  slept: number;
}

/**
 * Asks the awake instances of plans that sleep whether they are idle, each at most once a minute (claimed through
 * power_checked_at, so two sweeps never ask the same one twice). Run by the cron tick and by each agent report.
 */
export async function checkIdleInstances(ctx: AppContext, options: { nodeId?: string; limit?: number } = {}): Promise<IdleSweep> {
  const now = ctx.now();
  const stale = new Date(now.getTime() - POWER_CHECK_MS + 5_000);
  const { rows } = await ctx.db.query<InstanceRow & { idle_sleep_minutes: number }>(
    `SELECT i.*, lp.idle_sleep_minutes FROM instances i ${LIVE_PLAN}
     WHERE lp.idle_sleep_minutes IS NOT NULL AND i.sleeping_since IS NULL AND ${MAY_SLEEP}
       AND i.observed_state = 'running' AND i.public_url IS NOT NULL AND i.bootstrap_secret_enc IS NOT NULL
       AND ($2::uuid IS NULL OR i.node_id = $2) AND (i.power_checked_at IS NULL OR i.power_checked_at < $1)
     ORDER BY i.power_checked_at NULLS FIRST LIMIT $3`, [stale, options.nodeId ?? null, options.limit ?? 20]);
  const claimed: typeof rows = [];
  for (const row of rows) {
    const taken = await ctx.db.query("UPDATE instances SET power_checked_at = $2 WHERE id = $1 AND (power_checked_at IS NULL OR power_checked_at < $3) RETURNING id",
      [row.id, now, stale]);
    if (taken.rows.length) claimed.push(row);
  }
  const verdicts = await Promise.all(claimed.map((row) => checkOne(ctx, row).catch((error) => {
    console.error(`[dormir] ${row.slug}: ${(error as Error).message}`);
    return "unreachable" as const;
  })));
  return { checked: claimed.length, slept: verdicts.filter((verdict) => verdict === "slept").length };
}
