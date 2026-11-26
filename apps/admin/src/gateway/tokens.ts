import { audit, type Actor } from "../audit.ts";
import type { Db, Queryable } from "../db/db.ts";
import { DomainError } from "../domain/lifecycle.ts";
import { randomToken, sha256Hex } from "../security/crypto.ts";
import type { ModelPrice } from "./pricing.ts";

export const GATEWAY_TOKEN_PATTERN = /^arko_ai_[A-Za-z0-9_-]{43}$/;

export interface IssuedToken {
  id: string;
  token: string;
  prefix: string;
}

/** The plain token is returned once; only its SHA-256 is stored. */
export async function issueGatewayToken(
  db: Db, actor: Actor, input: { organizationId: string; instanceId?: string | null; label: string; expiresAt?: Date | null },
): Promise<IssuedToken> {
  const token = `arko_ai_${randomToken(32)}`;
  const prefix = token.slice(0, 14);
  return db.tx(async (q) => {
    const org = await q.query("SELECT 1 FROM organizations WHERE id = $1", [input.organizationId]);
    if (!org.rows.length) throw new DomainError("Cliente não encontrado", 404);
    if (input.instanceId) {
      const instance = await q.query("SELECT 1 FROM instances WHERE id = $1 AND organization_id = $2", [input.instanceId, input.organizationId]);
      if (!instance.rows.length) throw new DomainError("Instância não encontrada neste cliente", 404);
    }
    const { rows } = await q.query<{ id: string }>(
      `INSERT INTO gateway_tokens (organization_id, instance_id, token_hash, token_prefix, label, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [input.organizationId, input.instanceId ?? null, sha256Hex(token), prefix, input.label, input.expiresAt ?? null]);
    const id = rows[0]!.id;
    await audit(q, actor, { action: "gateway_token.issued", targetType: "gateway_token", targetId: id, organizationId: input.organizationId,
      data: { prefix, label: input.label, instanceId: input.instanceId ?? null } });
    return { id, token, prefix };
  });
}

export async function revokeGatewayToken(db: Db, actor: Actor, organizationId: string, tokenId: string, reason: string): Promise<void> {
  await db.tx(async (q) => {
    const { rows } = await q.query<{ token_prefix: string }>(
      "UPDATE gateway_tokens SET revoked_at = now() WHERE id = $1 AND organization_id = $2 AND revoked_at IS NULL RETURNING token_prefix",
      [tokenId, organizationId]);
    if (!rows[0]) throw new DomainError("Token não encontrado ou já revogado", 404);
    await audit(q, actor, { action: "gateway_token.revoked", targetType: "gateway_token", targetId: tokenId, organizationId, reason,
      data: { prefix: rows[0].token_prefix } });
  });
}

export interface GatewayCaller {
  tokenId: string;
  organizationId: string;
  instanceId: string | null;
  organizationName: string;
  organizationStatus: string;
  subscriptionStatus: string | null;
  periodStart: Date | null;
  creditsPerMonth: number;
  planCode: string | null;
  allowedModels: string[];
  dailyCap: number | null;
  monthlyCap: number | null;
  perRequestCap: number | null;
  /** Requests per Brasília day to the free models; 0 = the plan has no free AI. */
  freeRequestsPerDay: number;
}

type CallerRow = {
  token_id: string; organization_id: string; instance_id: string | null; revoked_at: Date | null; expires_at: Date | null;
  org_name: string; org_status: string; sub_status: string | null; current_period_start: Date | null; credits_per_month: number | null; plan_code: string | null;
  allowed_models: string[] | null; daily_credit_cap: number | null; monthly_credit_cap: number | null; per_request_credit_cap: number | null;
  free_requests_per_day: number | null;
};

/** The caller behind a bearer token, or null for an unknown, revoked or expired one. */
export async function resolveGatewayToken(q: Queryable, token: string, now: Date): Promise<GatewayCaller | null> {
  if (!GATEWAY_TOKEN_PATTERN.test(token)) return null;
  const { rows } = await q.query<CallerRow>(
    `SELECT t.id AS token_id, t.organization_id, t.instance_id, t.revoked_at, t.expires_at, o.name AS org_name, o.status AS org_status,
       s.status AS sub_status, s.current_period_start, s.credits_per_month, p.code AS plan_code, p.allowed_models,
       p.daily_credit_cap, p.monthly_credit_cap, p.per_request_credit_cap, p.free_requests_per_day
     FROM gateway_tokens t
     JOIN organizations o ON o.id = t.organization_id
     LEFT JOIN subscriptions s ON s.organization_id = o.id AND s.status <> 'canceled'
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE t.token_hash = $1`,
    [sha256Hex(token)]);
  const row = rows[0];
  if (!row || row.revoked_at || (row.expires_at && new Date(row.expires_at) <= now)) return null;
  return {
    tokenId: row.token_id,
    organizationId: row.organization_id,
    instanceId: row.instance_id,
    organizationName: row.org_name,
    organizationStatus: row.org_status,
    subscriptionStatus: row.sub_status,
    periodStart: row.current_period_start ? new Date(row.current_period_start) : null,
    creditsPerMonth: Number(row.credits_per_month ?? 0),
    planCode: row.plan_code,
    allowedModels: row.allowed_models ?? [],
    dailyCap: row.daily_credit_cap === null ? null : Number(row.daily_credit_cap),
    monthlyCap: row.monthly_credit_cap === null ? null : Number(row.monthly_credit_cap),
    perRequestCap: row.per_request_credit_cap === null ? null : Number(row.per_request_credit_cap),
    freeRequestsPerDay: Number(row.free_requests_per_day ?? 0),
  };
}

/** An empty list on the plan means every model in the price table; a free model also needs the plan's daily free requests. */
export function planAllows(caller: GatewayCaller, price: Pick<ModelPrice, "model" | "free">): boolean {
  if (price.free && caller.freeRequestsPerDay <= 0) return false;
  return caller.allowedModels.length === 0 || caller.allowedModels.includes(price.model);
}
