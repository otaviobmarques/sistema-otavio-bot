import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import {
  MFA_PENDING_TTL_MS, requestOtp, revokeSession, SESSION_COOKIE, SESSION_TTL_MS, sessionFor, verifyOtp, verifyTotpLogin,
} from "../../auth/auth.ts";
import type { AppContext } from "../../context.ts";
import { body, router, type Ctx } from "../http.ts";

const emailSchema = z.object({ email: z.string().trim().min(3).max(254) });
const verifySchema = z.object({ email: z.string().trim().min(3).max(254), code: z.string().trim().min(6).max(12) });
const totpSchema = z.object({ code: z.string().trim().min(6).max(8) });

function setSession(c: Ctx, ctx: AppContext, token: string, pending: boolean) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true, secure: ctx.config.cookieSecure, sameSite: "Strict", path: "/",
    maxAge: Math.floor((pending ? MFA_PENDING_TTL_MS : SESSION_TTL_MS) / 1000),
  });
}

export function authRoutes(ctx: AppContext) {
  const app = router();

  app.post("/otp/request", async (c) => {
    const { email } = await body(c, emailSchema);
    await requestOtp(ctx, email, c.get("ip"));
    return c.json({ ok: true, message: "Se este e-mail for de um administrador, um código foi enviado." });
  });

  app.post("/otp/verify", async (c) => {
    const { email, code } = await body(c, verifySchema);
    const result = await verifyOtp(ctx, email, code, c.get("ip"), c.req.header("user-agent") ?? null);
    if (!result.ok) {
      return c.json({ error: result.reason === "rate_limited" ? "Muitas tentativas. Aguarde um minuto." : "Código inválido ou expirado." },
        result.reason === "rate_limited" ? 429 : 401);
    }
    setSession(c, ctx, result.token, result.mfaRequired);
    return c.json({ ok: true, mfaRequired: result.mfaRequired });
  });

  app.post("/totp/verify", async (c) => {
    const { code } = await body(c, totpSchema);
    const token = getCookie(c, SESSION_COOKIE);
    if (!token) return c.json({ error: "Sessão expirada. Entre de novo." }, 401);
    const result = await verifyTotpLogin(ctx, token, code, c.get("ip"), c.req.header("user-agent") ?? null);
    if (!result.ok) {
      return c.json({ error: result.reason === "rate_limited" ? "Muitas tentativas. Aguarde um minuto." : "Código do autenticador inválido." },
        result.reason === "rate_limited" ? 429 : 401);
    }
    setSession(c, ctx, result.token, false);
    return c.json({ ok: true });
  });

  app.post("/logout", async (c) => {
    const session = await sessionFor(ctx, getCookie(c, SESSION_COOKIE));
    if (session) await revokeSession(ctx, session.sessionId);
    deleteCookie(c, SESSION_COOKIE, { path: "/", secure: ctx.config.cookieSecure });
    return c.json({ ok: true });
  });

  app.get("/session", async (c) => {
    const session = await sessionFor(ctx, getCookie(c, SESSION_COOKIE));
    if (!session) return c.json({ authenticated: false });
    if (session.mfaPending) return c.json({ authenticated: false, mfaPending: true });
    return c.json({ authenticated: true, admin: { id: session.id, email: session.email, name: session.name, role: session.role, totpEnabled: session.totpEnabled } });
  });

  return app;
}
