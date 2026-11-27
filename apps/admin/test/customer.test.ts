import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OTP_MAX_ATTEMPTS } from "../src/auth/auth.ts";
import { LEGAL_DOCUMENTS, SUPPORT_WHATSAPP } from "../src/customer/catalog.ts";
import { billingFixture, type BillingFixture } from "./billing-fixture.ts";
import { advance, client, cnpj, cpf, customerClient, DAY, sessionCookie, testContext, type TestContext } from "./helpers.ts";

function codeFrom(ctx: TestContext, to?: string): string {
  const last = [...ctx.mailer.sent].reverse().find((mail) => !to || mail.to === to);
  const match = last?.text.match(/(\d{4})-(\d{4})/);
  if (!match) throw new Error("nenhum código enviado");
  return `${match[1]}${match[2]}`;
}

const cookieFrom = (headers: Headers) => (headers.get("set-cookie") ?? "").split(";")[0]!;

async function signIn(ctx: TestContext, email: string, ip = "203.0.113.70"): Promise<string> {
  const api = customerClient(ctx, undefined, ip);
  await api.post("/api/conta/auth/otp/request", { email });
  const verified = await api.post("/api/conta/auth/otp/verify", { email, code: codeFrom(ctx, email.toLowerCase()) });
  if (verified.status !== 200) throw new Error(JSON.stringify(verified.data));
  return cookieFrom(verified.headers);
}

let docSeq = 0;
const onboarding = (overrides: Record<string, unknown> = {}) => ({
  name: "Maria Silva", phone: "(19) 98765-4321", companyName: `Padaria ${++docSeq}`, documentType: "cnpj",
  document: cnpj(String(200000000000 + docSeq * 7907).slice(0, 12)), acceptTerms: true, ...overrides,
});

async function onboarded(ctx: TestContext, email: string) {
  const cookie = await signIn(ctx, email);
  const done = await customerClient(ctx, cookie).post("/api/conta/cadastro", onboarding());
  if (done.status !== 200) throw new Error(JSON.stringify(done.data));
  return { cookie, api: customerClient(ctx, cookie), orgId: done.data.organization.id as string };
}

