import { FakeAsaas } from "./fake-asaas.ts";
import { client, cnpj, cpf, sessionCookie, testContext, type TestContext } from "./helpers.ts";

export interface BillingFixture {
  ctx: TestContext;
  fake: FakeAsaas;
  api: ReturnType<typeof client>;
  accountId: string;
  webhookToken: string;
  plans: Record<string, { id: string; credits_per_month: number; price_cents: number }>;
  close(): Promise<void>;
  newClient(name?: string): Promise<string>;
  subscribe(orgId: string, planCode?: string): Promise<{ id: string; provider_subscription_id: string }>;
  webhook(body: unknown, token?: string): Promise<{ status: number; data: any }>;
  wallet(orgId: string): Promise<{ plan: number; extra: number }>;
}

let seq = 0;

export async function billingFixture(): Promise<BillingFixture> {
  const fake = new FakeAsaas();
  await fake.start();
  const ctx = await testContext({ asaasBaseUrlOverride: fake.baseUrl });
  const api = client(ctx, await sessionCookie(ctx, "owner"));
  const created = await api.post("/api/billing/accounts", {
    label: "Asaas PF (sandbox)", holderType: "pf", holderName: "Otávio", holderDocument: cpf("123456789"),
    environment: "sandbox", apiKey: fake.apiKey, activeForNew: true,
  });
  if (created.status !== 201) throw new Error(JSON.stringify(created.data));
  const plans = Object.fromEntries((await api.get("/api/plans")).data.plans.map((plan: any) => [plan.code, plan]));
  const fixture: BillingFixture = {
    ctx, fake, api, plans,
    accountId: created.data.account.id,
    webhookToken: created.data.webhookToken,
    close: async () => {
      await ctx.db.close();
      await fake.stop();
    },
    async newClient(name = `Cliente ${++seq}`) {
      const response = await api.post("/api/clients", {
        name, document: cnpj(String(100000000000 + seq * 7919).slice(0, 12)), ownerEmail: `dono${seq}@cliente.com.br`, ownerName: "Dono",
      });
      if (response.status !== 201) throw new Error(JSON.stringify(response.data));
      return response.data.client.id;
    },
    async subscribe(orgId, planCode = "essencial") {
      const response = await api.post(`/api/clients/${orgId}/subscription`, { planId: plans[planCode].id, billingType: "PIX", firstDueDate: "2026-11-25" });
      if (response.status !== 201) throw new Error(JSON.stringify(response.data));
      return response.data.subscription;
    },
    webhook(body, token = created.data.webhookToken) {
      return client(ctx).post(`/webhooks/asaas/${created.data.account.id}`, body, { "asaas-access-token": token });
    },
    async wallet(orgId) {
      const { rows } = await ctx.db.query<{ plan_balance: number; extra_balance: number }>("SELECT plan_balance, extra_balance FROM credit_wallets WHERE organization_id = $1", [orgId]);
      return { plan: Number(rows[0]?.plan_balance ?? 0), extra: Number(rows[0]?.extra_balance ?? 0) };
    },
  };
  return fixture;
}
