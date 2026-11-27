// The organisation's own computers as rows (vps_machines): made when the customer becomes entitled, released when not.
// Nothing here talks to a provider. A machine that money may have been spent on is never dropped by code: it waits in
// `release_pending` for the operator, who stops its renewal (or deletes it, at Hetzner) knowing what is on it.
import { audit, SYSTEM, type Actor } from "../audit.ts";
import type { AppContext } from "../context.ts";
import type { Queryable } from "../db/db.ts";
import { DomainError } from "../domain/lifecycle.ts";
import { entitlementOf } from "./entitlement.ts";
import { queueComputerAdvance } from "./queue.ts";
import { orderPlan, vpsSettings } from "./settings.ts";
import type { VpsProviderKind } from "./provider.ts";

export type MachineStatus =
  | "awaiting_approval" | "requested" | "ordering" | "provisioning" | "running" | "release_pending" | "released" | "canceled" | "stopped"
  | "failed" | "deleted";

export interface MachineRow {
  id: string;
  provider: VpsProviderKind;
  provider_vm_id: string | null;
  organization_id: string | null;
  subscription_id: string | null;
  purpose: "home" | "computer";
  status: MachineStatus;
  status_reason: string | null;
  hostname: string | null;
  plan_code: string | null;
  plan_ref: string | null;
  region: string | null;
  image_ref: string | null;
  ipv4: string | null;
  monthly_cost_cents: number | null;
  setup_fee_cents: number | null;
  provider_order_id: string | null;
  provider_subscription_id: string | null;
  provider_state: string | null;
  post_install_script_id: string | null;
  setup_requested_at: Date | null;
  enroll_token_hash: string | null;
  enroll_expires_at: Date | null;
  approved_at: Date | null;
  ordered_at: Date | null;
  ready_at: Date | null;
  auto_renew: boolean | null;
  expires_at: Date | null;
  next_check_at: Date | null;
  last_error: string | null;
  created_at: Date;
}

/** Rows that hold one of the organisation's units: everything not yet given back. */
export const HOLDING = ["awaiting_approval", "requested", "ordering", "provisioning", "running", "stopped", "failed"] as const;
/** Rows where nothing was bought yet, so dropping them costs nothing. */
const NOT_BOUGHT = new Set<MachineStatus>(["awaiting_approval", "requested"]);

export function bought(row: Pick<MachineRow, "status" | "provider_order_id" | "provider_vm_id" | "provider_subscription_id" | "last_error">): boolean {
  if (NOT_BOUGHT.has(row.status) || row.status === "canceled") return false;
  if (row.status === "failed") return Boolean(row.provider_order_id || row.provider_vm_id || row.provider_subscription_id || row.last_error?.startsWith("[compra incerta]"));
  return true;
}

async function lockMachine(q: Queryable, id: string): Promise<MachineRow> {
  const row = (await q.query<MachineRow>("SELECT * FROM vps_machines WHERE id = $1 FOR UPDATE", [id])).rows[0];
  if (!row) throw new DomainError("Computador não encontrado", 404);
  return row;
}

export interface SyncResult {
  created: number;
  released: number;
  canceled: number;
}

/**
 * Brings the organisation's rows in line with what it is entitled to. New rows wait for the operator unless automatic
 * purchase is on; only the first one (which takes the customer's ArkoBot) is ever bought without approval, since the
 * extra ones are not yet usable by the bots.
 */
