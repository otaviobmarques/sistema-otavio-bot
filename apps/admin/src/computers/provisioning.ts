// Buying and installing a customer's computer, one step at a time (the job and the cron tick call `advanceMachine`):
// requested → ordering (the purchase, sent once) → provisioning (until its agent enrolls and reports) → running. The
// first-boot script carries a single-purpose enrollment token; the node token only travels in the enrollment answer.
import { unassignComputer } from "./assign.ts";
import { audit, SYSTEM, type Actor } from "../audit.ts";
import type { AppContext } from "../context.ts";
import type { Queryable } from "../db/db.ts";
import { DomainError } from "../domain/lifecycle.ts";
import { newNodeToken } from "../provisioning/nodes.ts";
import { NODE_STALE_MS } from "../provisioning/settings.ts";
import { randomToken, sha256Hex } from "../security/crypto.ts";
import { bought, type MachineRow } from "./machines.ts";
import { placeOnOwnComputer } from "./placement.ts";
import { postInstallScript } from "./post-install.ts";
import { VpsProviderError, type OrderRequest, type VirtualMachine } from "./provider.ts";
import { ENROLL_TTL_MS, PROVISION_POLL_MS, PROVISION_TIMEOUT_MS, providerFor } from "./settings.ts";

const ENROLL_TOKEN = /^arko_enroll_[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function edgeIp(q: Queryable): Promise<string | null> {
  const { rows } = await q.query<{ public_ip: string }>(
    `SELECT public_ip FROM nodes WHERE kind <> 'dedicated' AND status = 'active' AND public_ip ~ '^[0-9]{1,3}(\\.[0-9]{1,3}){3}$' ORDER BY created_at LIMIT 1`);
  return rows[0]?.public_ip ?? null;
}

async function setStatus(q: Queryable, id: string, fields: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(fields);
  await q.query(`UPDATE vps_machines SET ${keys.map((key, i) => `${key} = $${i + 2}`).join(", ")} WHERE id = $1`, [id, ...keys.map((key) => fields[key])]);
}

function label(row: MachineRow): string {
  return `arkobot-${row.purpose === "home" ? "cliente" : "computador"}-${row.id.slice(0, 8)}`;
}

function request(row: MachineRow, script: string): OrderRequest {
  return { label: label(row), planRef: row.plan_ref ?? "", regionRef: row.region, imageRef: row.image_ref, script };
}

/** The purchase. Only one caller gets past the `requested` → `ordering` switch, so a machine is never bought twice. */
async function order(ctx: AppContext, row: MachineRow): Promise<void> {
  const now = ctx.now();
  const provider = providerFor(ctx, row.provider);
  if (!provider) {
    await setStatus(ctx.db, row.id, { status_reason: `sem credenciais do provedor ${row.provider} no ambiente`, next_check_at: new Date(now.getTime() + 60 * 60_000) });
    return;
  }
  const enrollToken = `arko_enroll_${randomToken(32)}`;
  const claimed = await ctx.db.query(
    `UPDATE vps_machines SET status = 'ordering', status_reason = 'comprando', ordered_at = $2, enroll_token_hash = $3, enroll_expires_at = $4, next_check_at = NULL
     WHERE id = $1 AND status = 'requested' RETURNING id`,
    [row.id, now, sha256Hex(enrollToken), new Date(now.getTime() + PROVISION_TIMEOUT_MS[row.provider] + ENROLL_TTL_MS)]);
  if (!claimed.rows.length) return;
  let script: string;
  try {
    script = postInstallScript({
      adminUrl: ctx.config.publicUrl, machineId: row.id, enrollToken, edgeIp: await edgeIp(ctx.db),
      acmeEmail: ctx.config.mailFrom.match(/<([^>]+)>/)?.[1] ?? "admin@arkobot.com.br", sshKeys: ctx.config.computers?.sshKeys ?? [],
      computerLogin: row.purpose === "computer",
    });
  } catch (error) {
    await setStatus(ctx.db, row.id, { status: "failed", status_reason: "configuração inválida", last_error: (error as Error).message.slice(0, 2000) });
    return;
  }
  try {
    const result = await provider.order(request(row, script));
    await setStatus(ctx.db, row.id, {
      status: "provisioning", status_reason: "instalando", provider_order_id: result.orderRef, provider_subscription_id: result.subscriptionRef,
      provider_vm_id: result.machine?.id ?? null, provider_state: result.machine?.state ?? null, ipv4: result.machine?.ipv4 ?? null,
      hostname: result.machine?.hostname ?? null, region: result.regionRef, image_ref: result.imageRef, post_install_script_id: result.scriptRef,
      auto_renew: provider.deletesOnCancel ? null : true, next_check_at: new Date(now.getTime() + PROVISION_POLL_MS[row.provider]),
    });
    await audit(ctx.db, SYSTEM, { action: "computer.ordered", targetType: "vps_machine", targetId: row.id, organizationId: row.organization_id,
      data: { provider: row.provider, planRef: row.plan_ref, orderRef: result.orderRef, vmId: result.machine?.id ?? null } });
  } catch (error) {
    const ambiguous = !(error instanceof VpsProviderError) || error.ambiguous;
    const message = (error as Error).message.slice(0, 1900);
    await setStatus(ctx.db, row.id, {
      status: "failed", status_reason: ambiguous ? "a compra pode ter sido feita: confira no painel do provedor" : "o provedor recusou a compra",
      last_error: ambiguous ? `[compra incerta] ${message}` : message, enroll_token_hash: ambiguous ? sha256Hex(enrollToken) : null,
    });
    await audit(ctx.db, SYSTEM, { action: "computer.order_failed", targetType: "vps_machine", targetId: row.id, organizationId: row.organization_id,
      data: { ambiguous, message } });
  }
}

async function nodeOf(q: Queryable, machineId: string): Promise<{ id: string; last_seen_at: Date | null } | null> {
  return (await q.query<{ id: string; last_seen_at: Date | null }>("SELECT id, last_seen_at FROM nodes WHERE vps_machine_id = $1", [machineId])).rows[0] ?? null;
}

/** Waits for the machine, installs it if the provider left it bare, and declares it running once its agent reports. */
async function watch(ctx: AppContext, row: MachineRow): Promise<void> {
  const now = ctx.now();
  const provider = providerFor(ctx, row.provider);
  const next = new Date(now.getTime() + PROVISION_POLL_MS[row.provider]);
  if (!provider) {
    await setStatus(ctx.db, row.id, { status_reason: `sem credenciais do provedor ${row.provider} no ambiente`, next_check_at: next });
    return;
  }
  let vm: VirtualMachine | null = null;
  try {
    vm = await provider.status({ vmId: row.provider_vm_id, subscriptionRef: row.provider_subscription_id });
  } catch (error) {
    await setStatus(ctx.db, row.id, { last_error: (error as Error).message.slice(0, 2000), next_check_at: next });
    return;
  }
  if (vm) {
    await setStatus(ctx.db, row.id, {
      provider_vm_id: vm.id, provider_state: vm.state, ipv4: vm.ipv4 ?? row.ipv4, hostname: vm.hostname ?? row.hostname,
      provider_subscription_id: row.provider_subscription_id ?? vm.subscriptionRef,
    });
    if (vm.phase === "error" || vm.phase === "gone") {
      await setStatus(ctx.db, row.id, { status: "failed", status_reason: `o provedor diz: ${vm.state}`, next_check_at: null });
      return;
    }
    if (vm.phase === "needs_setup" && !row.setup_requested_at) {
      await provider.setup(vm.id, { ...request(row, ""), scriptRef: row.post_install_script_id });
      await setStatus(ctx.db, row.id, { setup_requested_at: now, status_reason: "instalando o sistema" });
    }
  }
  const node = await nodeOf(ctx.db, row.id);
  if (node?.last_seen_at && now.getTime() - new Date(node.last_seen_at).getTime() < NODE_STALE_MS) {
    await markRunning(ctx, row, node.id);
    return;
  }
  const started = row.ordered_at ?? row.created_at;
  if (now.getTime() - new Date(started).getTime() > PROVISION_TIMEOUT_MS[row.provider]) {
    await setStatus(ctx.db, row.id, { status: "failed", status_reason: "o agente não respondeu a tempo", next_check_at: null,
      last_error: node ? "o agente se inscreveu, mas não mandou relatório" : "o script de instalação não se inscreveu no Admin (veja /post_install.log ou /var/log/cloud-init-output.log)" });
    return;
  }
  await setStatus(ctx.db, row.id, { status_reason: vm ? `instalando (${vm.state})` : "aguardando o provedor criar a VPS", next_check_at: next });
}

async function markRunning(ctx: AppContext, row: MachineRow, nodeId: string): Promise<void> {
  const now = ctx.now();
  await ctx.db.tx(async (q) => {
    const updated = await q.query(
      `UPDATE vps_machines SET status = 'running', status_reason = NULL, ready_at = COALESCE(ready_at, $2), enroll_token_hash = NULL, enroll_expires_at = NULL,
         next_check_at = NULL, last_error = NULL WHERE id = $1 AND status = 'provisioning' RETURNING id`, [row.id, now]);
    if (!updated.rows.length) return;
    await audit(q, SYSTEM, { action: "computer.running", targetType: "vps_machine", targetId: row.id, organizationId: row.organization_id, data: { nodeId } });
    if (row.purpose === "home" && row.organization_id) await placeOnOwnComputer(q, row.organization_id, nodeId);
  });
  if (row.post_install_script_id) {
    await providerFor(ctx, row.provider)?.cleanup(row.post_install_script_id)
      .then(() => ctx.db.query("UPDATE vps_machines SET post_install_script_id = NULL WHERE id = $1", [row.id]))
      .catch((error) => console.error(`[computadores] script ${row.id}: ${(error as Error).message}`));
  }
}

export async function advanceMachine(ctx: AppContext, machineId: string): Promise<void> {
  const row = (await ctx.db.query<MachineRow>("SELECT * FROM vps_machines WHERE id = $1", [machineId])).rows[0];
  if (!row) return;
  if (row.status === "requested") await order(ctx, row);
  else if (row.status === "provisioning") await watch(ctx, row);
}

/** Every machine whose next check is due. Run by the cron tick. */
export async function advanceDueMachines(ctx: AppContext, limit = 20): Promise<number> {
  const { rows } = await ctx.db.query<{ id: string }>(
    `SELECT id FROM vps_machines WHERE status IN ('requested', 'provisioning') AND next_check_at IS NOT NULL AND next_check_at <= $1
     ORDER BY next_check_at LIMIT $2`, [ctx.now(), limit]);
  for (const row of rows) {
    try {
      await advanceMachine(ctx, row.id);
    } catch (error) {
      console.error(`[computadores] ${row.id}: ${(error as Error).message}`);
      await ctx.db.query("UPDATE vps_machines SET last_error = $2, next_check_at = $3 WHERE id = $1",
        [row.id, (error as Error).message.slice(0, 2000), new Date(ctx.now().getTime() + 10 * 60_000)]);
    }
  }
  return rows.length;
}

export interface EnrollAnswer {
  token: string;
  registryUser?: string;
  registryToken?: string;
}

/**
 * The first-boot script swaps its enrollment token for the node token. Repeating it (a lost answer) gives a fresh token
 * and voids the last one. Only while the machine is being installed, and only from its own address once that is known.
 */
export async function enrollMachine(ctx: AppContext, input: { machineId: unknown; enrollToken: unknown }, ip: string): Promise<EnrollAnswer | null> {
  const machineId = typeof input.machineId === "string" && UUID.test(input.machineId) ? input.machineId : null;
  const enrollToken = typeof input.enrollToken === "string" && ENROLL_TOKEN.test(input.enrollToken) ? input.enrollToken : null;
  if (!machineId || !enrollToken) return null;
  const now = ctx.now();
  const token = newNodeToken();
  const done = await ctx.db.tx(async (q) => {
    const row = (await q.query<MachineRow>("SELECT * FROM vps_machines WHERE id = $1 FOR UPDATE", [machineId])).rows[0];
    if (!row || row.status !== "provisioning" || row.enroll_token_hash !== sha256Hex(enrollToken)) return false;
    if (!row.enroll_expires_at || new Date(row.enroll_expires_at) < now) return false;
    const ipv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : null;
    if (row.ipv4 && ipv4 && row.ipv4 !== ipv4) return false;
    const address = row.ipv4 ?? ipv4;
    const existing = (await q.query<{ id: string }>("SELECT id FROM nodes WHERE vps_machine_id = $1", [row.id])).rows[0];
    if (existing) {
      await q.query("UPDATE nodes SET agent_token_hash = $2, token_rotated_at = $3, public_ip = COALESCE($4, public_ip) WHERE id = $1",
        [existing.id, sha256Hex(token), now, address]);
    } else {
      const { rows } = await q.query<{ id: string }>(
        `INSERT INTO nodes (name, kind, vps_machine_id, public_ip, capacity_instances, agent_token_hash, status)
         VALUES ($1, 'dedicated', $2, $3, $4, $5, 'active') RETURNING id`,
        [`vps-${row.id.slice(0, 8)}`, row.id, address, row.purpose === "home" ? 1 : null, sha256Hex(token)]);
      await audit(q, SYSTEM, { action: "node.created", targetType: "node", targetId: rows[0]!.id, organizationId: row.organization_id,
        data: { kind: "dedicated", vpsMachineId: row.id, publicIp: address } });
    }
    if (!row.ipv4 && address) await q.query("UPDATE vps_machines SET ipv4 = $2 WHERE id = $1", [row.id, address]);
    await q.query("UPDATE vps_machines SET status_reason = 'agente inscrito; esperando o primeiro relatório', next_check_at = $2 WHERE id = $1", [row.id, now]);
    return true;
  });
  if (!done) return null;
  const registry = ctx.config.computers?.registry;
  return { token, ...(registry ? { registryUser: registry.user, registryToken: registry.token } : {}) };
}

/**
 * Operator: stop paying for the machine. Refused while the customer's ArkoBot still runs on it (move it or deactivate it
 * first). At Hetzner this deletes the server and its disk at once.
 */
export async function releaseMachine(ctx: AppContext, actor: Actor, id: string, reason: string): Promise<{ deleted: boolean }> {
  const row = (await ctx.db.query<MachineRow>("SELECT * FROM vps_machines WHERE id = $1", [id])).rows[0];
  if (!row) throw new DomainError("Computador não encontrado", 404);
  if (!bought(row) || ["released", "deleted", "canceled"].includes(row.status)) throw new DomainError("Nada a encerrar neste computador", 409);
  if (row.status === "ordering") throw new DomainError("A compra ainda está em andamento", 409);
  // An extra computer goes back from its ArkoBot first (refused while a bot's desktop still lives on it).
  if (row.purpose === "computer") await unassignComputer(ctx, row.id);
  const node = await nodeOf(ctx.db, row.id);
  if (node) {
    const busy = await ctx.db.query("SELECT 1 FROM instances WHERE node_id = $1 AND decommissioned_at IS NULL LIMIT 1", [node.id]);
    if (busy.rows.length) throw new DomainError("O ArkoBot do cliente ainda roda nesta VPS: mova ou desative a instância antes de encerrar", 409);
  }
  const provider = providerFor(ctx, row.provider);
  if (!provider) throw new DomainError(`Sem credenciais do provedor ${row.provider} no ambiente`, 409);
  const result = await provider.cancel({ vmId: row.provider_vm_id, subscriptionRef: row.provider_subscription_id })
    .catch((error) => { throw new DomainError((error as Error).message, 502); });
  await ctx.db.tx(async (q) => {
    await setStatus(q, row.id, {
      status: provider.deletesOnCancel ? "deleted" : "released", released_at: ctx.now(), auto_renew: result.autoRenew,
      expires_at: result.expiresAt ? new Date(result.expiresAt) : null, next_check_at: null,
      status_reason: provider.deletesOnCancel ? "VPS apagada no provedor (a cobrança por hora parou)" : "renovação desligada: a VPS some ao fim do período pago",
    });
    if (node) await q.query("UPDATE nodes SET status = 'offline' WHERE id = $1", [node.id]);
    await audit(q, actor, { action: provider.deletesOnCancel ? "computer.deleted" : "computer.released", targetType: "vps_machine", targetId: row.id,
      organizationId: row.organization_id, reason, data: { provider: row.provider, expiresAt: result.expiresAt } });
  });
  return { deleted: provider.deletesOnCancel };
}
