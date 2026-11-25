import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAdmin, OTP_MAX_ATTEMPTS } from "../src/auth/auth.ts";
import { base32Decode, currentStep, totpAt } from "../src/security/totp.ts";
import { advance, client, insertAdmin, testContext, type TestContext } from "./helpers.ts";

function codeFrom(ctx: TestContext): string {
  const last = ctx.mailer.sent.at(-1);
  const match = last?.text.match(/(\d{4})-(\d{4})/);
  if (!match) throw new Error("nenhum código enviado");
  return `${match[1]}${match[2]}`;
}

function cookieFrom(headers: Headers): string {
  const raw = headers.get("set-cookie") ?? "";
  return raw.split(";")[0]!;
}

describe("login do administrador por e-mail + código", () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await testContext();
    await insertAdmin(ctx, "dono@domma.com.br");
  });
  afterEach(() => ctx.db.close());

  it("sends an 8-digit code to an admin and signs in with it", async () => {
    const api = client(ctx);
    const requested = await api.post("/api/auth/otp/request", { email: "Dono@Domma.com.br " });
    expect(requested.status).toBe(200);
    expect(ctx.mailer.sent).toHaveLength(1);
    expect(ctx.mailer.sent[0]!.to).toBe("dono@domma.com.br");
    const stored = await ctx.db.query<{ code_hash: string }>("SELECT code_hash FROM admin_otps");
    expect(stored.rows[0]!.code_hash).not.toContain(codeFrom(ctx));

    const verified = await api.post("/api/auth/otp/verify", { email: "dono@domma.com.br", code: codeFrom(ctx) });
    expect(verified.status).toBe(200);
    expect(verified.data.mfaRequired).toBe(false);
    const setCookie = verified.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);

    const session = await client(ctx, cookieFrom(verified.headers)).get("/api/auth/session");
    expect(session.data).toMatchObject({ authenticated: true, admin: { email: "dono@domma.com.br", role: "owner" } });
    const audit = await ctx.db.query("SELECT action FROM audit_log WHERE action = 'admin.login'");
    expect(audit.rows).toHaveLength(1);
  });

  it("answers the same for an unknown address and sends nothing", async () => {
    const response = await client(ctx).post("/api/auth/otp/request", { email: "intruso@exemplo.com" });
    expect(response.status).toBe(200);
    expect(response.data.ok).toBe(true);
    expect(ctx.mailer.sent).toHaveLength(0);
  });

  it("limits codes per recipient to 3 every 15 minutes, silently", async () => {
    for (let i = 0; i < 5; i++) {
      const response = await client(ctx, undefined, `198.51.100.${i}`).post("/api/auth/otp/request", { email: "dono@domma.com.br" });
      expect(response.status).toBe(200);
    }
    expect(ctx.mailer.sent).toHaveLength(3);
    advance(ctx, 15 * 60_000 + 1);
    await client(ctx, undefined, "198.51.100.99").post("/api/auth/otp/request", { email: "dono@domma.com.br" });
    expect(ctx.mailer.sent).toHaveLength(4);
  });

  it("limits code requests per IP", async () => {
    await insertAdmin(ctx, "outro@domma.com.br");
    for (let i = 0; i < 7; i++) await client(ctx).post("/api/auth/otp/request", { email: i % 2 ? "dono@domma.com.br" : "outro@domma.com.br" });
    expect(ctx.mailer.sent).toHaveLength(5);
  });

  it("a new code replaces the previous one", async () => {
    const api = client(ctx);
    await api.post("/api/auth/otp/request", { email: "dono@domma.com.br" });
    const first = codeFrom(ctx);
    await api.post("/api/auth/otp/request", { email: "dono@domma.com.br" });
    const second = codeFrom(ctx);
    if (first !== second) expect((await api.post("/api/auth/otp/verify", { email: "dono@domma.com.br", code: first })).status).toBe(401);
    expect((await api.post("/api/auth/otp/verify", { email: "dono@domma.com.br", code: second })).status).toBe(200);
  });

  it("burns the code after 5 wrong attempts and expires it after 10 minutes", async () => {
    const api = client(ctx);
    await api.post("/api/auth/otp/request", { email: "dono@domma.com.br" });
    const code = codeFrom(ctx);
    const wrong = code === "00000000" ? "11111111" : "00000000";
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      expect((await api.post("/api/auth/otp/verify", { email: "dono@domma.com.br", code: wrong })).status).toBe(401);
    }
    expect((await api.post("/api/auth/otp/verify", { email: "dono@domma.com.br", code })).status).toBe(401);

    advance(ctx, 16 * 60_000);
    await api.post("/api/auth/otp/request", { email: "dono@domma.com.br" });
    const fresh = codeFrom(ctx);
    advance(ctx, 10 * 60_000 + 1);
    expect((await api.post("/api/auth/otp/verify", { email: "dono@domma.com.br", code: fresh })).status).toBe(401);
  });

  it("limits code checks per IP", async () => {
    const api = client(ctx, undefined, "192.0.2.50");
    let limited = false;
    for (let i = 0; i < 12; i++) {
      const response = await api.post("/api/auth/otp/verify", { email: "dono@domma.com.br", code: "12345678" });
      if (response.status === 429) limited = true;
    }
    expect(limited).toBe(true);
  });

  it("a disabled admin cannot sign in", async () => {
    await ctx.db.query("UPDATE admins SET status = 'disabled'");
    await client(ctx).post("/api/auth/otp/request", { email: "dono@domma.com.br" });
    expect(ctx.mailer.sent).toHaveLength(0);
  });

  it("with the second factor on, the code alone gives only a pending session", async () => {
    const api = client(ctx);
    await api.post("/api/auth/otp/request", { email: "dono@domma.com.br" });
    const login = await api.post("/api/auth/otp/verify", { email: "dono@domma.com.br", code: codeFrom(ctx) });
    const authed = client(ctx, cookieFrom(login.headers));

    const setup = await authed.post("/api/me/totp/setup");
    expect(setup.status).toBe(200);
    expect(setup.data.qr).toMatch(/^data:image\/png;base64,/);
    const secret: string = setup.data.secret;
    expect(base32Decode(secret)).toHaveLength(20);
    expect((await authed.post("/api/me/totp/enable", { code: "000000" })).status).toBe(400);
    expect((await authed.post("/api/me/totp/enable", { code: totpAt(secret, currentStep(ctx.now())) })).status).toBe(200);

    advance(ctx, 16 * 60_000);
    await api.post("/api/auth/otp/request", { email: "dono@domma.com.br" });
    const second = await api.post("/api/auth/otp/verify", { email: "dono@domma.com.br", code: codeFrom(ctx) });
    expect(second.data.mfaRequired).toBe(true);
    const pending = client(ctx, cookieFrom(second.headers));
    expect((await pending.get("/api/overview")).status).toBe(401);
    expect((await pending.get("/api/auth/session")).data).toEqual({ authenticated: false, mfaPending: true });

    expect((await pending.post("/api/auth/totp/verify", { code: "000000" })).status).toBe(401);
    const done = await pending.post("/api/auth/totp/verify", { code: totpAt(secret, currentStep(ctx.now()) + 1) });
    expect(done.status).toBe(200);
    expect((await client(ctx, cookieFrom(done.headers)).get("/api/overview")).status).toBe(200);
    // the pending cookie is spent
    expect((await pending.post("/api/auth/totp/verify", { code: totpAt(secret, currentStep(ctx.now()) + 1) })).status).toBe(401);
  });

  it("the CLI creates the first admin once, with an audit row", async () => {
    const first = await ctx.db.tx((q) => createAdmin(q, " Novo@Domma.com.br", "Novo", "owner", "cli:teste"));
    expect(first.created).toBe(true);
    const again = await ctx.db.tx((q) => createAdmin(q, "novo@domma.com.br", "Novo", "owner", "cli:teste"));
    expect(again).toEqual({ id: first.id, created: false });
    const audit = await ctx.db.query("SELECT action, actor_type FROM audit_log WHERE target_id = $1", [first.id]);
    expect(audit.rows).toEqual([{ action: "admin.created", actor_type: "cli" }]);
    await expect(ctx.db.tx((q) => createAdmin(q, "sem-arroba", "", "owner", "cli"))).rejects.toThrow(/inválido/);
  });

  it("logout revokes the session", async () => {
    const api = client(ctx);
    await api.post("/api/auth/otp/request", { email: "dono@domma.com.br" });
    const login = await api.post("/api/auth/otp/verify", { email: "dono@domma.com.br", code: codeFrom(ctx) });
    const authed = client(ctx, cookieFrom(login.headers));
    expect((await authed.get("/api/overview")).status).toBe(200);
    await authed.post("/api/auth/logout");
    expect((await authed.get("/api/overview")).status).toBe(401);
  });
});
