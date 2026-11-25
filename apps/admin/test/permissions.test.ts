import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomToken, sha256Hex } from "../src/security/crypto.ts";
import { client, insertAdmin, sessionCookie, testContext, type TestContext } from "./helpers.ts";

const READ_ROUTES = [
  "/api/overview", "/api/clients", "/api/plans", "/api/billing/accounts", "/api/billing/subscriptions", "/api/billing/payments",
  "/api/billing/delinquent", "/api/billing/events", "/api/integrations", "/api/audit", "/api/me/sessions",
];

describe("só administradores acessam o painel", () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await testContext();
  });
  afterAll(() => ctx.db.close());

  it.each(READ_ROUTES)("refuses %s without a session", async (path) => {
    expect((await client(ctx).get(path)).status).toBe(401);
  });

  it("refuses writes without a session", async () => {
    const api = client(ctx);
    expect((await api.post("/api/clients", { name: "X" })).status).toBe(401);
    expect((await api.post("/api/plans", {})).status).toBe(401);
    expect((await api.post("/api/billing/accounts", {})).status).toBe(401);
  });

  it("refuses a forged, expired or revoked session cookie", async () => {
    expect((await client(ctx, "arko_admin_session=forjado").get("/api/overview")).status).toBe(401);
    const id = await insertAdmin(ctx, "expirado@domma.com.br");
    const expired = randomToken();
    await ctx.db.query("INSERT INTO admin_sessions (admin_id, token_hash, expires_at) VALUES ($1, $2, $3)", [id, sha256Hex(expired), new Date(ctx.now().getTime() - 1000)]);
    expect((await client(ctx, `arko_admin_session=${expired}`).get("/api/overview")).status).toBe(401);
    const cookie = await sessionCookie(ctx, "owner");
    expect((await client(ctx, cookie).get("/api/overview")).status).toBe(200);
    await ctx.db.query("UPDATE admin_sessions SET revoked_at = now() WHERE token_hash = $1", [sha256Hex(cookie.split("=")[1]!)]);
    expect((await client(ctx, cookie).get("/api/overview")).status).toBe(401);
  });

  it("a disabled admin's session stops working at once", async () => {
    const cookie = await sessionCookie(ctx, "operator", "sai@domma.com.br");
    expect((await client(ctx, cookie).get("/api/overview")).status).toBe(200);
    await ctx.db.query("UPDATE admins SET status = 'disabled' WHERE email = 'sai@domma.com.br'");
    expect((await client(ctx, cookie).get("/api/overview")).status).toBe(401);
  });

  it("a read-only (viewer) admin reads but cannot change anything", async () => {
    const viewer = client(ctx, await sessionCookie(ctx, "viewer"));
    for (const path of READ_ROUTES) expect((await viewer.get(path)).status, path).toBe(200);
    expect((await viewer.post("/api/clients", { name: "Teste" })).status).toBe(403);
    expect((await viewer.post("/api/billing/accounts", {})).status).toBe(403);
    expect((await viewer.put("/api/plans/00000000-0000-4000-8000-000000000000", {})).status).toBe(403);
  });

  it("refuses writes from another origin even with a valid session", async () => {
    const cookie = await sessionCookie(ctx, "owner");
    const response = await client(ctx, cookie).post("/api/clients", { name: "X" }, { origin: "https://evil.example" });
    expect(response.status).toBe(403);
  });

  it("the cron endpoint needs its secret", async () => {
    expect((await client(ctx).get("/api/cron/tick")).status).toBe(401);
    expect((await client(ctx).get("/api/cron/tick", { authorization: "Bearer errado" })).status).toBe(401);
    const ok = await client(ctx).get("/api/cron/tick", { authorization: `Bearer ${ctx.config.cronSecret}` });
    expect(ok.status).toBe(200);
    expect(ok.data.jobs).toBeDefined();
  });

  it("API responses are not cached and the page cannot be framed", async () => {
    const response = await client(ctx).get("/api/overview");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });
});
