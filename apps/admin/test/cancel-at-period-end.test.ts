import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { endScheduledCancellations } from "../src/billing/cancel-at-period-end.ts";
import { cancellationNotice, cancelTiming, lastPaidDay } from "../src/customer/catalog.ts";
import { tick } from "../src/jobs/handlers.ts";
import { billingFixture, type BillingFixture } from "./billing-fixture.ts";
import { advance, cnpj, customerClient, DAY, type TestContext } from "./helpers.ts";

function codeFrom(ctx: TestContext, to: string): string {
  const last = [...ctx.mailer.sent].reverse().find((mail) => mail.to === to);
  const match = last?.text.match(/(\d{4})-(\d{4})/);
  if (!match) throw new Error("nenhum código enviado");
  return `${match[1]}${match[2]}`;
}

let seq = 0;

async function signIn(ctx: TestContext, email: string) {
  const anonymous = customerClient(ctx);
  await anonymous.post("/api/conta/auth/otp/request", { email });
  const verified = await anonymous.post("/api/conta/auth/otp/verify", { email, code: codeFrom(ctx, email) });
  return customerClient(ctx, (verified.headers.get("set-cookie") ?? "").split(";")[0]!);
}

/** A signed-up customer; `signIn` again after moving the clock past the session's life. */
async function customer(ctx: TestContext) {
  const email = `cliente${++seq}@loja.com.br`;
  const api = await signIn(ctx, email);
  const done = await api.post("/api/conta/cadastro", {
    name: "Bia Lima", phone: "(11) 98765-4321", companyName: `Loja ${seq}`, documentType: "cnpj",
    document: cnpj(String(400000000000 + seq * 7919).slice(0, 12)), acceptTerms: true,
  });
  if (done.status !== 200) throw new Error(JSON.stringify(done.data));
  return { orgId: done.data.organization.id as string, api, signIn: () => signIn(ctx, email) };
}

interface SubState { id: string; status: string; cancel_at: Date | null; provider_subscription_id: string; cancel_reason: string | null }

