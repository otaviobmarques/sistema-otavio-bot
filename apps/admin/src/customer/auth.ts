import { audit } from "../audit.ts";
import { generateOtp, normalizeEmail, OTP_MAX_ATTEMPTS, OTP_TTL_MS } from "../auth/auth.ts";
import { hit, LIMITS } from "../auth/rate-limit.ts";
import type { AppContext } from "../context.ts";
import { customerOtpEmail } from "../mail/mailer.ts";
import { hmacHex, randomToken, safeEqual, sha256Hex } from "../security/crypto.ts";

// Customer login mirrors the admin's (src/auth/auth.ts): an 8-digit code by e-mail, stored as an HMAC,
// 10 minutes and 5 attempts, the same rate limits (in their own buckets), and a random session token
// whose hash is all the database keeps. The differences: anyone may ask for a code (that is the signup),
// the account is created only when the code checks out, and there is no second factor.

export const CUSTOMER_COOKIE = "arko_conta_session";
/** Sliding: a week without use signs the customer out. */
export const CUSTOMER_SESSION_TTL_MS = 7 * 24 * 60 * 60_000;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface SessionCustomer {
  sessionId: string;
  accountId: string;
  email: string;
  name: string;
  phone: string | null;
}

function otpHash(ctx: AppContext, email: string, code: string): string {
  return hmacHex(ctx.config.sessionSecret, `conta-otp:${email}:${code}`);
}

export function validEmail(raw: string): string | null {
  const email = normalizeEmail(raw);
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

/**
 * Always resolves the same way, so the response never says whether the address has an account.
 * Within the per-IP and per-recipient limits a code is sent; a new code replaces the previous one.
 */
export async function requestCustomerOtp(ctx: AppContext, rawEmail: string, ip: string): Promise<void> {
  const email = validEmail(rawEmail);
  if (!email) return;
  const now = ctx.now();
  if (!(await hit(ctx.db, `conta-otp-ip:${hmacHex(ctx.config.sessionSecret, ip)}`, LIMITS.otpRequestIp, now))) return;
  if (!(await hit(ctx.db, `conta-otp-to:${hmacHex(ctx.config.sessionSecret, email)}`, LIMITS.otpRecipient, now))) return;
  const code = generateOtp();
  await ctx.db.query(
    `INSERT INTO account_otps (email, code_hash, attempts, expires_at, created_at) VALUES ($1, $2, 0, $3, $4)
     ON CONFLICT (email) DO UPDATE SET code_hash = excluded.code_hash, attempts = 0, expires_at = excluded.expires_at, created_at = excluded.created_at`,
    [email, otpHash(ctx, email, code), new Date(now.getTime() + OTP_TTL_MS), now],
  );
  await ctx.mailer.send({ ...customerOtpEmail(email, code), from: ctx.config.customerMailFrom });
}

export type CustomerLoginResult =
  | { ok: true; token: string; created: boolean }
  | { ok: false; reason: "rate_limited" | "invalid_code" };

export async function verifyCustomerOtp(ctx: AppContext, rawEmail: string, rawCode: string, ip: string, userAgent: string | null): Promise<CustomerLoginResult> {
  const email = validEmail(rawEmail);
  const code = rawCode.replace(/[\s-]/g, "");
  const now = ctx.now();
  if (!(await hit(ctx.db, `conta-otp-verify-ip:${hmacHex(ctx.config.sessionSecret, ip)}`, LIMITS.otpVerifyIp, now))) {
    return { ok: false, reason: "rate_limited" };
  }
  if (!email) return { ok: false, reason: "invalid_code" };
  const result = await ctx.db.tx(async (q) => {
    const { rows } = await q.query<{ code_hash: string; attempts: number; expires_at: Date }>(
      "SELECT code_hash, attempts, expires_at FROM account_otps WHERE email = $1 FOR UPDATE", [email]);
    const row = rows[0];
    if (!row || row.expires_at.getTime() <= now.getTime() || row.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: "invalid_code" } as const;
    if (!/^\d{8}$/.test(code) || !safeEqual(row.code_hash, otpHash(ctx, email, code))) {
      await q.query("UPDATE account_otps SET attempts = attempts + 1 WHERE email = $1", [email]);
      return { ok: false, reason: "invalid_code" } as const;
    }
    await q.query("DELETE FROM account_otps WHERE email = $1", [email]);
    const inserted = await q.query<{ id: string }>(
      "INSERT INTO accounts (email) VALUES ($1) ON CONFLICT (email) DO NOTHING RETURNING id", [email]);
    const created = inserted.rows.length > 0;
    const accountId = inserted.rows[0]?.id
      ?? (await q.query<{ id: string }>("SELECT id FROM accounts WHERE email = $1", [email])).rows[0]!.id;
    const token = randomToken(32);
    await q.query(
      `INSERT INTO account_sessions (account_id, token_hash, ip, user_agent, created_at, last_seen_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $5, $6)`,
      [accountId, sha256Hex(token), ip, userAgent?.slice(0, 300) ?? null, now, new Date(now.getTime() + CUSTOMER_SESSION_TTL_MS)],
    );
    await audit(q, { type: "customer", id: accountId, label: email, ip }, {
      action: created ? "account.signed_up" : "account.login", targetType: "account", targetId: accountId,
    });
    return { ok: true, token, created } as const;
  });
  return result;
}

/** The customer behind a cookie token, sliding its expiry forward. */
export async function customerSessionFor(ctx: AppContext, token: string | undefined): Promise<SessionCustomer | null> {
  if (!token || token.length > 200) return null;
  const now = ctx.now();
  const { rows } = await ctx.db.query<{ session_id: string; last_seen_at: Date; id: string; email: string; name: string; phone: string | null }>(
    `SELECT s.id AS session_id, s.last_seen_at, a.id, a.email, a.name, a.phone FROM account_sessions s JOIN accounts a ON a.id = s.account_id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > $2`,
    [sha256Hex(token), now],
  );
  const row = rows[0];
  if (!row) return null;
  if (now.getTime() - row.last_seen_at.getTime() > 60_000) {
    await ctx.db.query("UPDATE account_sessions SET last_seen_at = $2, expires_at = $3 WHERE id = $1",
      [row.session_id, now, new Date(now.getTime() + CUSTOMER_SESSION_TTL_MS)]);
  }
  return { sessionId: row.session_id, accountId: row.id, email: row.email, name: row.name, phone: row.phone };
}

export async function revokeCustomerSession(ctx: AppContext, sessionId: string): Promise<void> {
  await ctx.db.query("UPDATE account_sessions SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL", [sessionId, ctx.now()]);
}
