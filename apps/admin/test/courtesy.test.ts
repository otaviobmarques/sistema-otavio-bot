import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { grantCourtesy } from "../src/billing/courtesy.ts";
import { runDunning } from "../src/billing/service.ts";
import { tick } from "../src/jobs/handlers.ts";
import { billingFixture, type BillingFixture } from "./billing-fixture.ts";
import { advance, client, cnpj, customerClient, DAY, sessionCookie, type TestContext } from "./helpers.ts";

interface SubState {
  id: string; status: string; courtesy: boolean; price_cents: number; billing_account_id: string | null; provider_subscription_id: string | null;
  courtesy_reason: string | null; courtesy_until: string | null; cancel_reason: string | null; current_period_start: Date; current_period_end: Date;
}

async function subscriptionsOf(ctx: TestContext, orgId: string): Promise<SubState[]> {
  const { rows } = await ctx.db.query<SubState>("SELECT * FROM subscriptions WHERE organization_id = $1 ORDER BY created_at", [orgId]);
  return rows;
}

async function orgState(ctx: TestContext, orgId: string) {
  return (await ctx.db.query<{ status: string; status_reason_code: string | null }>(
    "SELECT status, status_reason_code FROM organizations WHERE id = $1", [orgId])).rows[0]!;
}

async function customerSignedUp(ctx: TestContext, email: string) {
  const api = customerClient(ctx);
  await api.post("/api/conta/auth/otp/request", { email });
  const code = [...ctx.mailer.sent].reverse().find((mail) => mail.to === email)!.text.match(/(\d{4})-(\d{4})/)!;
  const verified = await api.post("/api/conta/auth/otp/verify", { email, code: `${code[1]}${code[2]}` });
  const cookie = (verified.headers.get("set-cookie") ?? "").split(";")[0]!;
  const done = await customerClient(ctx, cookie).post("/api/conta/cadastro", {
    name: "Ana Souza", phone: "(11) 98765-4321", companyName: "Oficina da Ana", documentType: "cnpj", document: cnpj("556677880001"), acceptTerms: true,
  });
  if (done.status !== 200) throw new Error(JSON.stringify(done.data));
  return { api: customerClient(ctx, cookie), orgId: done.data.organization.id as string };
}

