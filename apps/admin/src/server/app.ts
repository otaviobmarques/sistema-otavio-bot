import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { SESSION_COOKIE, sessionFor, type AdminRole } from "../auth/auth.ts";
import { ingestAsaasWebhook } from "../billing/webhooks.ts";
import type { AppContext } from "../context.ts";
import { DomainError } from "../domain/lifecycle.ts";
import { JOB_HANDLERS, tick } from "../jobs/handlers.ts";
import { runJobs } from "../jobs/queue.ts";
import { safeEqual } from "../security/crypto.ts";
import type { Ctx, Env } from "./http.ts";
import { authRoutes } from "./routes/auth.ts";
import { billingRoutes } from "./routes/billing.ts";
import { clientRoutes } from "./routes/clients.ts";
import { contaRoutes } from "./routes/conta.ts";
import { gatewayRoutes } from "./routes/gateway.ts";
import { integrationRoutes } from "./routes/integrations.ts";
import { auditRoutes, meRoutes } from "./routes/misc.ts";
import { overviewRoutes } from "./routes/overview.ts";
import { planRoutes } from "./routes/plans.ts";

const ROLE_RANK: Record<AdminRole, number> = { viewer: 0, operator: 1, owner: 2 };
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function clientIp(ctx: AppContext, headers: Headers, env: Env["Bindings"] | undefined): string {
  if (ctx.config.clientIpHeader) {
    const value = headers.get(ctx.config.clientIpHeader)?.split(",")[0]?.trim();
    if (value) return value.slice(0, 64);
  }
  return env?.incoming?.socket?.remoteAddress ?? "desconhecido";
}

export function isCustomerPath(path: string): boolean {
  return path === "/api/conta" || path.startsWith("/api/conta/");
}

export function createApp(ctx: AppContext) {
  const app = new Hono<Env>();
  const customerHost = new URL(ctx.config.customerPublicUrl).host.toLowerCase();

  app.use("*", async (c, next) => {
    c.set("ip", clientIp(ctx, c.req.raw.headers, c.env));
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Frame-Options", "DENY");
    if (c.req.path.startsWith("/api/") || c.req.path.startsWith("/webhooks/")) c.header("Cache-Control", "no-store");
  });

  // One deployment, two hosts: the customer API answers only on the customer host and the operator API
  // (with webhooks and cron) never does. Each host's session cookie is host-only, and writes must also
  // come from that host's own origin.
  app.use("*", async (c, next) => {
    const path = c.req.path;
    if ((path.startsWith("/api/") || path.startsWith("/webhooks/")) && path !== "/api/health") {
      const onCustomerHost = new URL(c.req.url).host.toLowerCase() === customerHost;
      if (onCustomerHost !== isCustomerPath(path)) return c.json({ error: "Rota inexistente" }, 404);
    }
    await next();
  });

  app.onError((error, c) => {
    if (error instanceof DomainError) return c.json({ error: error.message }, error.status as 400);
    console.error("[admin] erro inesperado", error);
    return c.json({ error: "Erro interno. Tente de novo; se continuar, veja os logs do servidor." }, 500);
  });

  app.get("/api/health", async (c) => {
    await ctx.db.query("SELECT 1");
    return c.json({ ok: true });
  });

  // Cookie-authenticated routes only accept writes from the panel's own origin.
  app.use("/api/*", async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method) && !c.req.path.startsWith("/api/cron/") && !isCustomerPath(c.req.path)) {
      const origin = c.req.header("origin");
      if (origin && origin !== ctx.config.publicUrl) return c.json({ error: "Origem não permitida" }, 403);
      if (!origin && c.req.header("sec-fetch-site") === "cross-site") return c.json({ error: "Origem não permitida" }, 403);
    }
    await next();
  });

  app.route("/api/auth", authRoutes(ctx));
  app.route("/api/conta", contaRoutes(ctx));

  const cron = async (c: Ctx) => {
    const expected = ctx.config.cronSecret;
    const given = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!expected || !safeEqual(given, expected)) return c.json({ error: "não autorizado" }, 401);
    return c.json(await tick(ctx));
  };
  app.get("/api/cron/tick", cron);
  app.post("/api/cron/tick", cron);

  app.post("/webhooks/asaas/:billingAccountId", async (c) => {
    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return c.json({ error: "corpo inválido" }, 400);
    }
    const result = await ingestAsaasWebhook(ctx, c.req.param("billingAccountId"), c.req.header("asaas-access-token"), payload);
    if (result.status !== 200) return c.json({ error: result.error }, result.status);
    if (result.jobId !== null) {
      // The event is already stored; processing it now only saves waiting for the next cron tick.
      await runJobs(ctx, JOB_HANDLERS, { onlyIds: [result.jobId], limit: 1 }).catch((error) => console.error("[admin] webhook", error));
    }
    return c.json({ received: true, duplicate: result.duplicate });
  });

  const api = new Hono<Env>();
  api.use("*", async (c, next) => {
    const session = await sessionFor(ctx, getCookie(c, SESSION_COOKIE));
    if (!session || session.mfaPending) return c.json({ error: "Faça login para continuar" }, 401);
    const needed: AdminRole = SAFE_METHODS.has(c.req.method) ? "viewer" : "operator";
    if (ROLE_RANK[session.role] < ROLE_RANK[needed] && !c.req.path.startsWith("/api/me/")) {
      return c.json({ error: "Seu perfil é somente leitura" }, 403);
    }
    c.set("admin", session);
    await next();
  });
  api.route("/overview", overviewRoutes(ctx));
  api.route("/clients", clientRoutes(ctx));
  api.route("/plans", planRoutes(ctx));
  api.route("/billing", billingRoutes(ctx));
  api.route("/integrations", integrationRoutes(ctx));
  api.route("/gateway", gatewayRoutes(ctx));
  api.route("/audit", auditRoutes(ctx));
  api.route("/me", meRoutes(ctx));
  app.route("/api", api);

  app.all("/api/*", (c) => c.json({ error: "Rota inexistente" }, 404));
  return app;
}

export type AdminApp = ReturnType<typeof createApp>;
