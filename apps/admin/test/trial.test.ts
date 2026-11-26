import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runDunning, TRIAL_GRACE_DAYS } from "../src/billing/service.ts";
import { trialCredits } from "../src/billing/trial.ts";
import { trialNotice } from "../src/customer/catalog.ts";
import { billingFixture, type BillingFixture } from "./billing-fixture.ts";
import { advance, cnpj, customerClient, DAY, type TestContext } from "./helpers.ts";

function codeFrom(ctx: TestContext, to: string): string {
  const last = [...ctx.mailer.sent].reverse().find((mail) => mail.to === to);
  const match = last?.text.match(/(\d{4})-(\d{4})/);
  if (!match) throw new Error("nenhum código enviado");
  return `${match[1]}${match[2]}`;
}

let docSeq = 0;
const newDocument = () => cnpj(String(300000000000 + ++docSeq * 7919).slice(0, 12));

async function customer(ctx: TestContext, email: string, document = newDocument()) {
  const anonymous = customerClient(ctx);
  await anonymous.post("/api/conta/auth/otp/request", { email });
  const verified = await anonymous.post("/api/conta/auth/otp/verify", { email, code: codeFrom(ctx, email) });
  const cookie = (verified.headers.get("set-cookie") ?? "").split(";")[0]!;
  const api = customerClient(ctx, cookie);
  const done = await api.post("/api/conta/cadastro", {
    name: "Ana Souza", phone: "(11) 98765-4321", companyName: `Escritório ${docSeq}`, documentType: "cnpj", document, acceptTerms: true,
  });
  if (done.status !== 200) throw new Error(JSON.stringify(done.data));
  return { api, orgId: done.data.organization.id as string, document };
}

type SubRow = { id: string; status: string; trial_ends_at: Date | null; current_period_end: Date | null; next_due_date: string; provider_subscription_id: string };
const subOf = async (f: BillingFixture, orgId: string) => (await f.ctx.db.query<SubRow>(
  "SELECT id, status, trial_ends_at, current_period_end, next_due_date, provider_subscription_id FROM subscriptions WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1",
  [orgId])).rows[0]!;
const firstPayment = (f: BillingFixture, remoteId: string) => [...f.fake.payments.values()].find((payment) => payment.subscription === remoteId)!;