describe("área do cliente: entrar e cadastrar por código no e-mail", () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await testContext();
  });
  afterEach(() => ctx.db.close());

  it("sends a code in Portuguese, creates the account only when it checks out, and sets a Lax host-only cookie", async () => {
    const api = customerClient(ctx);
    expect((await api.post("/api/conta/auth/otp/request", { email: " Maria@Padaria.com.br" })).status).toBe(200);
    expect(ctx.mailer.sent).toHaveLength(1);
    const mail = ctx.mailer.sent[0]!;
    expect(mail).toMatchObject({ to: "maria@padaria.com.br", from: "ArkoBot <conta@arkobot.com.br>" });
    expect(mail.subject).toMatch(/^Seu código de acesso ao ArkoBot: \d{4}-\d{4}$/);
    expect(mail.text).toContain("vale por 10 minutos");
    expect(mail.html).toContain("arko");
    expect((await ctx.db.query("SELECT 1 FROM accounts")).rows).toHaveLength(0);
    const stored = await ctx.db.query<{ code_hash: string }>("SELECT code_hash FROM account_otps");
    expect(stored.rows[0]!.code_hash).not.toContain(codeFrom(ctx));

    const verified = await api.post("/api/conta/auth/otp/verify", { email: "maria@padaria.com.br", code: codeFrom(ctx) });
    expect(verified.status).toBe(200);
    expect(verified.data.created).toBe(true);
    const setCookie = verified.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/^arko_conta_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).not.toMatch(/Domain=/i);
    const token = cookieFrom(verified.headers).split("=")[1]!;
    const sessions = await ctx.db.query<{ token_hash: string }>("SELECT token_hash FROM account_sessions");
    expect(sessions.rows[0]!.token_hash).not.toBe(token);

    const session = await customerClient(ctx, cookieFrom(verified.headers)).get("/api/conta/auth/session");
    expect(session.data).toMatchObject({ authenticated: true, account: { email: "maria@padaria.com.br" }, needsOnboarding: true, organization: null });

    advance(ctx, 16 * 60_000);
    await api.post("/api/conta/auth/otp/request", { email: "maria@padaria.com.br" });
    const again = await api.post("/api/conta/auth/otp/verify", { email: "maria@padaria.com.br", code: codeFrom(ctx) });
    expect(again.data.created).toBe(false);
    expect((await ctx.db.query("SELECT 1 FROM accounts")).rows).toHaveLength(1);
    const actions = await ctx.db.query<{ action: string; actor_type: string }>("SELECT action, actor_type FROM audit_log ORDER BY id");
    expect(actions.rows).toEqual([{ action: "account.signed_up", actor_type: "customer" }, { action: "account.login", actor_type: "customer" }]);
  });

  it("answers the same for any address and sends nothing for an invalid one", async () => {
    const api = customerClient(ctx);
    const invalid = await api.post("/api/conta/auth/otp/request", { email: "sem-arroba" });
    const valid = await api.post("/api/conta/auth/otp/request", { email: "novo@cliente.com.br" });
    expect(invalid.data).toEqual(valid.data);
    expect(ctx.mailer.sent).toHaveLength(1);
  });

  it("limits codes per recipient (3 per 15 min) and per IP, in buckets apart from the admin's", async () => {
    for (let i = 0; i < 5; i++) await customerClient(ctx, undefined, `198.51.100.${i}`).post("/api/conta/auth/otp/request", { email: "a@cliente.com.br" });
    expect(ctx.mailer.sent).toHaveLength(3);
    advance(ctx, 15 * 60_000 + 1);
    for (let i = 0; i < 7; i++) await customerClient(ctx, undefined, "192.0.2.9").post("/api/conta/auth/otp/request", { email: `b${i}@cliente.com.br` });
    expect(ctx.mailer.sent).toHaveLength(8);
  });

  it("burns the code after 5 wrong attempts, expires it after 10 minutes and limits checks per IP", async () => {
    const api = customerClient(ctx);
    await api.post("/api/conta/auth/otp/request", { email: "c@cliente.com.br" });
    const code = codeFrom(ctx);
    const wrong = code === "00000000" ? "11111111" : "00000000";
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      expect((await api.post("/api/conta/auth/otp/verify", { email: "c@cliente.com.br", code: wrong })).status).toBe(401);
    }
    expect((await api.post("/api/conta/auth/otp/verify", { email: "c@cliente.com.br", code })).status).toBe(401);

    advance(ctx, 16 * 60_000);
    await api.post("/api/conta/auth/otp/request", { email: "c@cliente.com.br" });
    const fresh = codeFrom(ctx);
    advance(ctx, 10 * 60_000 + 1);
    expect((await api.post("/api/conta/auth/otp/verify", { email: "c@cliente.com.br", code: fresh })).status).toBe(401);

    const flood = customerClient(ctx, undefined, "192.0.2.77");
    let limited = false;
    for (let i = 0; i < 12; i++) {
      if ((await flood.post("/api/conta/auth/otp/verify", { email: "c@cliente.com.br", code: "12345678" })).status === 429) limited = true;
    }
    expect(limited).toBe(true);
  });

  it("logout revokes the session", async () => {
    const cookie = await signIn(ctx, "d@cliente.com.br");
    const api = customerClient(ctx, cookie);
    expect((await api.get("/api/conta/auth/session")).data.authenticated).toBe(true);
    await api.post("/api/conta/auth/logout");
    expect((await api.get("/api/conta/auth/session")).data).toEqual({ authenticated: false });
    expect((await api.get("/api/conta/painel")).status).toBe(401);
  });
});

