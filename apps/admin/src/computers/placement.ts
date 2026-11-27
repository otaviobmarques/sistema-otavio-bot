// Where a customer's instance runs once it has its own computer. A brand-new instance (never came up, so no data) moves
// by itself; one with data waits for the operator to copy its volume, then moves with "Mover". On a move the old node
// removes the container (never the volume) and the shared edge starts passing the address through to the new node.
import { audit, SYSTEM, type Actor } from "../audit.ts";
import type { AppContext } from "../context.ts";
import type { Queryable } from "../db/db.ts";
import { DomainError } from "../domain/lifecycle.ts";
import type { DesiredEdge } from "../provisioning/protocol.ts";

/** The organisation's own node for its ArkoBot, if one is up: a dedicated node on its running home machine. */
export async function dedicatedNodeFor(q: Queryable, organizationId: string): Promise<string | null> {
  const { rows } = await q.query<{ id: string }>(
    `SELECT n.id FROM nodes n JOIN vps_machines m ON m.id = n.vps_machine_id
     WHERE m.organization_id = $1 AND m.purpose = 'home' AND m.status = 'running' AND n.kind = 'dedicated' AND n.status = 'active'
       AND n.agent_token_hash IS NOT NULL
     ORDER BY m.created_at LIMIT 1`, [organizationId]);
  return rows[0]?.id ?? null;
}

interface PlacedInstance {
  id: string;
  node_id: string | null;
  ready_at: Date | null;
  observed_at: Date | null;
  move_to_node_id: string | null;
  state: string;
}

async function switchNode(q: Queryable, instance: PlacedInstance, nodeId: string, reason: string): Promise<void> {
  await q.query(
    `UPDATE instances SET previous_node_id = CASE WHEN node_id IS NOT NULL AND node_id <> $2 THEN node_id ELSE previous_node_id END,
       node_id = $2, move_to_node_id = NULL, mode = 'dedicated', generation = generation + 1,
       state = CASE WHEN state IN ('ready', 'failed') THEN 'setting_up' ELSE state END,
       state_reason = CASE WHEN state IN ('ready', 'failed', 'setting_up') THEN $3 ELSE state_reason END
     WHERE id = $1`, [instance.id, nodeId, reason]);
}

/** Called when the home machine's node comes up. */
export async function placeOnOwnComputer(q: Queryable, organizationId: string, nodeId: string): Promise<"moved" | "waiting_copy" | "none"> {
  const instance = (await q.query<PlacedInstance>(
    "SELECT id, node_id, ready_at, observed_at, move_to_node_id, state FROM instances WHERE organization_id = $1 AND decommissioned_at IS NULL FOR UPDATE",
    [organizationId])).rows[0];
  if (!instance || instance.node_id === nodeId) return "none";
  if (!instance.ready_at && !instance.observed_at) {
    await switchNode(q, instance, nodeId, "indo para o computador próprio");
    await audit(q, SYSTEM, { action: "instance.moved", targetType: "instance", targetId: instance.id, organizationId, data: { nodeId, copied: false } });
    return "moved";
  }
  await q.query("UPDATE instances SET move_to_node_id = $2 WHERE id = $1", [instance.id, nodeId]);
  await audit(q, SYSTEM, { action: "instance.move_waiting_copy", targetType: "instance", targetId: instance.id, organizationId, data: { nodeId } });
  return "waiting_copy";
}

/** Operator, after copying the data volume to the new node (README: "Mover uma instância com dados"). */
export async function moveInstance(ctx: AppContext, actor: Actor, instanceId: string, reason: string): Promise<void> {
  await ctx.db.tx(async (q) => {
    const instance = (await q.query<PlacedInstance & { organization_id: string; decommissioned_at: Date | null }>(
      "SELECT * FROM instances WHERE id = $1 FOR UPDATE", [instanceId])).rows[0];
    if (!instance || instance.decommissioned_at) throw new DomainError("Instância não encontrada", 404);
    if (!instance.move_to_node_id) throw new DomainError("Esta instância não tem mudança pendente", 409);
    const target = instance.move_to_node_id;
    await switchNode(q, instance, target, "mudando para o computador próprio");
    await audit(q, actor, { action: "instance.moved", targetType: "instance", targetId: instanceId, organizationId: instance.organization_id, reason,
      data: { from: instance.node_id, nodeId: target, copied: true } });
  });
}

/**
 * The relays a shared node runs so its Traefik passes each dedicated instance's address through (TLS untouched) to the
 * customer's own VPS. The wildcard DNS points at the shared node, so it is the only way in.
 */
export async function edgesFor(q: Queryable, node: { id: string; kind?: string }): Promise<DesiredEdge[]> {
  const kind = node.kind ?? (await q.query<{ kind: string }>("SELECT kind FROM nodes WHERE id = $1", [node.id])).rows[0]?.kind;
  if (kind === "dedicated") return [];
  const { rows } = await q.query<{ id: string; slug: string; public_url: string | null; public_ip: string }>(
    `SELECT i.id, i.slug, i.public_url, n.public_ip FROM instances i JOIN nodes n ON n.id = i.node_id
     WHERE n.kind = 'dedicated' AND n.public_ip IS NOT NULL AND i.decommissioned_at IS NULL AND i.public_url IS NOT NULL ORDER BY i.created_at`);
  return rows.map((row) => ({ id: row.id, slug: row.slug, host: new URL(row.public_url!).hostname, target: `${row.public_ip}:443` }));
}