describe("cortesia: plano liberado sem cobrança", () => {
  let f: BillingFixture;
  beforeEach(async () => {
    f = await billingFixture();
  });
  afterEach(() => f.close());

  const grant = (orgId: string, body: Record<string, unknown> = {}) =>
    f.api.post(`/api/clients/${orgId}/courtesy`, { planId: f.plans.profissional!.id, reason: "parceiro de lançamento", ...body });

  it("creates an active subscription with no charge, grants the quota at once and records who and why", async () => {
    const org = await f.newClient();
    const response = await grant(org, { until: "2027-02-28" });
    expect(response.status).toBe(201);
    const [sub] = await subscriptionsOf(f.ctx, org);
    expect(sub).toMatchObject({
      status: "active", courtesy: true, price_cents: 0, billing_account_id: null, provider_subscription_id: null,
      courtesy_reason: "parceiro de lançamento", courtesy_until: "2027-02-28",
    });
    expect(sub!.current_period_end.toISOString().slice(0, 10)).toBe("2026-12-25");
    expect(await f.wallet(org)).toEqual({ plan: 20_000, extra: 0 });
    const grants = await f.ctx.db.query<{ external_reference: string }>("SELECT external_reference FROM credit_ledger WHERE kind = 'plan_grant'");
    expect(grants.rows.map((row) => row.external_reference)).toEqual([`courtesy:${sub!.id}:2026-11-25:grant`]);
    expect(f.fake.subscriptions.size).toBe(0);
    const audit = await f.ctx.db.query<{ action: string; reason: string; actor_type: string }>(
      "SELECT action, reason, actor_type FROM audit_log WHERE action = 'subscription.courtesy_granted'");
    expect(audit.rows).toEqual([{ action: "subscription.courtesy_granted", reason: "parceiro de lançamento", actor_type: "admin" }]);

    const detail = await f.api.get(`/api/clients/${org}`);
    expect(detail.data.subscription).toMatchObject({ courtesy: true, courtesy_until: "2027-02-28", total_cents: 0 });
    expect(detail.data.subscription.courtesy_granted_by_email).toMatch(/@domma\.com\.br$/);
    const list = await f.api.get("/api/clients");
    expect(list.data.clients.find((row: { id: string }) => row.id === org)).toMatchObject({ courtesy: true, subscription_status: "active" });
    expect((await f.api.get("/api/overview")).data.stats).toMatchObject({ paying: 0, courtesy: 1, mrr_cents: 0 });

    expect((await grant(org)).status).toBe(409);
    const addon = (await f.api.get("/api/plans")).data.addons[0];
    const addonChange = await f.api.post(`/api/clients/${org}/subscription/addons`, { addonId: addon.id, quantity: 1 });
    expect(addonChange.status).toBe(400);
    expect(addonChange.data.error).toMatch(/cortesia/);
  });

  it("validates the reason and the end date", async () => {
    const org = await f.newClient();
    expect((await grant(org, { reason: "ok" })).status).toBe(400);
    const past = await grant(org, { until: "2026-11-24" });
    expect(past.status).toBe(400);
    expect(past.data.error).toMatch(/já passou/);
    expect((await grant(org, { until: "25/12/2026" })).status).toBe(400);
    expect(await subscriptionsOf(f.ctx, org)).toHaveLength(0);
  });

  it("refuses when the client has a paid subscription in progress", async () => {
    const org = await f.newClient();
    const sub = await f.subscribe(org);
    await f.webhook(f.fake.paymentEvent("PAYMENT_RECEIVED", {
      id: "pay_1", subscription: sub.provider_subscription_id, value: 159, status: "RECEIVED", billingType: "PIX", dueDate: "2026-11-25", paymentDate: "2026-11-25",
    }));
    const response = await grant(org);
    expect(response.status).toBe(409);
    expect(response.data.error).toMatch(/Cancele-a antes/);
    const subs = await subscriptionsOf(f.ctx, org);
    expect(subs.map((row) => [row.status, row.courtesy])).toEqual([["active", false]]);
    expect(f.fake.subscriptions.get(sub.provider_subscription_id)!.deleted).toBe(false);
  });

  it("replaces a never-paid subscription from the customer area and cancels it at Asaas through the queue", async () => {
    const { api, orgId } = await customerSignedUp(f.ctx, "ana@oficina.com.br");
    const created = await api.post("/api/conta/assinatura", { plan: "essencial", billingType: "BOLETO" });
    expect(created.status).toBe(201);
    const [pending] = await subscriptionsOf(f.ctx, orgId);
    expect(pending!.status).toBe("pending");

    expect((await grant(orgId)).status).toBe(201);
    const [old, courtesy] = await subscriptionsOf(f.ctx, orgId);
    expect(old).toMatchObject({ id: pending!.id, status: "canceled", cancel_reason: "Substituída por cortesia" });
    expect(courtesy).toMatchObject({ status: "active", courtesy: true });
    const payments = await f.ctx.db.query<{ status: string }>("SELECT status FROM payments WHERE subscription_id = $1", [pending!.id]);
    expect(payments.rows.map((row) => row.status)).toEqual(["canceled"]);

    await tick(f.ctx);
    expect(f.fake.subscriptions.get(pending!.provider_subscription_id!)!.deleted).toBe(true);
    await f.webhook(f.fake.subscriptionEvent("SUBSCRIPTION_DELETED", { id: pending!.provider_subscription_id, deleted: true }));
    expect((await subscriptionsOf(f.ctx, orgId)).map((row) => row.status)).toEqual(["canceled", "active"]);
    expect(await orgState(f.ctx, orgId)).toEqual({ status: "active", status_reason_code: null });
  });

  it("renews every month like a paid renewal, once per period, and the dunning never touches it", async () => {
    const org = await f.newClient();
    await grant(org);
    await f.api.post(`/api/clients/${org}/credits`, { bucket: "plan", amount: -15_000, reason: "consumo simulado" });
    await f.api.post(`/api/clients/${org}/credits`, { bucket: "extra", amount: 700, reason: "bônus de teste" });

    advance(f.ctx, 29 * DAY);
    expect((await tick(f.ctx)).courtesy).toEqual({ renewed: 0, ended: 0 });
    advance(f.ctx, 1 * DAY);
    expect((await tick(f.ctx)).courtesy).toEqual({ renewed: 1, ended: 0 });
    expect((await tick(f.ctx)).courtesy).toEqual({ renewed: 0, ended: 0 });
    expect(await f.wallet(org)).toEqual({ plan: 20_000, extra: 700 });
    const expired = await f.ctx.db.query<{ amount: number }>("SELECT amount FROM credit_ledger WHERE kind = 'plan_expire'");
    expect(expired.rows.map((row) => Number(row.amount))).toEqual([-5_000]);
    const [sub] = await subscriptionsOf(f.ctx, org);
    expect(sub!.current_period_start.toISOString().slice(0, 10)).toBe("2026-12-25");
    expect(sub!.current_period_end.toISOString().slice(0, 10)).toBe("2027-01-25");

    advance(f.ctx, 70 * DAY);
    expect((await tick(f.ctx)).courtesy).toEqual({ renewed: 1, ended: 0 });
    const grants = await f.ctx.db.query<{ external_reference: string }>("SELECT external_reference FROM credit_ledger WHERE kind = 'plan_grant' ORDER BY id");
    expect(grants.rows.map((row) => row.external_reference.split(":")[2])).toEqual(["2026-11-25", "2026-12-25", "2027-02-25"]);

    await f.ctx.db.query("UPDATE subscriptions SET status = 'past_due', past_due_since = $2 WHERE id = $1", [sub!.id, new Date("2026-01-01T00:00:00Z")]);
    expect(await runDunning(f.ctx)).toEqual({ suspended: 0, canceled: 0, freeRenewed: 0 });
    await f.ctx.db.query("UPDATE subscriptions SET status = 'suspended' WHERE id = $1", [sub!.id]);
    await f.ctx.db.query("UPDATE organizations SET status = 'suspended', status_reason_code = 'billing', status_reason = 'teste' WHERE id = $1", [org]);
    expect(await runDunning(f.ctx)).toEqual({ suspended: 0, canceled: 0, freeRenewed: 0 });
    expect((await subscriptionsOf(f.ctx, org))[0]!.status).toBe("suspended");
  });

  it("ends after its last day (Brasília) and the client goes back to choosing a plan", async () => {
    const org = await f.newClient();
    await grant(org, { until: "2026-12-10" });
    f.ctx.clock.now = new Date("2026-12-11T02:00:00Z");
    expect((await tick(f.ctx)).courtesy).toEqual({ renewed: 0, ended: 0 });
    f.ctx.clock.now = new Date("2026-12-11T03:00:00Z");
    expect((await tick(f.ctx)).courtesy).toEqual({ renewed: 0, ended: 1 });
    const [sub] = await subscriptionsOf(f.ctx, org);
    expect(sub).toMatchObject({ status: "canceled", cancel_reason: "Cortesia encerrada" });
    expect(await orgState(f.ctx, org)).toEqual({ status: "suspended", status_reason_code: "subscription_ended" });
    expect((await tick(f.ctx)).courtesy).toEqual({ renewed: 0, ended: 0 });
  });

  it("the operator ends it now; a new courtesy reactivates a client suspended for that", async () => {
    const org = await f.newClient();
    await grant(org);
    expect((await f.api.post(`/api/clients/${org}/courtesy/revoke`, { reason: "x" })).status).toBe(400);
    expect((await f.api.post(`/api/clients/${org}/courtesy/revoke`, { reason: "parceria encerrada" })).status).toBe(200);
    const [sub] = await subscriptionsOf(f.ctx, org);
    expect(sub).toMatchObject({ status: "canceled", cancel_reason: "Cortesia encerrada: parceria encerrada" });
    expect(await orgState(f.ctx, org)).toEqual({ status: "suspended", status_reason_code: "subscription_ended" });
    const audit = await f.ctx.db.query<{ action: string }>("SELECT action FROM audit_log WHERE action LIKE 'subscription.courtesy%' ORDER BY id");
    expect(audit.rows.map((row) => row.action)).toEqual(["subscription.courtesy_granted", "subscription.courtesy_revoked"]);
    expect((await f.api.post(`/api/clients/${org}/courtesy/revoke`, { reason: "de novo, por engano" })).status).toBe(404);

    expect((await grant(org, { planId: f.plans.essencial!.id })).status).toBe(201);
    expect(await orgState(f.ctx, org)).toEqual({ status: "active", status_reason_code: null });
  });

  it("only owners and operators grant or end it", async () => {
    const org = await f.newClient();
    const viewer = client(f.ctx, await sessionCookie(f.ctx, "viewer"));
    expect((await viewer.post(`/api/clients/${org}/courtesy`, { planId: f.plans.profissional!.id, reason: "quero liberar" })).status).toBe(403);
    expect((await viewer.post(`/api/clients/${org}/courtesy/revoke`, { reason: "quero encerrar" })).status).toBe(403);
    const operator = client(f.ctx, await sessionCookie(f.ctx, "operator"));
    expect((await operator.post(`/api/clients/${org}/courtesy`, { planId: f.plans.profissional!.id, reason: "liberado pelo operador" })).status).toBe(201);
    await expect(grantCourtesy(f.ctx, { type: "customer", id: org }, { organizationId: org, planId: f.plans.essencial!.id, reason: "eu mesmo me dou" }))
      .rejects.toThrow(/equipe/);
  });

  it("the customer area treats it as a live plan with no payment actions", async () => {
    const { api, orgId } = await customerSignedUp(f.ctx, "ana@oficina.com.br");
    expect((await api.get("/api/conta/auth/session")).data.subscriptionStatus).toBeNull();
    await grant(orgId, { until: "2027-03-31" });

    expect((await api.get("/api/conta/auth/session")).data.subscriptionStatus).toBe("active");
    const panel = await api.get("/api/conta/painel");
    expect(panel.data.subscription).toMatchObject({
      status: "active", courtesy: true, courtesy_until: "2027-03-31", plan_name: "Profissional", total_cents: 0, next_due_date: null,
    });
    expect(panel.data.subscription).not.toHaveProperty("courtesy_reason");
    expect(panel.data.payments).toEqual([]);
    expect(panel.data.wallet).toEqual({ plan: 20_000, extra: 0 });

    const cancel = await api.post("/api/conta/assinatura/cancelar", { reason: "não quero mais" });
    expect(cancel.status).toBe(409);
    expect(cancel.data.error).toMatch(/cortesia.*WhatsApp/);
    expect((await api.post("/api/conta/assinatura/computadores", { quantity: 1 })).status).toBe(409);
    expect((await api.post("/api/conta/assinatura", { plan: "essencial", billingType: "PIX" })).status).toBe(409);

    const bought = await api.post("/api/conta/creditos", { package: "5mil", billingType: "PIX" });
    expect(bought.status).toBe(201);
  });
});