describe("cancelamento pelo cliente no fim do período pago", () => {
  let f: BillingFixture;
  beforeEach(async () => {
    f = await billingFixture();
  });
  afterEach(() => f.close());

  const subOf = async (orgId: string) => (await f.ctx.db.query<SubState>(
    "SELECT id, status, cancel_at, provider_subscription_id, cancel_reason FROM subscriptions WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1", [orgId])).rows[0]!;
  const orgOf = async (orgId: string) => (await f.ctx.db.query<{ status: string; status_reason_code: string | null }>(
    "SELECT status, status_reason_code FROM organizations WHERE id = $1", [orgId])).rows[0]!;
  const instanceState = async (orgId: string) => (await f.ctx.db.query<{ state: string }>(
    "SELECT state FROM instances WHERE organization_id = $1 AND decommissioned_at IS NULL", [orgId])).rows[0]?.state;

  /** Essencial by Pix on 25/11, paid that day: the paid period runs to 25/12, with an instance running. */
  async function paidCustomer() {
    const { api, orgId, signIn: again } = await customer(f.ctx);
    expect((await api.post("/api/conta/assinatura", { plan: "essencial", billingType: "PIX" })).status).toBe(201);
    const sub = await subOf(orgId);
    const first = [...f.fake.payments.values()].find((payment) => payment.subscription === sub.provider_subscription_id)!;
    await f.webhook(f.fake.paymentEvent("PAYMENT_RECEIVED", {
      id: first.id, subscription: sub.provider_subscription_id, value: 159, status: "RECEIVED", billingType: "PIX", dueDate: "2026-11-25", paymentDate: "2026-11-25",
    }));
    expect((await subOf(orgId)).status).toBe("active");
    await f.ctx.db.query("DELETE FROM instances WHERE organization_id = $1", [orgId]);
    await f.ctx.db.query(
      "INSERT INTO instances (organization_id, subscription_id, slug, machine_id, mode, state) VALUES ($1, $2, $3, $4, 'dedicated', 'ready')",
      [orgId, sub.id, `loja-${seq}`, `mach-loja-${seq}`]);
    return { orgId, sub, signIn: again };
  }

  it("stops the charges at once but keeps the ArkoBot running until the paid period ends, then stops it and keeps the data", async () => {
    const { orgId, sub, signIn: login } = await paidCustomer();
    advance(f.ctx, 10 * DAY);
    const api = await login();

    const canceled = await api.post("/api/conta/assinatura/cancelar", { reason: "Vou pausar o projeto" });
    expect(canceled.status).toBe(200);
    expect(canceled.data).toEqual({ ok: true, withinWithdrawalPeriod: false, duringTrial: false, endsAt: "2026-12-25T03:00:00.000Z" });
    expect(f.fake.subscriptions.get(sub.provider_subscription_id)!.deleted).toBe(true);
    expect(await subOf(orgId)).toMatchObject({ status: "active", cancel_at: new Date("2026-12-25T03:00:00Z"), cancel_reason: "Cancelado pelo cliente: Vou pausar o projeto" });
    expect(await instanceState(orgId)).toBe("ready");
    expect(await orgOf(orgId)).toEqual({ status: "active", status_reason_code: null });

    const panel = await api.get("/api/conta/painel");
    expect(panel.data.subscription).toMatchObject({ status: "active" });
    expect(cancellationNotice(panel.data.subscription.cancel_at)).toBe("Cancelamento agendado para 25/12");
    expect(lastPaidDay(panel.data.subscription.cancel_at)).toBe("24/12");

    // Asaas tells us the subscription it just deleted is gone: the scheduled end stands
    await f.webhook(f.fake.subscriptionEvent("SUBSCRIPTION_DELETED", { id: sub.provider_subscription_id, status: "INACTIVE", deleted: true }));
    expect((await subOf(orgId)).status).toBe("active");
    expect(await instanceState(orgId)).toBe("ready");

    expect((await api.post("/api/conta/assinatura/cancelar", { reason: "de novo" })).status).toBe(409);
    expect((await api.post("/api/conta/assinatura/computadores", { quantity: 1 })).status).toBe(409);

    f.ctx.clock.now = new Date("2026-12-25T02:59:00Z");
    expect((await tick(f.ctx)).scheduledCancellations).toBe(0);
    expect(await instanceState(orgId)).toBe("ready");

    f.ctx.clock.now = new Date("2026-12-25T03:05:00Z");
    expect((await tick(f.ctx)).scheduledCancellations).toBe(1);
    expect(await subOf(orgId)).toMatchObject({ status: "canceled", cancel_reason: "Cancelado pelo cliente: Vou pausar o projeto" });
    expect(await orgOf(orgId)).toEqual({ status: "suspended", status_reason_code: "subscription_ended" });
    expect(await instanceState(orgId)).toBe("stopped");
    expect(await endScheduledCancellations(f.ctx)).toBe(0);
    const later = await login();
    expect((await later.post("/api/conta/assinatura/desfazer-cancelamento")).status).toBe(404);
    expect((await later.get("/api/conta/painel")).data.subscription.status).toBe("canceled");
  });

  it("undoing before the date starts a new Asaas subscription charging on the old due date, and nothing ends", async () => {
    const { orgId, sub, signIn: login } = await paidCustomer();
    advance(f.ctx, 12 * DAY);
    const api = await login();
    await api.post("/api/conta/assinatura/cancelar", { reason: "Caro demais" });

    const undone = await api.post("/api/conta/assinatura/desfazer-cancelamento");
    expect(undone.status).toBe(200);
    const after = await subOf(orgId);
    expect(after).toMatchObject({ status: "active", cancel_at: null, cancel_reason: null });
    expect(after.provider_subscription_id).not.toBe(sub.provider_subscription_id);
    expect(f.fake.subscriptions.get(after.provider_subscription_id)).toMatchObject({
      deleted: false, value: 159, billingType: "PIX", nextDueDate: "2026-12-25", cycle: "MONTHLY", externalReference: `sub:${sub.id}`,
    });
    expect((await api.post("/api/conta/assinatura/desfazer-cancelamento")).status).toBe(404);

    // a late notice about the old, deleted subscription changes nothing
    await f.webhook(f.fake.subscriptionEvent("SUBSCRIPTION_DELETED", { id: sub.provider_subscription_id, status: "INACTIVE", deleted: true }));
    f.ctx.clock.now = new Date("2026-12-26T12:00:00Z");
    expect((await tick(f.ctx)).scheduledCancellations).toBe(0);
    expect((await subOf(orgId)).status).toBe("active");
    expect(await instanceState(orgId)).toBe("ready");
    const audit = await f.ctx.db.query<{ action: string }>(
      "SELECT action FROM audit_log WHERE organization_id = $1 AND action LIKE 'subscription.cancel%' ORDER BY id", [orgId]);
    expect(audit.rows.map((row) => row.action)).toEqual(["subscription.cancel_scheduled", "subscription.canceled_by_customer", "subscription.cancel_undone"]);
  });

  it("a failure at Asaas leaves nothing scheduled", async () => {
    const { orgId, sub, signIn: login } = await paidCustomer();
    advance(f.ctx, 10 * DAY);
    const api = await login();
    f.fake.apiKey = "outra-chave";
    expect((await api.post("/api/conta/assinatura/cancelar", { reason: "Vou pausar" })).status).toBe(502);
    expect(await subOf(orgId)).toMatchObject({ status: "active", cancel_at: null });
    expect(f.fake.subscriptions.get(sub.provider_subscription_id)!.deleted).toBe(false);
  });

  it("within the 7-day withdrawal window the cancellation is immediate (the payment is refunded)", async () => {
    const { orgId, signIn: login } = await paidCustomer();
    advance(f.ctx, 3 * DAY);
    const api = await login();
    const canceled = await api.post("/api/conta/assinatura/cancelar", { reason: "Desisti" });
    expect(canceled.data).toEqual({ ok: true, withinWithdrawalPeriod: true, duringTrial: false, endsAt: null });
    expect((await subOf(orgId)).status).toBe("canceled");
    expect(await instanceState(orgId)).toBe("stopped");
  });

  it("an overdue subscription has no paid period left: canceling ends it at once, and the dunning ladder is unchanged", async () => {
    const { orgId, sub, signIn: login } = await paidCustomer();
    advance(f.ctx, 31 * DAY);
    const api = await login();
    await f.webhook(f.fake.paymentEvent("PAYMENT_OVERDUE", {
      id: "pay_atrasado", subscription: sub.provider_subscription_id, value: 159, status: "OVERDUE", billingType: "PIX", dueDate: "2026-12-25",
    }));
    expect((await subOf(orgId)).status).toBe("past_due");
    expect(await instanceState(orgId)).toBe("payment_problem");
    const canceled = await api.post("/api/conta/assinatura/cancelar", { reason: "Não vou pagar" });
    expect(canceled.data.endsAt).toBeNull();
    expect((await subOf(orgId)).status).toBe("canceled");
    expect(await instanceState(orgId)).toBe("stopped");
  });

  it("the trial ends at once with nothing charged", () => {
    const now = new Date("2026-11-28T12:00:00Z");
    const base = { status: "active", courtesy: false, price_cents: 3900, created_at: "2026-11-25T12:00:00Z", current_period_end: "2026-12-02T12:00:00Z" };
    expect(cancelTiming({ ...base, trial_ends_at: "2026-12-02T12:00:00Z" }, now)).toEqual({ kind: "trial" });
    expect(cancelTiming({ ...base, trial_ends_at: null }, now)).toEqual({ kind: "withdrawal" });
    expect(cancelTiming({ ...base, trial_ends_at: null, created_at: "2026-11-01T12:00:00Z" }, now))
      .toEqual({ kind: "period_end", endsAt: new Date("2026-12-02T03:00:00Z") });
    expect(cancelTiming({ ...base, trial_ends_at: null, created_at: "2026-11-01T12:00:00Z", courtesy: true }, now)).toEqual({ kind: "unpaid" });
    expect(cancelTiming({ ...base, trial_ends_at: null, created_at: "2026-11-01T12:00:00Z", status: "past_due" }, now)).toEqual({ kind: "unpaid" });
  });
});
