import { randomInt } from "node:crypto";
import { audit } from "../audit.ts";
import type { AppContext } from "../context.ts";
import type { Queryable } from "../db/db.ts";
import { otpEmail } from "../mail/mailer.ts";
import { hmacHex, randomToken, safeEqual, sha256Hex } from "../security/crypto.ts";
import { newTotpSecret, otpauthUri, verifyTotp } from "../security/totp.ts";
import { hit, LIMITS } from "./rate-limit.ts";

export const OTP_LENGTH = 8;
export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const SESSION_TTL_MS = 12 * 60 * 60_000;
export const MFA_PENDING_TTL_MS = 5 * 60_000;
export const SESSION_COOKIE = "arko_admin_session";

export type AdminRole = "owner" | "operator" | "viewer";

export interface AdminRow {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  status: "active" | "disabled";
  totp_secret_enc: string | null;
  totp_enabled_at: Date | null;
  totp_last_step: number | null;
}

export interface SessionAdmin {
  sessionId: string;
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  totpEnabled: boolean;
  mfaPending: boolean;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function otpHash(ctx: AppContext, adminId: string, code: string): string {
  return hmacHex(ctx.config.sessionSecret, `otp:${adminId}:${code}`);
}

export function generateOtp(): string {
  return Array.from({ length: OTP_LENGTH }, () => randomInt(10)).join("");
}

/**
 * Always resolves the same way whatever the address, so the response never says
 * whether an admin exists. A code is sent only to an active admin, within the
 * per-recipient and per-IP limits; a new code replaces the previous one.
 */
export async function requestOtp(ctx: AppContext, rawEmail: string, ip: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  const now = ctx.now();
  if (!(await hit(ctx.db, `otp-ip:${hmacHex(ctx.config.sessionSecret, ip)}`, LIMITS.otpRequestIp, now))) return;
  if (!(await hit(ctx.db, `otp-to:${hmacHex(ctx.config.sessionSecret, email)}`, LIMITS.otpRecipient, now))) return;
  const { rows } = await ctx.db.query<AdminRow>("SELECT * FROM admins WHERE email = $1 AND status = 'active'", [email]);
  const admin = rows[0];
  if (!admin) return;
  const code = generateOtp();
  await ctx.db.query(
    `INSERT INTO admin_otps (admin_id, code_hash, attempts, expires_at, created_at) VALUES ($1, $2, 0, $3, $4)
     ON CONFLICT (admin_id) DO UPDATE SET code_hash = excluded.code_hash, attempts = 0, expires_at = excluded.expires_at, created_at = excluded.created_at`,
    [admin.id, otpHash(ctx, admin.id, code), new Date(now.getTime() + OTP_TTL_MS), now],
  );
  await ctx.mailer.send(otpEmail(admin.email, code));
}

export type LoginResult =
  | { ok: true; token: string; mfaRequired: boolean }
  | { ok: false; reason: "rate_limited" | "invalid_code" };

async function createSession(q: Queryable, ctx: AppContext, adminId: string, mfaPending: boolean, ip: string, userAgent: string | null) {
  const token = randomToken(32);
  const now = ctx.now();
  await q.query(
    `INSERT INTO admin_sessions (admin_id, token_hash, mfa_pending, ip, user_agent, created_at, last_seen_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6, $7)`,
    [adminId, sha256Hex(token), mfaPending, ip, userAgent?.slice(0, 300) ?? null, now,
      new Date(now.getTime() + (mfaPending ? MFA_PENDING_TTL_MS : SESSION_TTL_MS))],
  );
  return token;
}

export async function verifyOtp(ctx: AppContext, rawEmail: string, rawCode: string, ip: string, userAgent: string | null): Promise<LoginResult> {
  const email = normalizeEmail(rawEmail);
  const code = rawCode.replace(/[\s-]/g, "");
  const now = ctx.now();
  if (!(await hit(ctx.db, `otp-verify-ip:${hmacHex(ctx.config.sessionSecret, ip)}`, LIMITS.otpVerifyIp, now))) {
    return { ok: false, reason: "rate_limited" };
  }
  return ctx.db.tx(async (q) => {
    const { rows } = await q.query<AdminRow & { code_hash: string; attempts: number; expires_at: Date }>(
      `SELECT a.*, o.code_hash, o.attempts, o.expires_at FROM admins a JOIN admin_otps o ON o.admin_id = a.id
       WHERE a.email = $1 AND a.status = 'active' FOR UPDATE OF o`,
      [email],
    );
    const row = rows[0];
    if (!row || row.expires_at.getTime() <= now.getTime() || row.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: "invalid_code" } as const;
    if (!/^\d{8}$/.test(code) || !safeEqual(row.code_hash, otpHash(ctx, row.id, code))) {
      await q.query("UPDATE admin_otps SET attempts = attempts + 1 WHERE admin_id = $1", [row.id]);
      return { ok: false, reason: "invalid_code" } as const;
    }
    await q.query("DELETE FROM admin_otps WHERE admin_id = $1", [row.id]);
    const mfaRequired = row.totp_enabled_at !== null;
    const token = await createSession(q, ctx, row.id, mfaRequired, ip, userAgent);
    if (!mfaRequired) {
      await q.query("UPDATE admins SET last_login_at = $2 WHERE id = $1", [row.id, now]);
      await audit(q, { type: "admin", id: row.id, label: row.email, ip }, { action: "admin.login", targetType: "admin", targetId: row.id });
    }
    return { ok: true, token, mfaRequired } as const;
  });
}

/** Completes a login whose session waits for the authenticator code; the pending session is replaced by a full one. */
export async function verifyTotpLogin(ctx: AppContext, pendingToken: string, code: string, ip: string, userAgent: string | null): Promise<LoginResult> {
  const now = ctx.now();
  if (!(await hit(ctx.db, `totp-ip:${hmacHex(ctx.config.sessionSecret, ip)}`, LIMITS.totpVerifyIp, now))) return { ok: false, reason: "rate_limited" };
  return ctx.db.tx(async (q) => {
    const { rows } = await q.query<AdminRow & { session_id: string }>(
      `SELECT a.*, s.id AS session_id FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
       WHERE s.token_hash = $1 AND s.mfa_pending AND s.revoked_at IS NULL AND s.expires_at > $2 AND a.status = 'active'
       FOR UPDATE OF a`,
      [sha256Hex(pendingToken), now],
    );
    const row = rows[0];
    if (!row?.totp_secret_enc) return { ok: false, reason: "invalid_code" } as const;
    const secret = ctx.box.decrypt(row.totp_secret_enc, `admins.totp:${row.id}`);
    const step = verifyTotp(secret, code.trim(), now, row.totp_last_step);
    if (step === null) return { ok: false, reason: "invalid_code" } as const;
    await q.query("UPDATE admins SET totp_last_step = $2, last_login_at = $3 WHERE id = $1", [row.id, step, now]);
    await q.query("UPDATE admin_sessions SET revoked_at = $2 WHERE id = $1", [row.session_id, now]);
    const token = await createSession(q, ctx, row.id, false, ip, userAgent);
    await audit(q, { type: "admin", id: row.id, label: row.email, ip }, { action: "admin.login", targetType: "admin", targetId: row.id, data: { mfa: "totp" } });
    return { ok: true, token, mfaRequired: false } as const;
  });
}

/** The session behind a cookie token, sliding its expiry forward. Pending (MFA) sessions come back with `mfaPending`. */
export async function sessionFor(ctx: AppContext, token: string | undefined): Promise<SessionAdmin | null> {
  if (!token || token.length > 200) return null;
  const now = ctx.now();
  const { rows } = await ctx.db.query<AdminRow & { session_id: string; mfa_pending: boolean; last_seen_at: Date }>(
    `SELECT a.*, s.id AS session_id, s.mfa_pending, s.last_seen_at FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > $2 AND a.status = 'active'`,
    [sha256Hex(token), now],
  );
  const row = rows[0];
  if (!row) return null;
  if (!row.mfa_pending && now.getTime() - row.last_seen_at.getTime() > 60_000) {
    await ctx.db.query("UPDATE admin_sessions SET last_seen_at = $2, expires_at = $3 WHERE id = $1",
      [row.session_id, now, new Date(now.getTime() + SESSION_TTL_MS)]);
  }
  return {
    sessionId: row.session_id, id: row.id, email: row.email, name: row.name, role: row.role,
    totpEnabled: row.totp_enabled_at !== null, mfaPending: row.mfa_pending,
  };
}

export async function revokeSession(ctx: AppContext, sessionId: string): Promise<void> {
  await ctx.db.query("UPDATE admin_sessions SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL", [sessionId, ctx.now()]);
}

/** Starts authenticator setup: a new secret is stored (not yet enabled) and returned once for the QR code. */
export async function beginTotpSetup(ctx: AppContext, admin: SessionAdmin): Promise<{ secret: string; uri: string }> {
  if (admin.totpEnabled) throw new Error("O segundo fator já está ativo");
  const secret = newTotpSecret();
  await ctx.db.query("UPDATE admins SET totp_secret_enc = $2, totp_last_step = NULL WHERE id = $1",
    [admin.id, ctx.box.encrypt(secret, `admins.totp:${admin.id}`)]);
  return { secret, uri: otpauthUri(secret, admin.email) };
}

async function checkOwnTotp(q: Queryable, ctx: AppContext, adminId: string, code: string): Promise<number | null> {
  const { rows } = await q.query<AdminRow>("SELECT * FROM admins WHERE id = $1 FOR UPDATE", [adminId]);
  const row = rows[0];
  if (!row?.totp_secret_enc) return null;
  const secret = ctx.box.decrypt(row.totp_secret_enc, `admins.totp:${row.id}`);
  const step = verifyTotp(secret, code.trim(), ctx.now(), row.totp_last_step);
  if (step !== null) await q.query("UPDATE admins SET totp_last_step = $2 WHERE id = $1", [adminId, step]);
  return step;
}

export async function enableTotp(ctx: AppContext, admin: SessionAdmin, code: string, ip: string): Promise<boolean> {
  return ctx.db.tx(async (q) => {
    if ((await checkOwnTotp(q, ctx, admin.id, code)) === null) return false;
    await q.query("UPDATE admins SET totp_enabled_at = $2 WHERE id = $1", [admin.id, ctx.now()]);
    await audit(q, { type: "admin", id: admin.id, label: admin.email, ip }, { action: "admin.totp_enabled", targetType: "admin", targetId: admin.id });
    return true;
  });
}

export async function disableTotp(ctx: AppContext, admin: SessionAdmin, code: string, ip: string): Promise<boolean> {
  return ctx.db.tx(async (q) => {
    if ((await checkOwnTotp(q, ctx, admin.id, code)) === null) return false;
    await q.query("UPDATE admins SET totp_enabled_at = NULL, totp_secret_enc = NULL, totp_last_step = NULL WHERE id = $1", [admin.id]);
    await audit(q, { type: "admin", id: admin.id, label: admin.email, ip }, { action: "admin.totp_disabled", targetType: "admin", targetId: admin.id });
    return true;
  });
}

export async function createAdmin(q: Queryable, email: string, name: string, role: AdminRole, actorLabel: string): Promise<{ id: string; created: boolean }> {
  const normalized = normalizeEmail(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw new Error("E-mail inválido");
  const existing = (await q.query<{ id: string; status: string }>("SELECT id, status FROM admins WHERE email = $1 FOR UPDATE", [normalized])).rows[0];
  if (existing?.status === "active") return { id: existing.id, created: false };
  const { rows } = await q.query<{ id: string }>(
    `INSERT INTO admins (email, name, role) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET status = 'active'
     RETURNING id`,
    [normalized, name, role],
  );
  const id = rows[0]!.id;
  await audit(q, { type: "cli", label: actorLabel }, {
    action: existing ? "admin.reactivated" : "admin.created", targetType: "admin", targetId: id, data: { email: normalized, role },
  });
  return { id, created: !existing };
}