describe("um deploy, dois hosts: admin e área do cliente não se misturam", () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await testContext();
  });
  afterEach(() => ctx.db.close());

  it("the customer API does not answer on the admin host, nor the admin API on the customer host", async () => {
    const adminCookie = await sessionCookie(ctx, "owner");
    expect((await client(ctx).post("/api/conta/auth/otp/request", { email: "x@cliente.com.br" })).status).toBe(404);
    expect((await client(ctx).get("/api/conta/planos")).status).toBe(404);
    expect(ctx.mailer.sent).toHaveLength(0);

    const onCustomerHost = customerClient(ctx, adminCookie);
    expect((await onCustomerHost.get("/api/overview")).status).toBe(404);
    expect((await onCustomerHost.get("/api/auth/session")).status).toBe(404);
    expect((await onCustomerHost.post("/api/auth/otp/request", { email: "dono@domma.com.br" })).status).toBe(404);
    expect((await onCustomerHost.post("/api/clients", { name: "X" })).status).toBe(404);
    expect((await onCustomerHost.get("/api/cron/tick", { authorization: `Bearer ${ctx.config.cronSecret}` })).status).toBe(404);
    expect((await onCustomerHost.post("/webhooks/asaas/00000000-0000-4000-8000-000000000000", {})).status).toBe(404);
    expect((await onCustomerHost.get("/api/health")).status).toBe(200);
    expect((await client(ctx, adminCookie).get("/api/overview")).status).toBe(200);
  });

  it("a customer cookie is not an admin session and an admin cookie is not a customer session", async () => {
    const customerCookie = await signIn(ctx, "e@cliente.com.br");
    const adminCookie = await sessionCookie(ctx, "owner");
    const customerToken = customerCookie.split("=")[1]!;
    const adminToken = adminCookie.split("=")[1]!;
    expect((await client(ctx, customerCookie).get("/api/overview")).status).toBe(401);
    expect((await client(ctx, `arko_admin_session=${customerToken}`).get("/api/overview")).status).toBe(401);
    expect((await customerClient(ctx, adminCookie).get("/api/conta/painel")).status).toBe(401);
    expect((await customerClient(ctx, `arko_conta_session=${adminToken}`).get("/api/conta/painel")).status).toBe(401);
  });

  it("writes need the host's own origin", async () => {
    const customerCookie = await signIn(ctx, "f@cliente.com.br");
    const fromAdminOrigin = await customerClient(ctx, customerCookie).post("/api/conta/cadastro", onboarding(), { origin: ctx.config.publicUrl });
    expect(fromAdminOrigin.status).toBe(403);
    const crossSite = await customerClient(ctx, customerCookie).post("/api/conta/cadastro", onboarding(), { origin: "", "sec-fetch-site": "cross-site" });
    expect(crossSite.status).toBe(403);
    const adminCookie = await sessionCookie(ctx, "owner");
    const fromCustomerOrigin = await client(ctx, adminCookie).post("/api/clients", { name: "X" }, { origin: ctx.config.customerPublicUrl });
    expect(fromCustomerOrigin.status).toBe(403);
  });
});

