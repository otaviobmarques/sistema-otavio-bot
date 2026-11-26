import type { Queryable } from "../db/db.ts";

export interface Limit {
  windowMs: number;
  max: number;
}

export const LIMITS = {
  /** Same as the control plane's per-recipient OTP limit: 3 codes per address every 15 minutes. */
  otpRecipient: { windowMs: 15 * 60_000, max: 3 },
  otpRequestIp: { windowMs: 60_000, max: 5 },
  otpVerifyIp: { windowMs: 60_000, max: 10 },
  totpVerifyIp: { windowMs: 60_000, max: 10 },
  bugReportIp: { windowMs: 60 * 60_000, max: 20 },
  bugReportStatusIp: { windowMs: 60 * 60_000, max: 120 },
} satisfies Record<string, Limit>;

const RETENTION_MS = 24 * 60 * 60_000;

/**
 * Counts one attempt against `key` and says whether it is allowed. One upsert:
 * the window restarts once it has passed, and a full window refuses without
 * writing (the control plane's otp_recipient_rate_limits statement).
 */
export async function hit(q: Queryable, key: string, limit: Limit, now: Date): Promise<boolean> {
  const cutoff = new Date(now.getTime() - limit.windowMs);
  const result = await q.query(
    `INSERT INTO rate_limits (key, window_started_at, attempts, updated_at)
     VALUES ($1, $2, 1, $2)
     ON CONFLICT (key) DO UPDATE SET
       window_started_at = CASE WHEN rate_limits.window_started_at <= $3 THEN excluded.window_started_at ELSE rate_limits.window_started_at END,
       attempts = CASE WHEN rate_limits.window_started_at <= $3 THEN 1 ELSE rate_limits.attempts + 1 END,
       updated_at = excluded.updated_at
     WHERE rate_limits.window_started_at <= $3 OR rate_limits.attempts < $4`,
    [key, now, cutoff, limit.max],
  );
  return result.rowCount > 0;
}

export async function sweepRateLimits(q: Queryable, now: Date): Promise<void> {
  await q.query("DELETE FROM rate_limits WHERE updated_at < $1", [new Date(now.getTime() - RETENTION_MS)]);
}
