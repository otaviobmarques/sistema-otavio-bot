import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nextSubscriptionStatus, type BillingSignal, type SubscriptionStatus } from "../src/billing/subscription-machine.ts";
import { processBillingEvent } from "../src/billing/webhooks.ts";
import { tick } from "../src/jobs/handlers.ts";
import { billingFixture, type BillingFixture } from "./billing-fixture.ts";
import { advance, client, DAY } from "./helpers.ts";

const paid = (sub: string, id: string, value = 159, extra: Record<string, unknown> = {}) =>
  ({ id, subscription: sub, value, status: "RECEIVED", billingType: "PIX", dueDate: "2026-11-25", paymentDate: "2026-11-25", ...extra });

describe("máquina de estados da assinatura", () => {
  const cases: [SubscriptionStatus, BillingSignal, SubscriptionStatus | null][] = [
    ["pending", "payment_paid", "active"],
    ["active", "payment_paid", null],
    ["past_due", "payment_paid", "active"],
    ["suspended", "payment_paid", "active"],
    ["canceled", "payment_paid", null],
    ["pending", "payment_overdue", "past_due"],
    ["active", "payment_overdue", "past_due"],
    ["past_due", "payment_overdue", null],
    ["suspended", "payment_overdue", null],
    ["active", "payment_refunded", null],
    ["active", "chargeback", "suspended"],
    ["past_due", "dunning_suspend", "suspended"],
    ["active", "dunning_suspend", null],
    ["suspended", "dunning_cancel", "canceled"],
    ["past_due", "dunning_cancel", null],
    ["active", "provider_ended", "canceled"],
    ["canceled", "provider_ended", null],
    ["pending", "admin_cancel", "canceled"],
    ["active", "courtesy_expired", "canceled"],
    ["canceled", "courtesy_expired", null],
  ];
  it.each(cases)("%s + %s → %s", (from, signal, to) => {
    expect(nextSubscriptionStatus(from, signal)).toBe(to);
  });
});