describe("primeiro acesso: cadastro da empresa e aceite dos termos", () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await testContext({ clientIpHeader: "x-real-ip" });
  });
  afterEach(() => ctx.db.close());

  it("validates the form and records the acceptance of each document with version, IP and user agent", async () => {
    const cookie = await signIn(ctx, "g@cliente.com.br");
    const api = customerClient(ctx, cookie);
    const post = (body: Record<string, unknown>) => api.post("/api/conta/cadastro", body, { "x-real-ip": "177.10.20.30", "user-agent": "Navegador/1.0" });

    expect((await post(onboarding({ acceptTerms: false }))).status).toBe(400);
    expect((await post(onboarding({ document: "123.456.789-00" }))).data.error).toMatch(/inválido/);
    expect((await post(onboarding({ documentType: "cnpj", document: cpf("529982247") }))).data.error).toMatch(/CPF/);
    expect((await post(onboarding({ phone: "1234" }))).status).toBe(400);
    expect((await post(onboarding({ companyName: "" }))).status).toBe(400);
    expect((await ctx.db.query("SELECT 1 FROM organizations")).rows).toHaveLength(0);
    expect((await ctx.db.query("SELECT 1 FROM terms_acceptances")).rows).toHaveLength(0);

    const ok = await post(onboarding({ name: "Maria", documentType: "cpf", document: "529.982.247-25", companyName: "Maria Silva" }));
    expect(ok.status).toBe(200);
    expect(ok.data).toMatchObject({ needsOnboarding: false, role: "owner", organization: { document_type: "cpf", document: "52998224725" } });
    const account = await ctx.db.query("SELECT name, phone FROM accounts WHERE email = 'g@cliente.com.br'");
    expect(account.rows[0]).toEqual({ name: "Maria", phone: "19987654321" });
    const terms = await ctx.db.query("SELECT document, version, ip, user_agent, organization_id FROM terms_acceptances ORDER BY document");
    expect(terms.rows).toEqual([
      { document: "privacy", version: LEGAL_DOCUMENTS[1].version, ip: "177.10.20.30", user_agent: "Navegador/1.0", organization_id: ok.data.organization.id },
      { document: "terms", version: LEGAL_DOCUMENTS[0].version, ip: "177.10.20.30", user_agent: "Navegador/1.0", organization_id: ok.data.organization.id },
    ]);
    const membership = await ctx.db.query("SELECT role FROM memberships");
    expect(membership.rows).toEqual([{ role: "owner" }]);

    // already onboarded: posting again creates no second organisation nor duplicate acceptances
    expect((await post(onboarding())).status).toBe(200);
    expect((await ctx.db.query("SELECT 1 FROM organizations")).rows).toHaveLength(1);
    expect((await ctx.db.query("SELECT 1 FROM terms_acceptances")).rows).toHaveLength(2);
  });

  it("a CPF/CNPJ that already has an account is refused", async () => {
    const first = onboarding();
    await customerClient(ctx, await signIn(ctx, "h@cliente.com.br")).post("/api/conta/cadastro", first);
    const second = await customerClient(ctx, await signIn(ctx, "i@cliente.com.br")).post("/api/conta/cadastro", { ...first, companyName: "Outra" });
    expect(second.status).toBe(409);
    expect((await ctx.db.query("SELECT 1 FROM organizations")).rows).toHaveLength(1);
  });

  it("an account the operator registered only accepts the terms and keeps its organisation", async () => {
    const admin = client(ctx, await sessionCookie(ctx, "owner"));
    const created = await admin.post("/api/clients", { name: "Cliente do Admin", document: cnpj("112223330001"), ownerEmail: "j@cliente.com.br", ownerName: "Joana" });
    const cookie = await signIn(ctx, "j@cliente.com.br");
    const state = await customerClient(ctx, cookie).get("/api/conta/auth/session");
    expect(state.data).toMatchObject({ needsOnboarding: true, pendingDocuments: ["terms", "privacy"], organization: { id: created.data.client.id } });
    const done = await customerClient(ctx, cookie).post("/api/conta/cadastro", { name: "J Souza", phone: "11 3333-4444", acceptTerms: true });
    expect(done.status).toBe(200);
    expect(done.data.organization.id).toBe(created.data.client.id);
    expect((await ctx.db.query("SELECT 1 FROM organizations")).rows).toHaveLength(1);
  });

  it("a customer who accepted the previous terms is asked to accept the current version before paying again", async () => {
    const { api, cookie, orgId } = await onboarded(ctx, "v@cliente.com.br");
    await ctx.db.query("UPDATE terms_acceptances SET version = '2026-11-25'");
    expect(LEGAL_DOCUMENTS.map((doc) => doc.version)).toEqual(["2026-11-27", "2026-11-27"]);

    const state = await customerClient(ctx, cookie).get("/api/conta/auth/session");
    expect(state.data).toMatchObject({ needsOnboarding: true, pendingDocuments: ["terms", "privacy"], organization: { id: orgId } });
    const blocked = await api.post("/api/conta/assinatura", { plan: "essencial", billingType: "PIX" });
    expect(blocked.status).toBe(409);
    expect(blocked.data.error).toMatch(/Termos de Uso/);

    const accepted = await api.post("/api/conta/cadastro", { name: "Maria Silva", phone: "(19) 98765-4321", acceptTerms: true });
    expect(accepted.data).toMatchObject({ needsOnboarding: false, pendingDocuments: [], organization: { id: orgId } });
    const terms = await ctx.db.query<{ document: string; version: string }>("SELECT document, version FROM terms_acceptances ORDER BY version, document");
    expect(terms.rows).toEqual([
      { document: "privacy", version: "2026-11-25" }, { document: "terms", version: "2026-11-25" },
      { document: "privacy", version: "2026-11-27" }, { document: "terms", version: "2026-11-27" },
    ]);
    expect((await ctx.db.query("SELECT 1 FROM organizations")).rows).toHaveLength(1);
  });

  it("the legal versions match the published texts and the WhatsApp matches the site", () => {
    const legal = fileURLToPath(new URL("../../site/conteudo/legal/", import.meta.url));
    for (const doc of LEGAL_DOCUMENTS) {
      const text = readFileSync(`${legal}${doc.source}`, "utf8");
      const [, d, m, y] = text.match(/em vigor a partir de (\d{2})\/(\d{2})\/(\d{4})/) ?? [];
      expect(`${y}-${m}-${d}`, doc.source).toBe(doc.version);
    }
    const site = readFileSync(fileURLToPath(new URL("../../site/src/config/contato.ts", import.meta.url)), "utf8");
    expect(site).toContain(`whatsapp: '${SUPPORT_WHATSAPP}'`);
  });

  it("without an active Asaas account, plans show but payment says to talk on WhatsApp", async () => {
    const { api } = await onboarded(ctx, "k@cliente.com.br");
    const plans = await customerClient(ctx).get("/api/conta/planos");
    expect(plans.data.paymentsAvailable).toBe(false);
    expect(plans.data.plans.map((plan: { code: string }) => plan.code)).toEqual(["inicial", "essencial", "profissional", "empresa"]);
    const attempt = await api.post("/api/conta/assinatura", { plan: "essencial", billingType: "PIX" });
    expect(attempt.status).toBe(409);
    expect(attempt.data.error).toMatch(/WhatsApp/);
    expect((await ctx.db.query("SELECT 1 FROM subscriptions")).rows).toHaveLength(0);
  });
});

