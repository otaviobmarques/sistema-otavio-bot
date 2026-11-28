// A customer's extra computers (vps_machines.purpose = 'computer') become "VPS própria" computers for the bots of their
// ArkoBot: the server's own Self-hosted VPS backend (server/cloud-computers.ts, server/vps-computer.ts), driven over SSH.
//   1. The VPS's agent reports its SSH host keys (nodes.ssh_host_keys).
//   2. The ArkoBot makes its own SSH key; the Admin reads the public half (signed GET /api/cloud/computers).
//   3. The VPS's agent puts that key in the `arkobot` user's authorized_keys, limited to the ArkoBot's server address
//      (desired state `sshAccess`).
//   4. The Admin hands the computer to the ArkoBot (signed POST /api/cloud/computers, action add) with the host keys.
// Run by the cron tick; each step waits for the one before. Releasing a machine first takes it back (action remove).
import { audit, SYSTEM } from "../audit.ts";
import type { AppContext } from "../context.ts";
import type { Queryable } from "../db/db.ts";
import { DomainError } from "../domain/lifecycle.ts";
import { InstanceUnreachable, signedCloudRequest } from "../provisioning/cloud-request.ts";
import { bootstrapContext, type InstanceRow } from "../provisioning/instances.ts";

export const COMPUTER_LOGIN = "arkobot";
const PUBLIC_KEY = /^ssh-ed25519 [A-Za-z0-9+/]+={0,3}(?: [A-Za-z0-9@._-]{1,100})?$/;
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export const computerId = (machineId: string) => `vps-${machineId.slice(0, 8)}`;

interface ComputerRow {
  id: string;
  organization_id: string;
  ipv4: string | null;
  assigned_instance_id: string | null;
  node_id: string;
  ssh_host_keys: string[] | null;
}

async function liveInstance(q: Queryable, organizationId: string): Promise<(InstanceRow & { egress_ip: string | null }) | null> {
  const { rows } = await q.query<InstanceRow & { egress_ip: string | null }>(
    `SELECT i.*, n.public_ip AS egress_ip FROM instances i LEFT JOIN nodes n ON n.id = i.node_id
     WHERE i.organization_id = $1 AND i.decommissioned_at IS NULL ORDER BY i.created_at DESC LIMIT 1`, [organizationId]);
  return rows[0] ?? null;
}

/** The SSH login a computer node's agent keeps (its desired state); null for any other node. */
export async function sshAccessFor(q: Queryable, nodeId: string): Promise<{ user: string; keys: string[] } | null> {
  const machine = (await q.query<{ organization_id: string | null; purpose: string }>(
    "SELECT m.organization_id, m.purpose FROM nodes n JOIN vps_machines m ON m.id = n.vps_machine_id WHERE n.id = $1", [nodeId])).rows[0];
  if (!machine || machine.purpose !== "computer" || !machine.organization_id) return null;
  const instance = await liveInstance(q, machine.organization_id);
  const key = instance?.computer_public_key;
  const from = instance?.egress_ip;
  // Without the ArkoBot's key or its address, nobody may log in.
  if (!key || !PUBLIC_KEY.test(key) || !from || !IPV4.test(from)) return { user: COMPUTER_LOGIN, keys: [] };
  return { user: COMPUTER_LOGIN, keys: [`from="${from}",no-agent-forwarding,no-X11-forwarding ${key}`] };
}

function instanceAuth(ctx: AppContext, instance: InstanceRow) {
  if (!instance.public_url || !instance.bootstrap_secret_enc) return null;
  return { publicUrl: instance.public_url, secret: ctx.box.decrypt(instance.bootstrap_secret_enc, bootstrapContext(instance.id)) };
}

export interface AssignSweep {
  keysRead: number;
  assigned: number;
  waiting: number;
}

