import type { Queryable } from "./db/db.ts";

export interface Actor {
  type: "admin" | "system" | "webhook" | "cli" | "customer";
  id?: string | null;
  label?: string | null;
  ip?: string | null;
}

export const SYSTEM: Actor = { type: "system", label: "sistema" };

export interface AuditEntry {
  action: string;
  targetType?: string;
  targetId?: string;
  organizationId?: string | null;
  reason?: string | null;
  data?: Record<string, unknown>;
}

export async function audit(q: Queryable, actor: Actor, entry: AuditEntry): Promise<void> {
  await q.query(
    `INSERT INTO audit_log (actor_type, actor_id, actor_label, action, target_type, target_id, organization_id, reason, data, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      actor.type, actor.id ?? null, actor.label ?? null, entry.action, entry.targetType ?? null, entry.targetId ?? null,
      entry.organizationId ?? null, entry.reason ?? null, JSON.stringify(entry.data ?? {}), actor.ip ?? null,
    ],
  );
}