describe("assinatura, créditos, cancelamento e LGPD pela área do cliente", () => {
  let f: BillingFixture;
  beforeEach(async () => {
    f = await billingFixture();
  });
  afterEach(() => f.close());

  const firstPayment = (providerSubscriptionId: string) =>
    [...f.fake.payments.values()].find((payment) => payment.subscription === providerSubscriptionId)!;

  it("signup → subscription at Asaas with extra computers → invoice link → paid by webhook", async () => {
    const { api, orgId } = await onboarded(f.ctx, "l@cliente.com.br");
    expect((await api.post("/api/conta/assinatura", { plan: "gratis", billingType: "PIX" })).status).toBe(400);
    expect((await api.post("/api/conta/assinatura", { plan: "essencial", billingType: "UNDEFINED" })).status).toBe(400);

    const created = await api.post("/api/conta/assinatura", { plan: "profissional", extraComputers: 2, billingType: "BOLETO" });
    expect(created.status).toBe(201);
    expect(created.data.status).toBe("pending");
    const sub = await f.ctx.db.query<{ provider_subscription_id: string; billing_type: string; next_due_date: string }>(
      "SELECT provider_subscription_id, billing_type, next_due_date FROM subscriptions WHERE organization_id = $1", [orgId]);
    const remoteId = sub.rows[0]!.provider_subscription_id;
    expect(sub.rows[0]).toMatchObject({ billing_type: "BOLETO", next_due_date: "2026-11-28" });
    expect(f.fake.subscriptions.get(remoteId)).toMatchObject({ value: 917, billingType: "BOLETO" });
    const remotePayment = firstPayment(remoteId);
    expect(created.data.invoiceUrl).toBe(remotePayment.invoiceUrl);
    expect(String([...f.fake.customers.values()][0]!.cpfCnpj)).toMatch(/^\d{14}$/);

    const panel = await api.get("/api/conta/painel");
    expect(panel.data.subscription).toMatchObject({ status: "pending", plan_code: "profissional", total_cents: 91_700 });
    expect(panel.data.addons).toEqual([expect.objectContaining({ code: "computador-adicional", quantity: 2 })]);
    expect(panel.data.payments).toEqual([expect.objectContaining({ kind: "subscription", status: "pending", value_cents: 91_700, invoice_url: remotePayment.invoiceUrl })]);
    expect((await api.post("/api/conta/assinatura", { plan: "essencial", billingType: "PIX" })).status).toBe(409);

    await f.webhook(f.fake.paymentEvent("PAYMENT_RECEIVED", {
      id: remotePayment.id, subscription: remoteId, value: 917, status: "RECEIVED", billingType: "BOLETO", dueDate: "2026-11-28", paymentDate: "2026-11-26",
    }));
    const after = await api.get("/api/conta/painel");
    expect(after.data.subscription.status).toBe("active");
    expect(after.data.payments).toHaveLength(1);
    expect(after.data.payments[0].status).toBe("received");
    expect(after.data.wallet).toEqual({ plan: 20_000, extra: 0 });
    expect(after.data.ledger[0]).toMatchObject({ kind: "plan_grant", amount: 20_000 });
    const audit = await f.ctx.db.query("SELECT actor_type, actor_label FROM audit_log WHERE action = 'subscription.created'");
    expect(audit.rows).toEqual([{ actor_type: "customer", actor_label: "l@cliente.com.br" }]);
  });

  it("buys a credit package and gets the credits when Asaas confirms; changes the extra computers", async () => {
    const { api, orgId } = await onboarded(f.ctx, "m@cliente.com.br");
    expect((await api.post("/api/conta/creditos", { package: "10mil", billingType: "PIX" })).status).toBe(409);
    await api.post("/api/conta/assinatura", { plan: "essencial", billingType: "PIX" });
    expect((await api.post("/api/conta/creditos", { package: "999mil", billingType: "PIX" })).status).toBe(400);

    const charge = await api.post("/api/conta/creditos", { package: "10mil", billingType: "PIX" });
    expect(charge.status).toBe(201);
    expect(charge.data).toMatchObject({ credits: 10_000, valueCents: 10_000 });
    expect(charge.data.invoiceUrl).toMatch(/^https:\/\/sandbox\.asaas\.com\/i\//);
    expect(charge.data.pix.payload).toContain("br.gov.bcb.pix");
    expect(f.fake.payments.get(charge.data.providerPaymentId)).toMatchObject({ value: 100, billingType: "PIX" });
    await f.webhook(f.fake.paymentEvent("PAYMENT_RECEIVED", {
      id: charge.data.providerPaymentId, value: 100, status: "RECEIVED", billingType: "PIX", dueDate: "2026-11-25", paymentDate: "2026-11-25",
    }));
    expect(await f.wallet(orgId)).toEqual({ plan: 0, extra: 10_000 });
    const panel = await api.get("/api/conta/painel");
    expect(panel.data.ledger[0]).toMatchObject({ kind: "purchase", bucket: "extra", amount: 10_000 });

    const changed = await api.post("/api/conta/assinatura/computadores", { quantity: 3 });
    expect(changed.data.totalCents).toBe(15_900 * 4);
    expect((await api.post("/api/conta/assinatura/computadores", { quantity: 51 })).status).toBe(400);
    expect((await api.post("/api/conta/assinatura/computadores", { quantity: 0 })).data.totalCents).toBe(15_900);
  });

  it("limits how many charges one account can create per hour", async () => {
    const { api } = await onboarded(f.ctx, "n@cliente.com.br");
    await api.post("/api/conta/assinatura", { plan: "essencial", billingType: "PIX" });
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) statuses.push((await api.post("/api/conta/creditos", { package: "5mil", billingType: "PIX" })).status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(9);
    expect(statuses.at(-1)).toBe(429);
  });

  it("cancels the subscription at Asaas and here, with the reason, flagging the 7-day withdrawal window", async () => {
    const { api, orgId } = await onboarded(f.ctx, "o@cliente.com.br");
    await api.post("/api/conta/assinatura", { plan: "essencial", billingType: "CREDIT_CARD" });
    expect((await api.post("/api/conta/assinatura/cancelar", { reason: "" })).status).toBe(400);
    advance(f.ctx, 2 * DAY);
    const canceled = await api.post("/api/conta/assinatura/cancelar", { reason: "Não preciso mais" });
    expect(canceled.data).toEqual({ ok: true, withinWithdrawalPeriod: true, duringTrial: false, endsAt: null });
    const sub = await f.ctx.db.query<{ status: string; cancel_reason: string; provider_subscription_id: string }>(
      "SELECT status, cancel_reason, provider_subscription_id FROM subscriptions WHERE organization_id = $1", [orgId]);
    expect(sub.rows[0]).toMatchObject({ status: "canceled", cancel_reason: "Cancelado pelo cliente: Não preciso mais" });
    expect(f.fake.subscriptions.get(sub.rows[0]!.provider_subscription_id)!.deleted).toBe(true);
    const audit = await f.ctx.db.query<{ data: { withinWithdrawalPeriod: boolean } }>("SELECT data FROM audit_log WHERE action = 'subscription.canceled_by_customer'");
    expect(audit.rows[0]!.data.withinWithdrawalPeriod).toBe(true);
    expect((await api.post("/api/conta/assinatura/cancelar", { reason: "de novo" })).status).toBe(404);
    expect((await api.get("/api/conta/painel")).data.subscription.status).toBe("canceled");
    // and may subscribe again later
    expect((await api.post("/api/conta/assinatura", { plan: "essencial", billingType: "PIX" })).status).toBe(201);
  });

  it("exports the account's own data as a JSON download", async () => {
    const { api } = await onboarded(f.ctx, "p@cliente.com.br");
    await api.post("/api/conta/assinatura", { plan: "essencial", billingType: "PIX" });
    const exported = await api.get("/api/conta/dados");
    expect(exported.status).toBe(200);
    expect(exported.headers.get("content-disposition")).toMatch(/^attachment; filename="arkobot-meus-dados-2026-11-25\.json"$/);
    expect(exported.data.account.email).toBe("p@cliente.com.br");
    expect(exported.data.organizations).toHaveLength(1);
    expect(exported.data.termsAcceptances).toHaveLength(2);
    expect(exported.data.subscriptions).toHaveLength(1);
    expect(exported.data.payments).toHaveLength(1);
    expect(exported.data.sessions).toHaveLength(1);
    expect(JSON.stringify(exported.data)).not.toMatch(/token_hash|code_hash|api_key/);
    expect((await f.ctx.db.query("SELECT 1 FROM audit_log WHERE action = 'account.data_exported'")).rows).toHaveLength(1);
  });

  it("a deletion request is recorded for the operator, once, and shows on the client's page in the Admin", async () => {
    const { api, orgId } = await onboarded(f.ctx, "q@cliente.com.br");
    expect((await api.post("/api/conta/exclusao", { reason: "Vou parar de usar" })).status).toBe(400);
    const requested = await api.post("/api/conta/exclusao", { reason: "Vou parar de usar", confirm: true });
    expect(requested.status).toBe(201);
    expect((await api.post("/api/conta/exclusao", { confirm: true })).status).toBe(409);
    expect((await api.get("/api/conta/painel")).data.deletionRequest).toMatchObject({ status: "requested" });
    expect((await f.ctx.db.query("SELECT 1 FROM accounts WHERE email = 'q@cliente.com.br'")).rows).toHaveLength(1);

    const detail = await f.api.get(`/api/clients/${orgId}`);
    expect(detail.data.deletionRequests).toEqual([expect.objectContaining({ email: "q@cliente.com.br", status: "requested", reason: "Vou parar de usar" })]);
    expect(detail.data.terms).toHaveLength(2);
    const resolved = await f.api.post(`/api/clients/${orgId}/deletion-requests/${detail.data.deletionRequests[0].id}/resolve`, { status: "completed", note: "Dados pessoais anonimizados" });
    expect(resolved.status).toBe(200);
    expect((await f.api.post(`/api/clients/${orgId}/deletion-requests/${detail.data.deletionRequests[0].id}/resolve`, { status: "completed", note: "de novo, de novo" })).status).toBe(404);
    expect((await api.get("/api/conta/painel")).data.deletionRequest).toMatchObject({ status: "completed" });
  });

  it("one customer never sees another organisation's data", async () => {
    const a = await onboarded(f.ctx, "r@cliente.com.br");
    const b = await onboarded(f.ctx, "s@cliente.com.br");
    await a.api.post("/api/conta/assinatura", { plan: "empresa", billingType: "PIX" });
    await a.api.post("/api/conta/creditos", { package: "25mil", billingType: "PIX" });

    const panelB = await b.api.get("/api/conta/painel");
    expect(panelB.data.organization.id).toBe(b.orgId);
    expect(panelB.data.subscription).toBeNull();
    expect(panelB.data.payments).toEqual([]);
    const exportB = await b.api.get("/api/conta/dados");
    expect(JSON.stringify(exportB.data)).not.toContain(a.orgId);
    expect(JSON.stringify(exportB.data)).not.toContain("r@cliente.com.br");
    // B acts only on B: there is no subscription to cancel or change, whatever A has
    expect((await b.api.post("/api/conta/assinatura/cancelar", { reason: "tentativa" })).status).toBe(404);
    expect((await b.api.post("/api/conta/assinatura/computadores", { quantity: 1 })).status).toBe(404);
    expect((await a.api.get("/api/conta/painel")).data.subscription.status).toBe("pending");

    // a plain member of A's organisation reads but cannot change billing
    const memberCookie = await signIn(f.ctx, "t@cliente.com.br");
    const member = await f.ctx.db.query<{ id: string }>("SELECT id FROM accounts WHERE email = 't@cliente.com.br'");
    await f.ctx.db.query("INSERT INTO memberships (organization_id, account_id, role) VALUES ($1, $2, 'member')", [a.orgId, member.rows[0]!.id]);
    const asMember = customerClient(f.ctx, memberCookie);
    expect((await asMember.get("/api/conta/painel")).data.organization.id).toBe(a.orgId);
    expect((await asMember.post("/api/conta/assinatura/cancelar", { reason: "não sou o dono" })).status).toBe(403);

    // with no organisation at all there is nothing to read
    const lone = customerClient(f.ctx, await signIn(f.ctx, "u@cliente.com.br"));
    expect((await lone.get("/api/conta/painel")).status).toBe(409);
  });
});