/** Cron: moves each running extra computer one step closer to being its customer's bots' computer. */
export async function assignComputers(ctx: AppContext, limit = 20): Promise<AssignSweep> {
  const summary: AssignSweep = { keysRead: 0, assigned: 0, waiting: 0 };
  const { rows } = await ctx.db.query<ComputerRow>(
    `SELECT m.id, m.organization_id, m.ipv4, m.assigned_instance_id, n.id AS node_id, n.ssh_host_keys
     FROM vps_machines m JOIN nodes n ON n.vps_machine_id = m.id
     WHERE m.purpose = 'computer' AND m.status = 'running' AND m.organization_id IS NOT NULL ORDER BY m.created_at LIMIT $1`, [limit]);
  for (const machine of rows) {
    const instance = await liveInstance(ctx.db, machine.organization_id);
    if (!instance || instance.state !== "ready" || instance.sleeping_since) { summary.waiting++; continue; }
    const auth = instanceAuth(ctx, instance);
    if (!auth) { summary.waiting++; continue; }
    try {
      if (!instance.computer_public_key) {
        const read = await signedCloudRequest(ctx, auth, "GET", "/api/cloud/computers");
        const key = typeof read.data?.publicKey === "string" ? read.data.publicKey.trim() : "";
        if (read.status !== 200 || !PUBLIC_KEY.test(key)) throw new Error(`o ArkoBot não deu a chave (HTTP ${read.status}); a imagem precisa ser atualizada`);
        await ctx.db.query("UPDATE instances SET computer_public_key = $2 WHERE id = $1", [instance.id, key]);
        summary.keysRead++;
        continue; // The computer's agent puts the key in place on its next poll; the hand-over comes on a later tick.
      }
      if (machine.assigned_instance_id === instance.id) continue;
      if (!machine.ssh_host_keys?.length || !machine.ipv4) { summary.waiting++; continue; }
      const added = await signedCloudRequest(ctx, auth, "POST", "/api/cloud/computers", {
        v: 1, action: "add",
        computer: { id: computerId(machine.id), name: `Computador ${computerId(machine.id).slice(4)}`, host: machine.ipv4, user: COMPUTER_LOGIN, hostKeys: machine.ssh_host_keys },
      });
      if (added.status !== 200) throw new Error(`o ArkoBot recusou o computador (HTTP ${added.status} ${String(added.data?.error ?? "")})`);
      const check = added.data?.check as { ok?: boolean; problem?: string } | undefined;
      await ctx.db.tx(async (q) => {
        await q.query("UPDATE vps_machines SET assigned_instance_id = $2, assigned_at = $3, assign_error = $4 WHERE id = $1",
          [machine.id, instance.id, ctx.now(), check?.ok === false ? `entregue, mas o teste falhou: ${String(check.problem ?? "").slice(0, 300)}` : null]);
        await audit(q, SYSTEM, { action: "computer.assigned", targetType: "vps_machine", targetId: machine.id, organizationId: machine.organization_id,
          data: { instanceId: instance.id, alias: added.data?.alias ?? null, checked: check?.ok ?? null } });
      });
      summary.assigned++;
    } catch (error) {
      const message = error instanceof InstanceUnreachable ? "o ArkoBot do cliente não respondeu" : (error as Error).message;
      await ctx.db.query("UPDATE vps_machines SET assign_error = $2 WHERE id = $1", [machine.id, message.slice(0, 500)]);
      summary.waiting++;
    }
  }
  return summary;
}

/** Before a computer is released: the ArkoBot gives it back. Refused while a bot's desktop still lives on it. */
export async function unassignComputer(ctx: AppContext, machineId: string): Promise<void> {
  const machine = (await ctx.db.query<{ assigned_instance_id: string | null; organization_id: string | null }>(
    "SELECT assigned_instance_id, organization_id FROM vps_machines WHERE id = $1", [machineId])).rows[0];
  if (!machine?.assigned_instance_id) return;
  const instance = (await ctx.db.query<InstanceRow>("SELECT * FROM instances WHERE id = $1", [machine.assigned_instance_id])).rows[0];
  const auth = instance && !instance.decommissioned_at ? instanceAuth(ctx, instance) : null;
  if (auth) {
    const removed = await signedCloudRequest(ctx, auth, "POST", "/api/cloud/computers", { v: 1, action: "remove", id: computerId(machineId) })
      .catch((error) => { throw new DomainError(`O ArkoBot do cliente não respondeu para devolver o computador: ${(error as Error).message}`, 409); });
    if (removed.status === 409) throw new DomainError("Um bot do cliente ainda usa este computador: troque o computador do bot antes de encerrar", 409);
    if (removed.status !== 200) throw new DomainError(`O ArkoBot recusou devolver o computador (HTTP ${removed.status})`, 409);
  }
  await ctx.db.query("UPDATE vps_machines SET assigned_instance_id = NULL, assigned_at = NULL WHERE id = $1", [machineId]);
}
