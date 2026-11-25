import { SYSTEM } from "../src/audit.ts";
import { postLedger } from "../src/credits/ledger.ts";
import { createGatewayApp } from "../src/gateway/app.ts";
import type { UsageAlert } from "../src/gateway/accounting.ts";
import { issueGatewayToken } from "../src/gateway/tokens.ts";
import { fakeAi } from "./fake-ai.ts";
import { client, cnpj, cpf, sessionCookie, testContext, type TestContext } from "./helpers.ts";

export const HOSTS = { anthropic: "anthropic.fake", openai: "openai.fake", openrouter: "openrouter.fake" } as const;

export async function addProviderKey(ctx: TestContext, provider: string, baseUrl: string, priority = 100, secret = `sk-${provider}-${priority}`): Promise<string> {
  const { rows } = await ctx.db.query<{ id: string }>(
    "INSERT INTO ai_provider_keys (provider, label, base_url, api_key_enc, api_key_fingerprint, priority) VALUES ($1, $2, $3, 'pending', 'fp', $4) RETURNING id",
    [provider, `${provider} ${priority}`, baseUrl, priority]);
  const id = rows[0]!.id;
  await ctx.db.query("UPDATE ai_provider_keys SET api_key_enc = $2 WHERE id = $1", [id, ctx.box.encrypt(secret, `ai_provider_keys.api_key:${id}`)]);
  return id;
}

let seq = 0;

/** A paying customer (plan `planCode`, active subscription, `credits` plan credits), provider keys on the fake hosts and one gateway token. */
export async function gatewayFixture(options: { planCode?: string; credits?: number; ctx?: TestContext } = {}) {
  const ctx = options.ctx ?? await testContext();
  const ai = fakeAi();
  ctx.fetch = ai.fetch;
  const alerts: UsageAlert[] = [];
  const gateway = createGatewayApp({ ...ctx, notifier: { notify: async (alert) => { alerts.push(alert); } } });
  const admin = client(ctx, await sessionCookie(ctx));
  seq++;
  const created = await admin.post("/api/clients", {
    name: `Clínica Teste ${seq}`, document: cnpj(`5566677700${String(10 + seq).padStart(2, "0")}`), ownerEmail: `dono${seq}@clinica.com.br`, ownerName: "Dona",
  });
  const organizationId: string = created.data.client.id;
  const billing = (await ctx.db.query<{ id: string }>(
    `INSERT INTO billing_accounts (label, holder_type, holder_name, holder_document, environment, api_key_enc, api_key_fingerprint, webhook_token_enc)
     VALUES ($1, 'pf', 'Otávio', $2, 'sandbox', 'x', 'x', 'x') RETURNING id`, [`PF ${seq}`, cpf("123456789")])).rows[0]!.id;
  const plan = (await ctx.db.query<{ id: string; price_cents: number; credits_per_month: number }>(
    "SELECT id, price_cents, credits_per_month FROM plans WHERE code = $1", [options.planCode ?? "essencial"])).rows[0]!;
  const subscription = (await ctx.db.query<{ id: string }>(
    `INSERT INTO subscriptions (organization_id, plan_id, billing_account_id, status, price_cents, credits_per_month, current_period_start, current_period_end)
     VALUES ($1, $2, $3, 'active', $4, $5, $6, $7) RETURNING id`,
    [organizationId, plan.id, billing, plan.price_cents, plan.credits_per_month, new Date(ctx.now().getTime() - 86_400_000), new Date(ctx.now().getTime() + 29 * 86_400_000)])).rows[0]!.id;
  const credits = options.credits ?? 4000;
  if (credits > 0) {
    await ctx.db.tx((q) => postLedger(q, { organizationId, bucket: "plan", kind: "plan_grant", amount: credits, externalReference: `grant:${organizationId}` }));
  }
  if (!(await ctx.db.query("SELECT 1 FROM ai_provider_keys")).rows.length) {
    for (const [provider, host] of Object.entries(HOSTS)) await addProviderKey(ctx, provider, `https://${host}`);
  }
  const issued = await issueGatewayToken(ctx.db, SYSTEM, { organizationId, label: "instância de teste" });

  const call = (path: string, body: unknown, headers: Record<string, string> = {}, init: RequestInit = {}) =>
    gateway.app.request(path, {
      method: "POST",
      headers: { authorization: `Bearer ${issued.token}`, "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
      ...init,
    });
  const wallet = async () => {
    const row = (await ctx.db.query<{ plan_balance: number; extra_balance: number }>("SELECT plan_balance, extra_balance FROM credit_wallets WHERE organization_id = $1", [organizationId])).rows[0]!;
    return { plan: Number(row.plan_balance), extra: Number(row.extra_balance), total: Number(row.plan_balance) + Number(row.extra_balance) };
  };
  const setSettings = (values: Record<string, number>) => ctx.db.query(
    `UPDATE gateway_settings SET ${Object.keys(values).map((key, i) => `${key} = $${i + 1}`).join(", ")}`, Object.values(values));
  return { ctx, ai, gateway, admin, organizationId, subscription, token: issued.token, tokenId: issued.id, call, wallet, alerts, setSettings };
}

export type GatewayFixture = Awaited<ReturnType<typeof gatewayFixture>>;
