import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppContext } from "../../context.ts";
import {
  CUSTOMER_COOKIE, CUSTOMER_SESSION_TTL_MS, customerSessionFor, requestCustomerOtp, revokeCustomerSession, verifyCustomerOtp,
} from "../../customer/auth.ts";
import { arkobotView, openArkoBot } from "../../customer/arkobot.ts";
import { computersView } from "../../customer/computers.ts";
import { CUSTOMER_BILLING_TYPES, MAX_EXTRA_COMPUTERS, type CreditPackageId } from "../../customer/catalog.ts";
import {
  buyCredits, cancelOwnSubscription, completeOnboarding, customerState, dashboard, exportData, planCatalog, requestDeletion, setExtraComputers,
  subscribe, type CustomerRequest,
} from "../../customer/service.ts";
import { body, router, type Ctx } from "../http.ts";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const billingType = z.enum(CUSTOMER_BILLING_TYPES);

const emailSchema = z.object({ email: z.string().trim().min(3).max(254) });
const verifySchema = z.object({ email: z.string().trim().min(3).max(254), code: z.string().trim().min(6).max(12) });
const onboardingSchema = z.object({
  name: z.string().trim().min(2, "informe o seu nome").max(120),
  phone: z.string().trim().min(8, "informe o telefone com DDD").max(30),
  companyName: z.string().trim().max(160).optional(),
  documentType: z.enum(["cpf", "cnpj"]).optional(),
  document: z.string().trim().max(20).optional(),
  acceptTerms: z.boolean(),
});
const subscribeSchema = z.object({
  plan: z.string().trim().min(2).max(40),
  extraComputers: z.number().int().min(0).max(MAX_EXTRA_COMPUTERS).default(0),
  billingType,
});
const cancelSchema = z.object({ reason: z.string().trim().min(3, "conte em poucas palavras o motivo").max(500) });

function setSession(c: Ctx, ctx: AppContext, token: string) {
  // Lax, not Strict: the customer comes back from Asaas's invoice page by a top-level link and must still be signed in.
  setCookie(c, CUSTOMER_COOKIE, token, {
    httpOnly: true, secure: ctx.config.customerCookieSecure, sameSite: "Lax", path: "/", maxAge: Math.floor(CUSTOMER_SESSION_TTL_MS / 1000),
  });
}

/** The customer area's API (/api/conta/*). The host gate in app.ts only lets it answer on CUSTOMER_PUBLIC_URL's host. */
export function contaRoutes(ctx: AppContext) {
  const app = router();

  app.use("*", async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method)) {
      const origin = c.req.header("origin");
      if (origin && origin !== ctx.config.customerPublicUrl) return c.json({ error: "Origem não permitida" }, 403);
      if (!origin && c.req.header("sec-fetch-site") === "cross-site") return c.json({ error: "Origem não permitida" }, 403);
    }
    await next();
  });

  app.post("/auth/otp/request", async (c) => {
    const { email } = await body(c, emailSchema);
    await requestCustomerOtp(ctx, email, c.get("ip"));
    return c.json({ ok: true, message: "Enviamos um código de 8 dígitos para o seu e-mail." });
  });

  app.post("/auth/otp/verify", async (c) => {
    const { email, code } = await body(c, verifySchema);
    const result = await verifyCustomerOtp(ctx, email, code, c.get("ip"), c.req.header("user-agent") ?? null);
    if (!result.ok) {
      return c.json({ error: result.reason === "rate_limited" ? "Muitas tentativas. Aguarde um minuto." : "Código inválido ou expirado." },
        result.reason === "rate_limited" ? 429 : 401);
    }
    setSession(c, ctx, result.token);
    return c.json({ ok: true, created: result.created });
  });

  app.post("/auth/logout", async (c) => {
    const session = await customerSessionFor(ctx, getCookie(c, CUSTOMER_COOKIE));
    if (session) await revokeCustomerSession(ctx, session.sessionId);
    deleteCookie(c, CUSTOMER_COOKIE, { path: "/", secure: ctx.config.customerCookieSecure });
    return c.json({ ok: true });
  });

  app.get("/auth/session", async (c) => {
    const session = await customerSessionFor(ctx, getCookie(c, CUSTOMER_COOKIE));
    if (!session) return c.json({ authenticated: false });
    return c.json({ authenticated: true, ...(await customerState(ctx, session)) });
  });

  app.get("/planos", async (c) => {
    const catalog = await planCatalog(ctx);
    return c.json(catalog);
  });

  const authed = router();
  authed.use("*", async (c, next) => {
    const session = await customerSessionFor(ctx, getCookie(c, CUSTOMER_COOKIE));
    if (!session) return c.json({ error: "Entre na sua conta para continuar" }, 401);
    c.set("customer", session);
    await next();
  });
  const request = (c: Ctx): CustomerRequest => ({ session: c.get("customer"), ip: c.get("ip"), userAgent: c.req.header("user-agent") ?? null });

  authed.post("/cadastro", async (c) => {
    const input = await body(c, onboardingSchema);
    await completeOnboarding(ctx, request(c), input);
    const session = (await customerSessionFor(ctx, getCookie(c, CUSTOMER_COOKIE)))!;
    return c.json(await customerState(ctx, session));
  });

  authed.post("/assinatura", async (c) => {
    const input = await body(c, subscribeSchema);
    const result = await subscribe(ctx, request(c), { planCode: input.plan, extraComputers: input.extraComputers, billingType: input.billingType });
    return c.json(result, 201);
  });

  authed.post("/assinatura/computadores", async (c) => {
    const input = await body(c, z.object({ quantity: z.number().int().min(0).max(MAX_EXTRA_COMPUTERS) }));
    const totalCents = await setExtraComputers(ctx, request(c), input.quantity);
    return c.json({ ok: true, totalCents });
  });

  authed.post("/assinatura/cancelar", async (c) => {
    const input = await body(c, cancelSchema);
    return c.json({ ok: true, ...(await cancelOwnSubscription(ctx, request(c), input.reason)) });
  });

  authed.get("/painel", async (c) => c.json(await dashboard(ctx, request(c))));

  authed.get("/arkobot", async (c) => c.json(await arkobotView(ctx, request(c))));
  authed.post("/arkobot/abrir", async (c) => c.json(await openArkoBot(ctx, request(c))));
  authed.get("/computadores", async (c) => c.json(await computersView(ctx, request(c))));

  authed.post("/creditos", async (c) => {
    const input = await body(c, z.object({ package: z.string().trim().max(20), billingType }));
    const result = await buyCredits(ctx, request(c), { packageId: input.package as CreditPackageId, billingType: input.billingType });
    return c.json(result, 201);
  });

  authed.get("/dados", async (c) => {
    const data = await exportData(ctx, request(c));
    c.header("Content-Disposition", `attachment; filename="arkobot-meus-dados-${data.exportedAt.slice(0, 10)}.json"`);
    return c.json(data);
  });

  authed.post("/exclusao", async (c) => {
    const input = await body(c, z.object({ reason: z.string().trim().max(1000).optional().nullable(), confirm: z.literal(true) }));
    const created = await requestDeletion(ctx, request(c), input.reason ?? null);
    return c.json({ ok: true, requestedAt: created.created_at }, 201);
  });

  app.route("/", authed);
  return app;
}