export async function syncOrganizationComputers(ctx: AppContext, organizationId: string, actor: Actor = SYSTEM): Promise<SyncResult> {
  const now = ctx.now();
  const result: SyncResult = { created: 0, released: 0, canceled: 0 };
  const toAdvance: string[] = [];
  await ctx.db.tx(async (q) => {
    const org = (await q.query<{ id: string }>("SELECT id FROM organizations WHERE id = $1 FOR UPDATE", [organizationId])).rows[0];
    if (!org) return;
    const entitlement = await entitlementOf(q, organizationId, now);
    const settings = await vpsSettings(q);
    const live = (await q.query<MachineRow>(
      `SELECT * FROM vps_machines WHERE organization_id = $1 AND status = ANY ($2::text[]) ORDER BY created_at`, [organizationId, [...HOLDING]])).rows;

    for (let count = live.length; count < entitlement.buy; count++) {
      const purpose = live.some((m) => m.purpose === "home") || result.created > 0 ? "computer" : "home";
      const auto = settings.auto_purchase && purpose === "home";
      const plan = orderPlan(settings);
      const { rows } = await q.query<{ id: string }>(
        `INSERT INTO vps_machines (provider, organization_id, subscription_id, purpose, status, status_reason, plan_ref, plan_code, region, image_ref,
           monthly_cost_cents, setup_fee_cents, next_check_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [plan.provider, organizationId, entitlement.subscriptionId, purpose, auto ? "requested" : "awaiting_approval",
          auto ? "compra automática" : purpose === "home" ? "aguardando aprovação do operador" : "unidade extra: aguardando aprovação do operador",
          plan.planRef, plan.regionRef, plan.imageRef, plan.monthlyCostCents, plan.setupFeeCents, auto ? now : null]);
      const id = rows[0]!.id;
      await audit(q, actor, { action: "computer.requested", targetType: "vps_machine", targetId: id, organizationId,
        data: { purpose, provider: plan.provider, planRef: plan.planRef, automatic: auto } });
      if (auto) toAdvance.push(id);
      result.created++;
    }

    const surplus = live.length - entitlement.keep;
    if (surplus > 0) {
      // Cheapest to give back first: rows not bought yet, then extra units, newest first; the home machine last.
      const order = [...live].sort((a, b) =>
        Number(bought(a)) - Number(bought(b)) || Number(a.purpose === "home") - Number(b.purpose === "home") || b.created_at.getTime() - a.created_at.getTime());
      for (const machine of order.slice(0, surplus)) {
        if (!bought(machine)) {
          await q.query("UPDATE vps_machines SET status = 'canceled', status_reason = 'o cliente não tem mais direito a esta unidade', next_check_at = NULL WHERE id = $1", [machine.id]);
          await audit(q, actor, { action: "computer.canceled", targetType: "vps_machine", targetId: machine.id, organizationId, reason: "sem direito" });
          result.canceled++;
        } else {
          await q.query("UPDATE vps_machines SET status = 'release_pending', status_reason = 'o cliente não tem mais direito: encerre no provedor' WHERE id = $1", [machine.id]);
          await audit(q, actor, { action: "computer.release_pending", targetType: "vps_machine", targetId: machine.id, organizationId });
          result.released++;
        }
      }
    }
    for (const id of toAdvance) await queueComputerAdvance(q, id, now);
  });
  return result;
}

/** Every organisation whose machine rows may be out of step with its entitlement. Run by the cron tick. */
export async function sweepComputers(ctx: AppContext, limit = 50): Promise<SyncResult> {
  const total: SyncResult = { created: 0, released: 0, canceled: 0 };
  const { rows } = await ctx.db.query<{ id: string }>(
    `SELECT o.id FROM organizations o WHERE EXISTS (
       SELECT 1 FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.organization_id = o.id AND s.status <> 'canceled'
         AND (p.included_vps > 0 OR EXISTS (SELECT 1 FROM subscription_addons sa WHERE sa.subscription_id = s.id)))
     OR EXISTS (SELECT 1 FROM vps_machines m WHERE m.organization_id = o.id AND m.status = ANY ($1::text[]))
     ORDER BY o.created_at LIMIT $2`, [[...HOLDING], limit]);
  for (const row of rows) {
    try {
      const one = await syncOrganizationComputers(ctx, row.id);
      total.created += one.created;
      total.released += one.released;
      total.canceled += one.canceled;
    } catch (error) {
      console.error(`[computadores] cliente ${row.id}: ${(error as Error).message}`);
    }
  }
  return total;
}

/** Operator: "Aprovar e contratar". The purchase itself runs in the job, once. */
export async function approveMachine(ctx: AppContext, actor: Actor & { id?: string | null }, id: string): Promise<void> {
  await ctx.db.tx(async (q) => {
    const row = await lockMachine(q, id);
    if (row.status !== "awaiting_approval") throw new DomainError("Este pedido não está esperando aprovação", 409);
    await q.query(
      `UPDATE vps_machines SET status = 'requested', status_reason = 'aprovado pelo operador', approved_by = $2, approved_at = $3, next_check_at = $3 WHERE id = $1`,
      [id, actor.type === "admin" ? actor.id ?? null : null, ctx.now()]);
    await audit(q, actor, { action: "computer.approved", targetType: "vps_machine", targetId: id, organizationId: row.organization_id });
    await queueComputerAdvance(q, id, ctx.now());
  });
}

/** Operator: drop a request on which nothing was spent. */
export async function discardMachine(ctx: AppContext, actor: Actor, id: string, reason: string): Promise<void> {
  await ctx.db.tx(async (q) => {
    const row = await lockMachine(q, id);
    if (bought(row) || !["awaiting_approval", "requested", "failed"].includes(row.status)) {
      throw new DomainError("Este computador pode ter sido comprado: use Encerrar para parar a cobrança do provedor", 409);
    }
    await q.query("UPDATE vps_machines SET status = 'canceled', status_reason = $2, next_check_at = NULL WHERE id = $1", [id, `descartado: ${reason}`.slice(0, 1000)]);
    await audit(q, actor, { action: "computer.discarded", targetType: "vps_machine", targetId: id, organizationId: row.organization_id, reason });
  });
}

/** Operator: try a failed machine again. A purchase that may have gone through is only checked again, never repeated. */
export async function retryMachine(ctx: AppContext, actor: Actor, id: string): Promise<void> {
  await ctx.db.tx(async (q) => {
    const row = await lockMachine(q, id);
    if (row.status !== "failed") throw new DomainError("Só um computador com falha pode ser tentado de novo", 409);
    if (row.last_error?.startsWith("[compra incerta]") && !row.provider_vm_id && !row.provider_subscription_id) {
      throw new DomainError("A compra pode ter sido feita: confira no painel do provedor. Se não foi, descarte e aprove um novo pedido.", 409);
    }
    const next = bought(row) ? "provisioning" : "requested";
    await q.query("UPDATE vps_machines SET status = $2, status_reason = 'tentando de novo', last_error = NULL, next_check_at = $3 WHERE id = $1", [id, next, ctx.now()]);
    await audit(q, actor, { action: "computer.retried", targetType: "vps_machine", targetId: id, organizationId: row.organization_id, data: { next } });
    await queueComputerAdvance(q, id, ctx.now());
  });
}