describe("Asaas: assinatura, webhooks e créditos", () => {
  let f: BillingFixture;
  beforeEach(async () => {
    f = await billingFixture();
  });
  afterEach(() => f.close());

  it("creates the customer (with CPF/CNPJ) and the subscription in Asaas, pending until paid", async () => {
    const org = await f.newClient();
    const sub = await f.subscribe(org);
    expect(sub.provider_subscription_id).toMatch(/^sub_/);
    const customer = [...f.fake.customers.values()][0]!;
    expect(String(customer.cpfCnpj)).toMatch(/^\d{14}$/);
    expect(customer.externalReference).toBe(`org:${org}`);
    const remote = f.fake.subscriptions.get(sub.provider_subscription_id)!;
    expect(remote).toMatchObject({ billingType: "PIX", value: 159, cycle: "MONTHLY", externalReference: `sub:${sub.id}` });
    const local = await f.ctx.db.query<{ status: string; billing_account_id: string }>("SELECT status, billing_account_id FROM subscriptions WHERE id = $1", [sub.id]);
    expect(local.rows[0]).toMatchObject({ status: "pending", billing_account_id: f.accountId });
    // a second subscription for the same client is refused
    expect((await f.api.post(`/api/clients/${org}/subscription`, { planId: f.plans.essencial!.id, billingType: "PIX" })).status).toBe(409);
  });

  it("refuses a webhook with a wrong token or unknown account, and stores nothing", async () => {
    expect((await f.webhook({ id: "evt_x", event: "PAYMENT_RECEIVED" }, "token-errado")).status).toBe(401);
    expect((await f.webhook({ id: "evt_x", event: "PAYMENT_RECEIVED" }, "")).status).toBe(401);
    const anonymous = client(f.ctx);
    expect((await anonymous.post(`/webhooks/asaas/${f.accountId}`, { id: "evt_x", event: "PAYMENT_RECEIVED" })).status).toBe(401);
    expect((await anonymous.post("/webhooks/asaas/00000000-0000-4000-8000-000000000000", { id: "evt_x" }, { "asaas-access-token": f.webhookToken })).status).toBe(404);
    expect((await anonymous.post("/webhooks/asaas/nao-e-uuid", { id: "evt_x" }, { "asaas-access-token": f.webhookToken })).status).toBe(404);
    const unknown = await f.ctx.db.query("SELECT count(*)::int AS n FROM billing_events WHERE event_id = 'evt_x'");
    expect(unknown.rows[0]).toEqual({ n: 0 });
  });

  it("is idempotent: a repeated event is stored once and credits the quota once", async () => {
    const org = await f.newClient();
    const sub = await f.subscribe(org);
    const event = f.fake.paymentEvent("PAYMENT_RECEIVED", paid(sub.provider_subscription_id, "pay_1"), "evt_received_1");
    const first = await f.webhook(event);
    expect(first.data).toEqual({ received: true, duplicate: false });
    const second = await f.webhook(event);
    expect(second.data).toEqual({ received: true, duplicate: true });
    const stored = await f.ctx.db.query<{ n: number }>("SELECT count(*)::int AS n FROM billing_events");
    expect(stored.rows[0]!.n).toBe(1);
    expect(await f.wallet(org)).toEqual({ plan: 4000, extra: 0 });

    // processing the stored event again (a retried job) changes nothing
    const eventId = (await f.ctx.db.query<{ id: string }>("SELECT id FROM billing_events")).rows[0]!.id;
    await f.ctx.db.query("UPDATE billing_events SET status = 'received' WHERE id = $1", [eventId]);
    await processBillingEvent(f.ctx, eventId);
    expect(await f.wallet(org)).toEqual({ plan: 4000, extra: 0 });

    // CONFIRMED and RECEIVED for the same payment, as different events: one grant
    await f.webhook(f.fake.paymentEvent("PAYMENT_CONFIRMED", paid(sub.provider_subscription_id, "pay_1", 159, { status: "CONFIRMED" }), "evt_confirmed_1"));
    const grants = await f.ctx.db.query<{ n: number }>("SELECT count(*)::int AS n FROM credit_ledger WHERE kind = 'plan_grant'");
    expect(grants.rows[0]!.n).toBe(1);
    const state = await f.ctx.db.query<{ status: string; current_period_end: Date }>("SELECT status, current_period_end FROM subscriptions WHERE id = $1", [sub.id]);
    expect(state.rows[0]!.status).toBe("active");
    expect(state.rows[0]!.current_period_end.toISOString().slice(0, 10)).toBe("2026-12-25");
  });

  it("ledger rows are immutable", async () => {
    const org = await f.newClient();
    await f.api.post(`/api/clients/${org}/credits`, { bucket: "extra", amount: 100, reason: "cortesia de boas-vindas" });
    await expect(f.ctx.db.query("UPDATE credit_ledger SET amount = 999")).rejects.toThrow(/imutável/);
    await expect(f.ctx.db.query("DELETE FROM credit_ledger")).rejects.toThrow(/imutável/);
    await expect(f.ctx.db.query("DELETE FROM audit_log")).rejects.toThrow(/imutável/);
  });

  it("a renewal expires the unused quota and grants the new one; extra credits stay", async () => {
    const org = await f.newClient();
    const sub = await f.subscribe(org);
    await f.webhook(f.fake.paymentEvent("PAYMENT_RECEIVED", paid(sub.provider_subscription_id, "pay_m1")));
    await f.api.post(`/api/clients/${org}/credits`, { bucket: "extra", amount: 500, reason: "bônus de teste" });
    await f.api.post(`/api/clients/${org}/credits`, { bucket: "plan", amount: -1500, reason: "consumo simulado" });
    expect(await f.wallet(org)).toEqual({ plan: 2500, extra: 500 });
    await f.webhook(f.fake.paymentEvent("PAYMENT_CREATED", { ...paid(sub.provider_subscription_id, "pay_m2"), status: "PENDING", dueDate: "2026-12-25" }));
    await f.webhook(f.fake.paymentEvent("PAYMENT_RECEIVED", paid(sub.provider_subscription_id, "pay_m2", 159, { dueDate: "2026-12-25" })));
    expect(await f.wallet(org)).toEqual({ plan: 4000, extra: 500 });
    const expired = await f.ctx.db.query<{ amount: number }>("SELECT amount FROM credit_ledger WHERE kind = 'plan_expire'");
    expect(expired.rows.map((row) => Number(row.amount))).toEqual([-2500]);
  });

  it("overdue → past_due with instances flagged; payment → active again", async () => {
    const org = await f.newClient();
    const sub = await f.subscribe(org);
    await f.webhook(f.fake.paymentEvent("PAYMENT_RECEIVED", paid(sub.provider_subscription_id, "pay_a")));
    await f.ctx.db.query("INSERT INTO instances (organization_id, subscription_id, slug, machine_id, mode, state) VALUES ($1, $2, 'cli-a', 'mach-a', 'dedicated', 'ready')", [org, sub.id]);

    await f.webhook(f.fake.paymentEvent("PAYMENT_OVERDUE", { ...paid(sub.provider_subscription_id, "pay_b"), status: "OVERDUE", dueDate: "2026-12-25" }));
    let row = (await f.ctx.db.query<{ status: string; past_due_since: Date | null }>("SELECT status, past_due_since FROM subscriptions WHERE id = $1", [sub.id])).rows[0]!;
    expect(row.status).toBe("past_due");
    expect(row.past_due_since).not.toBeNull();
    expect((await f.ctx.db.query("SELECT state FROM instances")).rows[0]).toEqual({ state: "payment_problem" });

    await f.webhook(f.fake.paymentEvent("PAYMENT_RECEIVED", paid(sub.provider_subscription_id, "pay_b", 159, { dueDate: "2026-12-25" })));
    row = (await f.ctx.db.query<{ status: string; past_due_since: Date | null }>("SELECT status, past_due_since FROM subscriptions WHERE id = $1", [sub.id])).rows[0]!;
    expect(row).toEqual({ status: "active", past_due_since: null });
    expect((await f.ctx.db.query("SELECT state FROM instances")).rows[0]).toEqual({ state: "ready" });

    // a late OVERDUE for a payment already received is ignored
    await f.webhook(f.fake.paymentEvent("PAYMENT_OVERDUE", { ...paid(sub.provider_subscription_id, "pay_b"), status: "OVERDUE" }));
    expect((await f.ctx.db.query("SELECT status FROM subscriptions WHERE id = $1", [sub.id])).rows[0]).toEqual({ status: "active" });
  });

  it("a refund takes back the credits it granted", async () => {
    const org = await f.newClient();
    const sub = await f.subscribe(org);
    await f.webhook(f.fake.paymentEvent("PAYMENT_RECEIVED", paid(sub.provider_subscription_id, "pay_r")));
    await f.api.post(`/api/clients/${org}/credits`, { bucket: "plan", amount: -1000, reason: "consumo simulado" });
    await f.webhook(f.fake.paymentEvent("PAYMENT_REFUNDED", { ...paid(sub.provider_subscription_id, "pay_r"), status: "REFUNDED" }));
    expect(await f.wallet(org)).toEqual({ plan: 0, extra: 0 });
    const reversal = await f.ctx.db.query<{ amount: number }>("SELECT amount FROM credit_ledger WHERE kind = 'refund_reversal'");
    expect(reversal.rows.map((r) => Number(r.amount))).toEqual([-3000]);
    // replay
    await f.webhook(f.fake.paymentEvent("PAYMENT_REFUNDED", { ...paid(sub.provider_subscription_id, "pay_r"), status: "REFUNDED" }));
    expect((await f.ctx.db.query("SELECT count(*)::int AS n FROM credit_ledger WHERE kind = 'refund_reversal'")).rows[0]).toEqual({ n: 1 });
  });

  it("a chargeback reverses credits and suspends the client", async () => {
    const org = await f.newClient();
    const sub = await f.subscribe(org);
    await f.webhook(f.fake.paymentEvent("PAYMENT_RECEIVED", paid(sub.provider_subscription_id, "pay_c")));
    await f.webhook(f.fake.paymentEvent("PAYMENT_CHARGEBACK_REQUESTED", { ...paid(sub.provider_subscription_id, "pay_c"), status: "CHARGEBACK_REQUESTED" }));
    expect(await f.wallet(org)).toEqual({ plan: 0, extra: 0 });
    const state = await f.ctx.db.query("SELECT o.status, o.status_reason_code, s.status AS sub FROM organizations o JOIN subscriptions s ON s.organization_id = o.id WHERE o.id = $1", [org]);
    expect(state.rows[0]).toEqual({ status: "suspended", status_reason_code: "chargeback", sub: "suspended" });
  });

  it("SUBSCRIPTION_DELETED / INACTIVATED end the subscription", async () => {
    const org = await f.newClient();
    const sub = await f.subscribe(org);
    await f.webhook(f.fake.paymentEvent("PAYMENT_RECEIVED", paid(sub.provider_subscription_id, "pay_d")));
    await f.webhook(f.fake.subscriptionEvent("SUBSCRIPTION_INACTIVATED", { id: sub.provider_subscription_id, status: "INACTIVE" }));
    const state = await f.ctx.db.query("SELECT s.status, o.status AS org, o.status_reason_code FROM subscriptions s JOIN organizations o ON o.id = s.organization_id WHERE s.id = $1", [sub.id]);
    expect(state.rows[0]).toEqual({ status: "canceled", org: "suspended", status_reason_code: "subscription_ended" });
    const second = await f.webhook(f.fake.subscriptionEvent("SUBSCRIPTION_DELETED", { id: sub.provider_subscription_id, deleted: true }));
    expect(second.status).toBe(200);
  });

  it("ignores events for unknown payments but keeps them stored", async () => {
    const response = await f.webhook(f.fake.paymentEvent("PAYMENT_RECEIVED", paid("sub_que_nao_existe", "pay_z"), "evt_unknown"));
    expect(response.status).toBe(200);
    const row = await f.ctx.db.query("SELECT status FROM billing_events WHERE event_id = 'evt_unknown'");
    expect(row.rows[0]).toEqual({ status: "ignored" });
  });

  it("a credit purchase (Pix) credits the extra bucket when paid", async () => {
    const org = await f.newClient();
    const charge = await f.api.post(`/api/clients/${org}/credit-charge`, { credits: 5000, billingType: "PIX" });
    expect(charge.status).toBe(201);
    expect(charge.data).toMatchObject({ credits: 5000, valueCents: 5000 });
    expect(charge.data.pix.payload).toContain("br.gov.bcb.pix");
    expect(f.fake.payments.get(charge.data.providerPaymentId)).toMatchObject({ value: 50, billingType: "PIX" });
    await f.webhook(f.fake.paymentEvent("PAYMENT_RECEIVED", { id: charge.data.providerPaymentId, value: 50, status: "RECEIVED", billingType: "PIX" }));
    expect(await f.wallet(org)).toEqual({ plan: 0, extra: 5000 });
  });

  it("an extra computer (VPS) per bot raises the recurring value at Asaas", async () => {
    const org = await f.newClient();
    const sub = await f.subscribe(org, "profissional");
    const addon = (await f.api.get("/api/plans")).data.addons[0];
    expect(addon).toMatchObject({ code: "computador-adicional", price_cents: 15900, unit: "per_bot" });
    const response = await f.api.post(`/api/clients/${org}/subscription/addons`, { addonId: addon.id, quantity: 2 });
    expect(response.data.totalCents).toBe(59900 + 2 * 15900);
    expect(f.fake.subscriptions.get(sub.provider_subscription_id)!.value).toBe(917);
  });

  it("canceling a subscription cancels it at Asaas first", async () => {
    const org = await f.newClient();
    const sub = await f.subscribe(org);
    const response = await f.api.post(`/api/clients/${org}/subscription/cancel`, { reason: "cliente pediu o cancelamento" });
    expect(response.status).toBe(200);
    expect(f.fake.subscriptions.get(sub.provider_subscription_id)!.deleted).toBe(true);
    expect((await f.ctx.db.query("SELECT status FROM subscriptions WHERE id = $1", [sub.id])).rows[0]).toEqual({ status: "canceled" });
  });
});

