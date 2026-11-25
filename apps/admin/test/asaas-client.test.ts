import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AsaasClient, ASAAS_BASE_URLS, normalizeAsaasEvent } from "../src/billing/asaas.ts";
import { ProviderError } from "../src/billing/provider.ts";
import { FakeAsaas } from "./fake-asaas.ts";

describe("AsaasClient (API v3) contra um Asaas falso", () => {
  const fake = new FakeAsaas();
  let asaas: AsaasClient;
  beforeAll(async () => {
    await fake.start();
    asaas = new AsaasClient({ apiKey: fake.apiKey, environment: "sandbox", baseUrlOverride: fake.baseUrl });
  });
  afterAll(() => fake.stop());

  it("points at the official hosts", () => {
    expect(ASAAS_BASE_URLS.production).toBe("https://api.asaas.com/v3");
    expect(ASAAS_BASE_URLS.sandbox).toBe("https://api-sandbox.asaas.com/v3");
  });

  it("sends the key in access_token with a User-Agent and creates a customer with CPF/CNPJ", async () => {
    const customer = await asaas.createCustomer({ name: "Maria", cpfCnpj: "52998224725", email: "maria@ex.com", externalReference: "org:1" });
    const request = fake.requests.at(-1)!;
    expect(request.headers.access_token).toBe(fake.apiKey);
    expect(request.headers["user-agent"]).toMatch(/ArkoBot/);
    expect(request.body).toMatchObject({ name: "Maria", cpfCnpj: "52998224725", externalReference: "org:1" });
    expect(customer.id).toMatch(/^cus_/);
  });

  it("refuses to create a customer without CPF/CNPJ before calling Asaas", async () => {
    const before = fake.requests.length;
    await expect(asaas.createCustomer({ name: "Sem doc", cpfCnpj: "", externalReference: "org:2" })).rejects.toBeInstanceOf(ProviderError);
    expect(fake.requests.length).toBe(before);
  });

  it("creates a monthly subscription with value in reais", async () => {
    const { id: customerId } = await asaas.createCustomer({ name: "Ana", cpfCnpj: "11144477735", externalReference: "org:3" });
    const sub = await asaas.createSubscription({
      customerId, billingType: "PIX", valueCents: 15900, nextDueDate: "2026-12-01", cycle: "MONTHLY", description: "Plano", externalReference: "sub:1",
    });
    expect(sub.id).toMatch(/^sub_/);
    expect(fake.requests.at(-1)!.body).toMatchObject({ customer: customerId, billingType: "PIX", value: 159, nextDueDate: "2026-12-01", cycle: "MONTHLY" });
    await asaas.updateSubscriptionValue(sub.id, 31800, "Com adicional");
    expect(fake.subscriptions.get(sub.id)!.value).toBe(318);
    await asaas.cancelSubscription(sub.id);
    expect(fake.requests.at(-1)).toMatchObject({ method: "DELETE", path: `/subscriptions/${sub.id}` });
  });

  it.each(["PIX", "BOLETO", "CREDIT_CARD", "UNDEFINED"] as const)("accepts billing type %s", async (billingType) => {
    const { id: customerId } = await asaas.createCustomer({ name: "Ana", cpfCnpj: "11144477735", externalReference: "org:4" });
    await expect(asaas.createSubscription({
      customerId, billingType, valueCents: 59900, nextDueDate: "2026-12-01", cycle: "MONTHLY", description: "x", externalReference: "sub:x",
    })).resolves.toMatchObject({ status: "ACTIVE" });
  });

  it("creates a one-off charge and reads its Pix QR code", async () => {
    const { id: customerId } = await asaas.createCustomer({ name: "Ana", cpfCnpj: "11144477735", externalReference: "org:5" });
    const charge = await asaas.createCharge({ customerId, billingType: "PIX", valueCents: 5000, dueDate: "2026-11-30", description: "Créditos", externalReference: "credits:1" });
    expect(charge.valueCents).toBe(5000);
    const qr = await asaas.pixQrCode(charge.id);
    expect(qr.payload).toContain("br.gov.bcb.pix");
    expect(qr.encodedImage.length).toBeGreaterThan(0);
  });

  it("turns Asaas errors into ProviderError with the description", async () => {
    const error = await asaas.createSubscription({
      customerId: "cus_inexistente", billingType: "PIX", valueCents: 100, nextDueDate: "2026-12-01", cycle: "MONTHLY", description: "x", externalReference: "x",
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.status).toBe(400);
    expect(error.message).toBe("Cliente inexistente");
  });

  it("reports a wrong key on the credential check", async () => {
    const wrong = new AsaasClient({ apiKey: "errada", environment: "sandbox", baseUrlOverride: fake.baseUrl });
    expect(await wrong.checkCredentials()).toEqual({ ok: false, message: "Chave de API do Asaas inválida ou sem permissão" });
    expect((await asaas.checkCredentials()).ok).toBe(true);
  });

  it("normalises webhook bodies", () => {
    const event = normalizeAsaasEvent(fake.paymentEvent("PAYMENT_RECEIVED", { id: "pay_1", subscription: "sub_1", value: 159.9, status: "RECEIVED", paymentDate: "2026-11-25" }, "evt_1"));
    expect(event).toMatchObject({ id: "evt_1", type: "PAYMENT_RECEIVED", payment: { id: "pay_1", subscriptionId: "sub_1", valueCents: 15990, paidAt: "2026-11-25" } });
    expect(normalizeAsaasEvent({ event: "PAYMENT_RECEIVED" })).toBeNull();
    expect(normalizeAsaasEvent("lixo")).toBeNull();
  });
});
