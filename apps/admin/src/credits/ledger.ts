import type { Queryable } from "../db/db.ts";

export type Bucket = "plan" | "extra";
export type LedgerKind = "plan_grant" | "plan_expire" | "purchase" | "admin_adjust" | "refund_reversal" | "chargeback_reversal" | "usage";

export interface LedgerInput {
  organizationId: string;
  bucket: Bucket;
  kind: LedgerKind;
  amount: number;
  /** Unique per business fact (e.g. "payment:pay_123:grant"). A second post with the same reference changes nothing. */
  externalReference: string;
  billingAccountId?: string | null;
  paymentId?: string | null;
  adminId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

export interface LedgerPost {
  applied: boolean;
  balanceAfter: number;
}

export class InsufficientCreditsError extends Error {}

export interface Wallet {
  plan: number;
  extra: number;
}

export async function lockWallet(q: Queryable, organizationId: string): Promise<Wallet> {
  await q.query("INSERT INTO credit_wallets (organization_id) VALUES ($1) ON CONFLICT (organization_id) DO NOTHING", [organizationId]);
  const { rows } = await q.query<{ plan_balance: number; extra_balance: number }>(
    "SELECT plan_balance, extra_balance FROM credit_wallets WHERE organization_id = $1 FOR UPDATE",
    [organizationId],
  );
  return { plan: Number(rows[0]!.plan_balance), extra: Number(rows[0]!.extra_balance) };
}

/**
 * Posts one immutable ledger row and moves the wallet with it, inside the
 * caller's transaction. Idempotent by external_reference: the wallet row lock
 * serialises posts for one organisation, and the unique reference turns a
 * replay into a no-op that reports the earlier balance.
 */
export async function postLedger(q: Queryable, input: LedgerInput): Promise<LedgerPost> {
  if (!Number.isInteger(input.amount) || input.amount === 0) throw new Error("Lançamento de créditos precisa de um valor inteiro diferente de zero");
  const wallet = await lockWallet(q, input.organizationId);
  const existing = await q.query<{ balance_after: number }>("SELECT balance_after FROM credit_ledger WHERE external_reference = $1", [input.externalReference]);
  if (existing.rows[0]) return { applied: false, balanceAfter: Number(existing.rows[0].balance_after) };
  const current = input.bucket === "plan" ? wallet.plan : wallet.extra;
  const balanceAfter = current + input.amount;
  if (balanceAfter < 0) throw new InsufficientCreditsError(`Saldo insuficiente: ${current} créditos (${input.bucket === "plan" ? "do plano" : "avulsos"})`);
  const inserted = await q.query(
    `INSERT INTO credit_ledger (organization_id, billing_account_id, payment_id, admin_id, bucket, kind, amount, balance_after, external_reference, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (external_reference) DO NOTHING`,
    [
      input.organizationId, input.billingAccountId ?? null, input.paymentId ?? null, input.adminId ?? null, input.bucket, input.kind,
      input.amount, balanceAfter, input.externalReference, input.reason ?? null, JSON.stringify(input.metadata ?? {}),
    ],
  );
  if (inserted.rowCount === 0) {
    const again = await q.query<{ balance_after: number }>("SELECT balance_after FROM credit_ledger WHERE external_reference = $1", [input.externalReference]);
    return { applied: false, balanceAfter: Number(again.rows[0]?.balance_after ?? current) };
  }
  await q.query(
    `UPDATE credit_wallets SET ${input.bucket === "plan" ? "plan_balance" : "extra_balance"} = $2, updated_at = now() WHERE organization_id = $1`,
    [input.organizationId, balanceAfter],
  );
  return { applied: true, balanceAfter };
}

/**
 * The monthly plan quota: what is left of the previous period's plan credits
 * expires and the bucket is set to the new quota. Purchased (extra) credits
 * are untouched. Both rows share the period's reference prefix.
 */
export async function grantPlanPeriod(
  q: Queryable,
  input: { organizationId: string; quota: number; reference: string; billingAccountId?: string | null; paymentId?: string | null; metadata?: Record<string, unknown> },
): Promise<boolean> {
  const wallet = await lockWallet(q, input.organizationId);
  const already = await q.query("SELECT 1 FROM credit_ledger WHERE external_reference = $1", [`${input.reference}:grant`]);
  if (already.rows.length > 0) return false;
  if (wallet.plan > 0) {
    await postLedger(q, {
      organizationId: input.organizationId, bucket: "plan", kind: "plan_expire", amount: -wallet.plan,
      externalReference: `${input.reference}:expire`, billingAccountId: input.billingAccountId, paymentId: input.paymentId,
      reason: "Créditos do período anterior expirados na renovação", metadata: input.metadata,
    });
  }
  if (input.quota > 0) {
    await postLedger(q, {
      organizationId: input.organizationId, bucket: "plan", kind: "plan_grant", amount: input.quota,
      externalReference: `${input.reference}:grant`, billingAccountId: input.billingAccountId, paymentId: input.paymentId,
      reason: "Cota mensal do plano", metadata: input.metadata,
    });
    return true;
  }
  return false;
}

/** Takes back what a payment granted, as far as the bucket still holds it (credits already spent stay spent). */
export async function reversePaymentCredits(
  q: Queryable,
  input: { organizationId: string; paymentId: string; kind: "refund_reversal" | "chargeback_reversal"; reference: string; billingAccountId: string; reason: string },
): Promise<number> {
  const { rows } = await q.query<{ bucket: Bucket; granted: number }>(
    `SELECT bucket, SUM(amount)::bigint AS granted FROM credit_ledger
     WHERE payment_id = $1 AND kind IN ('plan_grant', 'purchase') GROUP BY bucket`,
    [input.paymentId],
  );
  let reversed = 0;
  for (const row of rows) {
    const wallet = await lockWallet(q, input.organizationId);
    const available = row.bucket === "plan" ? wallet.plan : wallet.extra;
    const amount = Math.min(Number(row.granted), available);
    if (amount <= 0) continue;
    const post = await postLedger(q, {
      organizationId: input.organizationId, bucket: row.bucket, kind: input.kind, amount: -amount,
      externalReference: `${input.reference}:${row.bucket}`, billingAccountId: input.billingAccountId, paymentId: input.paymentId, reason: input.reason,
    });
    if (post.applied) reversed += amount;
  }
  return reversed;
}
