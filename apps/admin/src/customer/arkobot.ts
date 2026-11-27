// "Meu ArkoBot" in the customer area: the state of the organisation's instance, and a one-time sign-in link to it.
import { audit } from "../audit.ts";
import { hit } from "../auth/rate-limit.ts";
import type { AppContext } from "../context.ts";
import { DomainError } from "../domain/lifecycle.ts";
import { browserSignInUrl, InstanceUnreachable } from "../provisioning/cloud-request.ts";
import { bootstrapContext, livePlanCode, provisionForOrganization, syncInstancePlan, type InstanceRow } from "../provisioning/instances.ts";
import { pokeWakingPage, powerStateOf, wakeInstance } from "../provisioning/sleep.ts";
import { diskUsageOf, type DiskUsageView } from "./disk-usage.ts";
import type { CustomerRequest } from "./service.ts";

/**
 * What the card shows. `preparing` covers a new instance and one starting again; `paused_payment` a stop for billing;
 * `sleeping` an instance of a plan that sleeps when idle (it wakes when opened) and `waking` one woken a moment ago.
 */
export type ArkoBotStatus = "none" | "preparing" | "ready" | "payment_pending" | "paused_payment" | "paused" | "failed" | "sleeping" | "waking";

export interface ArkoBotView {
  status: ArkoBotStatus;
  url: string | null;
  canOpen: boolean;
  /** The customer may open it: owner or admin of the organisation (the instance's owner scope). */
  canManage: boolean;
  /** The instance's space against the plan, as last measured; null until measured or when the plan sets no limit. */
  disk: DiskUsageView | null;
}

const OPEN_LIMIT = { windowMs: 60_000, max: 6 };
/** Opening a sleeping or waking one wakes it and answers `waking`; the card then waits for it and opens it. */
const OPENABLE = new Set<ArkoBotStatus>(["ready", "payment_pending", "sleeping", "waking"]);

/** "Abrir meu ArkoBot": a sign-in link, or `waking` while a sleeping instance starts (the card asks again once it is up). */
export type OpenResult = { url: string } | { waking: true };

async function membershipOf(ctx: AppContext, accountId: string) {
  const { rows } = await ctx.db.query<{ organization_id: string; role: "owner" | "admin" | "member" }>(
    `SELECT organization_id, role FROM memberships WHERE account_id = $1
     ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, created_at LIMIT 1`, [accountId]);
  if (!rows[0]) throw new DomainError("Complete o seu cadastro para continuar", 409);
  return rows[0];
}

async function liveInstance(ctx: AppContext, organizationId: string): Promise<InstanceRow | null> {
  const { rows } = await ctx.db.query<InstanceRow>("SELECT * FROM instances WHERE organization_id = $1 AND decommissioned_at IS NULL", [organizationId]);
  return rows[0] ?? null;
}

function statusOf(instance: InstanceRow | null, orgStatus: string, entitled: boolean, now: Date): ArkoBotStatus {
  if (!instance) return entitled ? "preparing" : "none";
  const power = powerStateOf(instance, now);
  if (power === "asleep") return "sleeping";
  if (power === "waking") return "waking";
  const running = instance.observed_state === "running";
  if (instance.state === "stopped") return orgStatus === "suspended" || orgStatus === "canceled" ? "paused_payment" : "paused";
  if (instance.operator_stopped) return "paused";
  if (instance.state === "failed") return "failed";
  if (instance.state === "payment_problem") return running ? "payment_pending" : "preparing";
  if (instance.state === "ready") return running ? "ready" : "preparing";
  return "preparing";
}

/** The card's state. An organisation that is entitled to an instance and has none gets one now. */
export async function arkobotView(ctx: AppContext, req: CustomerRequest): Promise<ArkoBotView> {
  const membership = await membershipOf(ctx, req.session.accountId);
  const org = (await ctx.db.query<{ status: string }>("SELECT status FROM organizations WHERE id = $1", [membership.organization_id])).rows[0]!;
  let instance = await liveInstance(ctx, membership.organization_id);
  const entitled = org.status === "active" && (await livePlanCode(ctx.db, membership.organization_id)) !== null;
  if (!instance && entitled) {
    instance = (await provisionForOrganization(ctx, { type: "customer", id: req.session.accountId, label: req.session.email, ip: req.ip }, membership.organization_id)
      .catch((error) => {
        console.error(`[conta] provisionamento ${membership.organization_id}: ${(error as Error).message}`);
        return null;
      }))?.instance ?? null;
  }
  const status = statusOf(instance, org.status, entitled, ctx.now());
  const canManage = membership.role !== "member";
  return { status, url: instance?.public_url ?? null, canOpen: canManage && OPENABLE.has(status), canManage,
    disk: status === "none" || status === "preparing" ? null : diskUsageOf(instance) };
}

/**
 * A sign-in link for the instance: the Admin asks the instance for a single-use browser sign-in for this customer's
 * e-mail (two minutes at most) and hands back /pair#signin=… on the instance's own address. Also tells the instance
 * its plan first, if it does not know it yet, so the bot limit holds from the first visit.
 */
export async function openArkoBot(ctx: AppContext, req: CustomerRequest): Promise<OpenResult> {
  const membership = await membershipOf(ctx, req.session.accountId);
  if (membership.role === "member") throw new DomainError("Só o responsável pela conta da empresa abre o ArkoBot por aqui", 403);
  if (!(await hit(ctx.db, `conta-abrir:${req.session.accountId}`, OPEN_LIMIT, ctx.now()))) {
    throw new DomainError("Muitas tentativas. Aguarde um minuto.", 429);
  }
  const view = await arkobotView(ctx, req);
  const instance = await liveInstance(ctx, membership.organization_id);
  if (!instance || !view.canOpen || !instance.public_url || !instance.bootstrap_secret_enc) {
    throw new DomainError("Seu ArkoBot ainda está sendo preparado. Tente de novo em instantes.", 409);
  }
  const actor = { type: "customer" as const, id: req.session.accountId, label: req.session.email, ip: req.ip };
  if (view.status === "sleeping") {
    const woke = await wakeInstance(ctx, actor, instance.id, "cliente");
    // Fast path: the node's agent hears of it now instead of at its next poll.
    if (woke.woke) await pokeWakingPage(ctx, woke.publicUrl);
    return { waking: true };
  }
  if (view.status === "waking") return { waking: true };
  await syncInstancePlan(ctx, instance.id).catch((error) => console.warn(`[conta] plano da instância ${instance.slug}: ${(error as Error).message}`));
  const secret = ctx.box.decrypt(instance.bootstrap_secret_enc, bootstrapContext(instance.id));
  let url: string;
  try {
    url = await browserSignInUrl(ctx, { publicUrl: instance.public_url, secret }, req.session.email);
  } catch (error) {
    if (error instanceof InstanceUnreachable) {
      // Just woken and its server still starting (the node's waking page answered): keep waiting.
      if (instance.woke_at && ctx.now().getTime() - new Date(instance.woke_at).getTime() < 5 * 60_000) return { waking: true };
      console.warn(`[conta] abrir ${instance.slug}: ${error.message}`);
      throw new DomainError("Seu ArkoBot está ligando. Tente de novo em alguns segundos.", 503);
    }
    throw error;
  }
  await audit(ctx.db, actor,
    { action: "instance.opened", targetType: "instance", targetId: instance.id, organizationId: membership.organization_id });
  return { url };
}