describe("teste grátis do plano", () => {
  let f: BillingFixture;
  beforeEach(async () => {
    f = await billingFixture();
  });
  afterEach(() => f.close());

  it("starts Inicial active at once, with the first Asaas charge due when the 7 free days end", async () => {
    const { api, orgId } = await customer(f.ctx, "ana@escritorio.com.br");
    expect((await api.get("/api/conta/auth/session")).data.trialAvailable).toBe(true);
    const catalog = await api.get("/api/conta/planos");
    expect(catalog.data.plans[0]).toMatchObject({ code: "inicial", trial_days: 7, price_cents: 3900, free_requests_per_day: 200 });

    const created = await api.post("/api/conta/assinatura", { plan: "inicial", billingType: "PIX" });
    expect(created.status).toBe(201);
    expect(created.data.status).toBe("active");
    expect(new Date(created.data.trialEndsAt).toISOString()).toBe("2026-12-02T12:00:00.000Z");

    const sub = await subOf(f, orgId);
    expect(sub).toMatchObject({ status: "active", next_due_date: "2026-12-02" });
    expect(sub.trial_ends_at!.toISOString()).toBe("2026-12-02T12:00:00.000Z");
    expect(sub.current_period_end!.toISOString()).toBe("2026-12-02T12:00:00.000Z");
    expect(f.fake.subscriptions.get(sub.provider_subscription_id)).toMatchObject({ value: 39, nextDueDate: "2026-12-02", cycle: "MONTHLY" });
    const trial = await f.ctx.db.query("SELECT organization_id, subscription_id FROM subscription_trials");
    expect(trial.rows).toEqual([{ organization_id: orgId, subscription_id: sub.id }]);

    const panel = await api.get("/api/conta/painel");
    expect(panel.data.subscription).toMatchObject({ status: "active", plan_code: "inicial", free_requests_per_day: 200, next_due_date: "2026-12-02" });
    expect(trialNotice(panel.data.subscription.trial_ends_at, panel.data.subscription.next_due_date)).toBe("Teste grátis até 02/12 — a primeira cobrança vem em 02/12");
    expect(panel.data.upgrade).toEqual({ code: "essencial", name: "Essencial", unlocks: "bots que trabalham sozinhos + créditos de IA inclusos" });
    expect(panel.data.freeRequestsToday).toBe(0);
    expect(panel.data.payments).toEqual([expect.objectContaining({ status: "pending", due_date: "2026-12-02", value_cents: 3900 })]);
    expect(panel.data.wallet).toEqual({ plan: 0, extra: 0 });
    expect((await api.get("/api/conta/auth/session")).data.trialAvailable).toBe(false);

    const detail = await f.api.get(`/api/clients/${orgId}`);
    expect(new Date(detail.data.subscription.trial_ends_at).toISOString()).toBe("2026-12-02T12:00:00.000Z");
    expect(detail.data.freeRequestsToday).toBe(0);
    const audit = await f.ctx.db.query("SELECT action FROM audit_log WHERE action = 'subscription.trial_started'");
    expect(audit.rows).toHaveLength(1);
  });

  it("grants a paid plan's credits for the trial days, then the full quota from the first payment", async () => {
    await f.ctx.db.query("UPDATE plans SET trial_days = 7 WHERE code = 'essencial'");
    const { api, orgId } = await customer(f.ctx, "bia@escritorio.com.br");
    await api.post("/api/conta/assinatura", { plan: "essencial", billingType: "PIX" });
    expect(trialCredits(4000, 7)).toBe(934);
    expect(await f.wallet(orgId)).toEqual({ plan: 934, extra: 0 });

    const sub = await subOf(f, orgId);
    const payment = firstPayment(f, sub.provider_subscription_id);
    advance(f.ctx, 7 * DAY);
    await f.webhook(f.fake.paymentEvent("PAYMENT_RECEIVED", {
      id: payment.id, subscription: sub.provider_subscription_id, value: 159, status: "RECEIVED", billingType: "PIX", dueDate: "2026-12-02", paymentDate: "2026-12-02",
    }));
    expect(await f.wallet(orgId)).toEqual({ plan: 4000, extra: 0 });
    const after = await subOf(f, orgId);
    expect(after.status).toBe("active");
    expect(after.current_period_end!.toISOString().slice(0, 10)).toBe("2027-01-02");
    expect(after.next_due_date).toBe("2027-01-02");
  });

  it("gives one trial per organisation: a second subscription is charged right away", async () => {
    const { api, orgId } = await customer(f.ctx, "caio@escritorio.com.br");
    await api.post("/api/conta/assinatura", { plan: "inicial", billingType: "PIX" });
    await api.post("/api/conta/assinatura/cancelar", { reason: "Testando de novo" });
    const again = await api.post("/api/conta/assinatura", { plan: "inicial", billingType: "PIX" });
    expect(again.data).toMatchObject({ status: "pending", trialEndsAt: null });
    const sub = await subOf(f, orgId);
    expect(sub).toMatchObject({ status: "pending", trial_ends_at: null, next_due_date: "2026-11-25" });
    expect(f.fake.subscriptions.get(sub.provider_subscription_id)).toMatchObject({ nextDueDate: "2026-11-25" });
  });

  it("gives one trial per CPF/CNPJ, even after the organisation's document is corrected", async () => {
    const first = await customer(f.ctx, "davi@escritorio.com.br");
    await first.api.post("/api/conta/assinatura", { plan: "inicial", billingType: "PIX" });
    await f.ctx.db.query("UPDATE organizations SET document = $2 WHERE id = $1", [first.orgId, newDocument()]);

    const second = await customer(f.ctx, "eva@outra.com.br", first.document);
    expect((await second.api.get("/api/conta/auth/session")).data.trialAvailable).toBe(false);
    const created = await second.api.post("/api/conta/assinatura", { plan: "inicial", billingType: "PIX" });
    expect(created.data).toMatchObject({ status: "pending", trialEndsAt: null });
    await expect(f.ctx.db.query(
      "INSERT INTO subscription_trials (document, organization_id, subscription_id, plan_id, started_at, ends_at) SELECT $1, $2, s.id, s.plan_id, now(), now() + interval '7 days' FROM subscriptions s WHERE s.organization_id = $2",
      [first.document, second.orgId])).rejects.toThrow();
  });

  it("gives no trial to whoever already paid a subscription", async () => {
    const { api, orgId } = await customer(f.ctx, "fabio@escritorio.com.br");
    await api.post("/api/conta/assinatura", { plan: "essencial", billingType: "PIX" });
    const sub = await subOf(f, orgId);
    const payment = firstPayment(f, sub.provider_subscription_id);
    await f.webhook(f.fake.paymentEvent("PAYMENT_RECEIVED", {
      id: payment.id, subscription: sub.provider_subscription_id, value: 159, status: "RECEIVED", billingType: "PIX", dueDate: "2026-11-25", paymentDate: "2026-11-25",
    }));
    await api.post("/api/conta/assinatura/cancelar", { reason: "Vou para o Inicial" });
    expect((await api.get("/api/conta/auth/session")).data.trialAvailable).toBe(false);
    expect((await api.post("/api/conta/assinatura", { plan: "inicial", billingType: "PIX" })).data.status).toBe("pending");
  });

  it("runs the overdue ladder when the first charge after the trial is not paid", async () => {
    const { api, orgId } = await customer(f.ctx, "gil@escritorio.com.br");
    await api.post("/api/conta/assinatura", { plan: "inicial", billingType: "PIX" });
    const sub = await subOf(f, orgId);
    const payment = firstPayment(f, sub.provider_subscription_id);

    advance(f.ctx, 6 * DAY);
    expect((await runDunning(f.ctx)).trialsOverdue).toBe(0);
    advance(f.ctx, 2 * DAY);
    await f.webhook(f.fake.paymentEvent("PAYMENT_OVERDUE", {
      id: payment.id, subscription: sub.provider_subscription_id, value: 39, status: "OVERDUE", billingType: "PIX", dueDate: "2026-12-02",
    }));
    expect((await subOf(f, orgId)).status).toBe("past_due");

    advance(f.ctx, 7 * DAY);
    expect((await runDunning(f.ctx)).suspended).toBe(1);
    expect((await subOf(f, orgId)).status).toBe("suspended");
    expect((await f.ctx.db.query("SELECT status, status_reason_code FROM organizations WHERE id = $1", [orgId])).rows[0])
      .toEqual({ status: "suspended", status_reason_code: "billing" });

    await f.webhook(f.fake.paymentEvent("PAYMENT_RECEIVED", {
      id: payment.id, subscription: sub.provider_subscription_id, value: 39, status: "RECEIVED", billingType: "PIX", dueDate: "2026-12-02", paymentDate: "2026-12-10",
    }));
    const paid = await subOf(f, orgId);
    expect(paid.status).toBe("active");
    expect(paid.current_period_end!.toISOString().slice(0, 10)).toBe("2027-01-02");
    expect((await f.ctx.db.query("SELECT status FROM organizations WHERE id = $1", [orgId])).rows[0]).toEqual({ status: "active" });
  });

  it("marks an unpaid trial overdue on its own when Asaas's notice never arrives", async () => {
    const { api, orgId } = await customer(f.ctx, "hugo@escritorio.com.br");
    await api.post("/api/conta/assinatura", { plan: "inicial", billingType: "BOLETO" });
    expect((await subOf(f, orgId)).next_due_date).toBe("2026-12-02");
    advance(f.ctx, (7 + TRIAL_GRACE_DAYS) * DAY + 60_000);
    expect((await runDunning(f.ctx)).trialsOverdue).toBe(1);
    expect((await subOf(f, orgId)).status).toBe("past_due");
    expect((await runDunning(f.ctx)).trialsOverdue).toBe(0);
  });

  it("cancels during the trial before anything is charged, with no refund to make", async () => {
    const { api, orgId } = await customer(f.ctx, "iris@escritorio.com.br");
    await api.post("/api/conta/assinatura", { plan: "inicial", billingType: "CREDIT_CARD" });
    advance(f.ctx, 3 * DAY);
    const canceled = await api.post("/api/conta/assinatura/cancelar", { reason: "Não era o que eu queria" });
    expect(canceled.data).toEqual({ ok: true, withinWithdrawalPeriod: false, duringTrial: true });
    const sub = await subOf(f, orgId);
    expect(sub.status).toBe("canceled");
    expect(f.fake.subscriptions.get(sub.provider_subscription_id)!.deleted).toBe(true);
    const payments = await f.ctx.db.query<{ status: string }>("SELECT status FROM payments WHERE organization_id = $1", [orgId]);
    expect(payments.rows.map((row) => row.status)).toEqual(["canceled"]);
    expect((await f.ctx.db.query("SELECT cancel_reason FROM subscriptions WHERE id = $1", [sub.id])).rows[0])
      .toEqual({ cancel_reason: "Cancelado pelo cliente durante o teste grátis: Não era o que eu queria" });
    expect((await runDunning(f.ctx)).trialsOverdue).toBe(0);
  });
});
