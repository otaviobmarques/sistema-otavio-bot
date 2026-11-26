// Servers (nodes) that run customer instances. Each node's agent authenticates with a token shown once at creation;
// the database keeps only its SHA-256 (nodes.agent_token_hash).
import { audit, type Actor } from "../audit.ts";
import type { Db, Queryable } from "../db/db.ts";
import { DomainError } from "../domain/lifecycle.ts";
import { randomToken, sha256Hex } from "../security/crypto.ts";
import { NODE_TOKEN_PATTERN } from "./protocol.ts";

export interface NodeRow {
  id: string;
  name: string;
  kind: "dedicated" | "shared_free";
  public_ip: string | null;
  capacity_instances: number | null;
  capacity_ram_mb: number | null;
  status: "active" | "draining" | "offline";
  last_seen_at: Date | null;
}

export interface CreateNodeInput {
  name: string;
  kind?: "dedicated" | "shared_free";
  publicIp?: string | null;
  capacityInstances?: number | null;
  capacityRamMb?: number | null;
  region?: string | null;
}

const NODE_NAME = /^[a-z0-9][a-z0-9-]{1,62}$/;

export function newNodeToken(): string {
  return `arko_node_${randomToken(32)}`;
}

/** Creates a node and returns its agent token, which is never shown again. */
export async function createNode(db: Db, actor: Actor, input: CreateNodeInput): Promise<{ node: NodeRow; token: string }> {
  const name = input.name.trim().toLowerCase();
  if (!NODE_NAME.test(name)) throw new DomainError("Nome do servidor: letras minúsculas, números e hífen (ex.: vps-hostinger-1)");
  const token = newNodeToken();
  return db.tx(async (q) => {
    const taken = await q.query("SELECT 1 FROM nodes WHERE name = $1", [name]);
    if (taken.rows.length) throw new DomainError("Já existe um servidor com esse nome", 409);
    const { rows } = await q.query<NodeRow>(
      `INSERT INTO nodes (name, kind, public_ip, capacity_instances, capacity_ram_mb, region, agent_token_hash, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active') RETURNING *`,
      [name, input.kind ?? "shared_free", input.publicIp ?? null, input.capacityInstances ?? null, input.capacityRamMb ?? null, input.region ?? null, sha256Hex(token)]);
    const node = rows[0]!;
    await audit(q, actor, { action: "node.created", targetType: "node", targetId: node.id,
      data: { name, kind: node.kind, capacityInstances: node.capacity_instances, publicIp: node.public_ip } });
    return { node, token };
  });
}

/** A new token for a node; the old one stops working at once. */
export async function rotateNodeToken(db: Db, actor: Actor, nodeId: string): Promise<string> {
  const token = newNodeToken();
  await db.tx(async (q) => {
    const { rows } = await q.query("UPDATE nodes SET agent_token_hash = $2, token_rotated_at = now() WHERE id = $1 RETURNING id", [nodeId, sha256Hex(token)]);
    if (!rows.length) throw new DomainError("Servidor não encontrado", 404);
    await audit(q, actor, { action: "node.token_rotated", targetType: "node", targetId: nodeId });
  });
  return token;
}

export async function setNodeStatus(db: Db, actor: Actor, nodeId: string, status: NodeRow["status"]): Promise<void> {
  await db.tx(async (q) => {
    const { rows } = await q.query<{ status: string }>("SELECT status FROM nodes WHERE id = $1 FOR UPDATE", [nodeId]);
    if (!rows[0]) throw new DomainError("Servidor não encontrado", 404);
    await q.query("UPDATE nodes SET status = $2 WHERE id = $1", [nodeId, status]);
    await audit(q, actor, { action: "node.status_changed", targetType: "node", targetId: nodeId, data: { from: rows[0].status, to: status } });
  });
}

/** The node behind an agent's bearer token, or null. An offline node keeps answering: its agent still needs the stop orders. */
export async function nodeForToken(q: Queryable, authorization: string | undefined): Promise<NodeRow | null> {
  const token = /^Bearer\s+(\S+)$/i.exec(authorization ?? "")?.[1] ?? "";
  if (!NODE_TOKEN_PATTERN.test(token)) return null;
  const { rows } = await q.query<NodeRow>("SELECT * FROM nodes WHERE agent_token_hash = $1", [sha256Hex(token)]);
  return rows[0] ?? null;
}