describe("régua de inadimplência", () => {
  let f: BillingFixture;
  beforeEach(async () => {
    f = await billingFixture();
  });
  afterEach(() => f.close());

  async function overdueClient() {
    const org = await f.newClient();
    const sub = await f.subscribe(org);
    await f.webhook(f.fake.paymentEvent("PAYMENT_RECEIVED", paid(sub.provider_subscription_id, `pay_${org.slice(0, 6)}_1`)));
    await f.webhook(f.fake.paymentEvent("PAYMENT_OVERDUE", { ...paid(sub.provider_subscription_id, `pay_${org.slice(0, 6)}_2`), status: "OVERDUE", dueDate: "2026-12-25" }));
    return { org, sub };
  }

  const state = async (org: string) => (await f.ctx.db.query(
    "SELECT o.status AS org, o.status_reason_code AS code, s.status AS sub FROM organizations o JOIN subscriptions s ON s.organization_id = o.id WHERE o.id = $1 ORDER BY s.created_at DESC LIMIT 1", [org])).rows[0];

  it("suspends after 7 days overdue, cancels after 30, and cancels at Asaas through the queue", async () => {
    const { org, sub } = await overdueClient();
    advance(f.ctx, 6 * DAY);
    await tick(f.ctx);
    expect(await state(org)).toEqual({ org: "active", code: null, sub: "past_due" });

    advance(f.ctx, 1 * DAY + 1000);
    expect((await tick(f.ctx)).dunning.suspended).toBe(1);
    expect(await state(org)).toEqual({ org: "suspended", code: "billing", sub: "suspended" });
    expect((await tick(f.ctx)).dunning.suspended).toBe(0);

    advance(f.ctx, 23 * DAY);
    const summary = await tick(f.ctx);
    expect(summary.dunning.canceled).toBe(1);
    expect(summary.jobs.done).toBe(1);
    expect(await state(org)).toEqual({ org: "canceled", code: "subscription_ended", sub: "canceled" });
    expect(f.fake.subscriptions.get(sub.provider_subscription_id)!.deleted).toBe(true);
  });

  it("paying while suspended for billing reactivates the client", async () => {
    const { org, sub } = await overdueClient();
    advance(f.ctx, 8 * DAY);
    await tick(f.ctx);
    expect((await state(org))!.org).toBe("suspended");
    await f.webhook(f.fake.paymentEvent("PAYMENT_RECEIVED", paid(sub.provider_subscription_id, `pay_${org.slice(0, 6)}_2`, 159, { dueDate: "2026-12-25" })));
    expect(await state(org)).toEqual({ org: "active", code: null, sub: "active" });
  });

  it("a manual suspension is not lifted by a payment", async () => {
    const { org, sub } = await overdueClient();
    expect((await f.api.post(`/api/clients/${org}/status`, { action: "suspend", reason: "uso abusivo investigado" })).status).toBe(200);
    await f.webhook(f.fake.paymentEvent("PAYMENT_RECEIVED", paid(sub.provider_subscription_id, `pay_${org.slice(0, 6)}_2`, 159, { dueDate: "2026-12-25" })));
    expect(await state(org)).toEqual({ org: "suspended", code: "manual", sub: "active" });
    expect((await f.api.post(`/api/clients/${org}/status`, { action: "reactivate", reason: "investigação concluída" })).status).toBe(200);
    expect((await state(org))!.org).toBe("active");
    const audit = await f.ctx.db.query<{ action: string; reason: string }>("SELECT action, reason FROM audit_log WHERE organization_id = $1 AND action LIKE 'organization.%' ORDER BY id", [org]);
    expect(audit.rows.map((r) => r.action)).toEqual(["organization.created", "organization.suspended", "organization.reactivated"]);
    expect(audit.rows[1]!.reason).toBe("uso abusivo investigado");
  });
});
