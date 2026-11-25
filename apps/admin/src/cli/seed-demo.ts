// Demonstration data for local development and screenshots. Refuses to run in production
// and on a database that already has clients. Nothing here talks to Asaas.
import { randomUUID } from "node:crypto";
import { audit } from "../audit.ts";
import { apiKeyContext, webhookTokenContext } from "../billing/accounts.ts";
import { addMonths, isoDate } from "../billing/subscription-machine.ts";
import { grantPlanPeriod, postLedger } from "../credits/ledger.ts";
import type { Queryable } from "../db/db.ts";
import { brlCentsFor, costUsd, creditsFor, markupFor, priceFromRow, type PriceRow } from "../gateway/pricing.ts";
import { loadSettings } from "../gateway/accounting.ts";
import { fingerprint, randomToken, SecretBox, sha256Hex } from "../security/crypto.ts";
import { cliDb, loadDotEnv } from "./env.ts";

loadDotEnv();
if (process.env.NODE_ENV === "production") {
  console.error("seed:demo não roda em produção.");
  process.exit(1);
}
const box = new SecretBox(process.env.ADMIN_ENCRYPTION_KEY ?? "");
const db = cliDb();
const DAY = 86_400_000;
const now = new Date();
const ago = (days: number) => new Date(now.getTime() - days * DAY);

function cpf(base9: string): string {
  const digits = base9.split("").map(Number);
  for (const length of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += digits[i]! * (length + 1 - i);
    const rest = (sum * 10) % 11;
    digits.push(rest === 10 ? 0 : rest);
  }
  return digits.join("");
}

function cnpj(base12: string): string {
  const digits = base12.split("").map(Number);
  for (const weights of [[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]]) {
    const rest = weights.reduce((acc, weight, i) => acc + weight * digits[i]!, 0) % 11;
    digits.push(rest < 2 ? 0 : 11 - rest);
  }
  return digits.join("");
}

async function one<T>(q: Queryable, sql: string, params: unknown[]): Promise<T> {
  return (await q.query<T>(sql, params)).rows[0]!;
}

interface Demo {
  name: string;
  document: string;
  owner: [string, string];
  plan: string;
  status: "active" | "past_due" | "suspended" | "pending" | "canceled_org";
  months: number;
  billingType: string;
  addons?: number;
  usage?: number;
  purchase?: number;
  overdueDays?: number;
}

const CLIENTS: Demo[] = [
  { name: "Padaria Pão Quente Ltda.", document: cnpj("123456780001"), owner: ["Carlos Menezes", "carlos@paoquente.com.br"], plan: "essencial", status: "active", months: 3, billingType: "PIX", usage: 2310 },
  { name: "Clínica Sorriso Odontologia", document: cnpj("234567890001"), owner: ["Dra. Helena Prado", "helena@clinicasorriso.com.br"], plan: "profissional", status: "active", months: 5, billingType: "BOLETO", addons: 1, usage: 11870 },
  { name: "Mercado Bom Preço", document: cnpj("345678900001"), owner: ["Roberto Alves", "roberto@bompreco.com.br"], plan: "empresa", status: "active", months: 2, billingType: "CREDIT_CARD", addons: 2, usage: 26400, purchase: 20000 },
  { name: "Ana Paula Souza", document: cpf("529982247"), owner: ["Ana Paula Souza", "anapaula.souza@gmail.com"], plan: "essencial", status: "past_due", months: 2, billingType: "PIX", overdueDays: 3, usage: 3950 },
  { name: "Oficina do Zé", document: cnpj("456789010001"), owner: ["José Ferreira", "ze@oficinadoze.com.br"], plan: "essencial", status: "suspended", months: 4, billingType: "BOLETO", overdueDays: 9, usage: 4000 },
  { name: "Lima & Associados Advocacia", document: cnpj("567890120001"), owner: ["Marina Lima", "marina@limaadvocacia.com.br"], plan: "profissional", status: "pending", months: 0, billingType: "UNDEFINED" },
  { name: "Studio Fit Academia", document: cnpj("678901230001"), owner: ["Paulo Reis", "paulo@studiofit.com.br"], plan: "essencial", status: "canceled_org", months: 1, billingType: "PIX", usage: 1200 },
  { name: "Construtora Horizonte", document: cnpj("789012340001"), owner: ["Fernanda Costa", "fernanda@horizonte.eng.br"], plan: "profissional", status: "active", months: 1, billingType: "PIX", usage: 6820, purchase: 5000 },
];

const COMPANIES = ["Matriz", "Filial Centro", "Filial Zona Sul"];
const BOTS = ["Atendimento", "Agenda", "Financeiro", "Vendas"];

/** Gateway requests spread over the last 28 days, each one settled in the ledger as the gateway would. */
async function seedUsage(q: Queryable, input: { organizationId: string; instanceId: string | null; tokenId: string; planCode: string; credits: number; index: number }) {
  const settings = await loadSettings(q);
  const { rows } = await q.query<PriceRow>(
    "SELECT m.* FROM model_prices m JOIN plans p ON m.model = ANY (p.allowed_models) WHERE p.code = $1 AND m.enabled ORDER BY m.model", [input.planCode]);
  const prices = rows.map(priceFromRow);
  let seed = 7 + input.index * 13;
  const random = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;
  let spent = 0;
  for (let n = 0; spent < input.credits && n < 400; n++) {
    const price = prices[Math.floor(random() * prices.length)]!;
    const usage = { input: Math.round(2000 + random() * 18_000), cacheRead: Math.round(random() * 40_000), cacheWrite: 0, output: Math.round(300 + random() * 3500) };
    const usd = costUsd(usage, price);
    const credits = Math.min(creditsFor(usd, price, settings), input.credits - spent);
    const wallet = await one<{ plan_balance: number }>(q, "SELECT plan_balance FROM credit_wallets WHERE organization_id = $1", [input.organizationId]);
    if (credits <= 0 || Number(wallet.plan_balance) < credits) break;
    const requestId = `gw_${randomUUID()}`;
    const at = new Date(now.getTime() - random() * 28 * DAY);
    const refused = random() < 0.04;
    await q.query(
      `INSERT INTO usage_events (organization_id, instance_id, gateway_token_id, request_id, provider, model, input_tokens, output_tokens, cache_read_tokens, cost_usd_micros,
         credits, status, endpoint, company, bot, reserved_credits, cost_brl_cents, usd_brl_rate, markup_percent, http_status, error_code, duration_ms, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
      [input.organizationId, input.instanceId, input.tokenId, requestId, price.provider, price.model, refused ? 0 : usage.input, refused ? 0 : usage.output,
        refused ? 0 : usage.cacheRead, refused ? 0 : Math.round(usd * 1e6), refused ? 0 : credits, refused ? "refused" : "ok",
        price.provider === "anthropic" ? "v1/messages" : "v1/chat/completions", COMPANIES[Math.floor(random() * (input.planCode === "essencial" ? 1 : 3))],
        BOTS[Math.floor(random() * BOTS.length)], refused ? 0 : credits * 3, refused ? 0 : brlCentsFor(usd, settings), settings.usdBrlRate, markupFor(price, settings),
        refused ? null : 200, refused ? "daily_cap_reached" : null, Math.round(800 + random() * 20_000), at]);
    if (refused) continue;
    await postLedger(q, { organizationId: input.organizationId, bucket: "plan", kind: "usage", amount: -credits, externalReference: `usage:${requestId}:plan`,
      reason: `IA: ${price.model}`, metadata: { requestId, model: price.model, provider: price.provider } });
    spent += credits;
  }
}

try {
  const existing = await db.query("SELECT 1 FROM organizations LIMIT 1");
  if (existing.rows.length) {
    console.log("O banco já tem clientes; nada foi alterado.");
    process.exit(0);
  }
  await db.tx(async (q) => {
    const admin = await one<{ id: string }>(q,
      "INSERT INTO admins (email, name, role) VALUES ('otavio@domma.com.br', 'Otávio', 'owner') ON CONFLICT (email) DO UPDATE SET name = 'Otávio' RETURNING id", []);
    const operator: { type: "admin"; id: string; label: string; ip: string } = { type: "admin", id: admin.id, label: "otavio@domma.com.br", ip: "177.92.10.4" };

    const accountId = randomUUID();
    const fakeKey = `$aact_demo_${randomToken(24)}`;
    await q.query(
      `INSERT INTO billing_accounts (id, label, holder_type, holder_name, holder_document, environment, api_key_enc, api_key_fingerprint, webhook_token_enc, active_for_new, last_tested_at, last_test_ok, last_test_message)
       VALUES ($1, 'Asaas – Otávio (pessoa física)', 'pf', 'Otávio B. Marques', $2, 'sandbox', $3, $4, $5, true, $6, true, 'Conectado. Saldo: R$ 1.284,50')`,
      [accountId, cpf("111444777"), box.encrypt(fakeKey, apiKeyContext(accountId)), fingerprint(fakeKey), box.encrypt(randomToken(36), webhookTokenContext(accountId)), ago(1)]);
    const pjId = randomUUID();
    const pjKey = `$aact_demo_${randomToken(24)}`;
    await q.query(
      `INSERT INTO billing_accounts (id, label, holder_type, holder_name, holder_document, environment, api_key_enc, api_key_fingerprint, webhook_token_enc, can_issue_nfse, active_for_new)
       VALUES ($1, 'Domma Tecnologia (CNPJ)', 'pj', 'Domma Tecnologia Ltda.', $2, 'production', $3, $4, $5, true, false)`,
      [pjId, cnpj("112223330001"), box.encrypt(pjKey, apiKeyContext(pjId)), fingerprint(pjKey), box.encrypt(randomToken(36), webhookTokenContext(pjId))]);

    for (const [provider, label, priority, ok] of [["anthropic", "Anthropic – conta principal", 10, true], ["openai", "OpenAI – reserva", 20, true], ["openrouter", "OpenRouter – modelos baratos", 30, null]] as const) {
      const id = randomUUID();
      const key = `sk-demo-${randomToken(24)}`;
      await q.query(
        `INSERT INTO ai_provider_keys (id, provider, label, api_key_enc, api_key_fingerprint, priority, last_tested_at, last_test_ok, last_test_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, provider, label, box.encrypt(key, `ai_provider_keys.api_key:${id}`), fingerprint(key), priority, ok === null ? null : ago(2), ok, ok === null ? null : "Chave aceita pelo provedor"]);
    }

    const addon = await one<{ id: string; price_cents: number }>(q, "SELECT id, price_cents FROM addons WHERE code = 'computador-adicional'", []);
    let eventSeq = 1000;
    for (const [index, client] of CLIENTS.entries()) {
      const shiftDays = client.overdueDays ? -client.overdueDays : 4 + index;
      const created = client.months === 0 ? ago(3) : new Date(addMonths(now, -client.months).getTime() + shiftDays * DAY);
      const plan = await one<{ id: string; price_cents: number; credits_per_month: number }>(q, "SELECT id, price_cents, credits_per_month FROM plans WHERE code = $1", [client.plan]);
      const account = await one<{ id: string }>(q, "INSERT INTO accounts (email, name, created_at) VALUES ($1, $2, $3) RETURNING id", [client.owner[1], client.owner[0], created]);
      const org = await one<{ id: string }>(q,
        `INSERT INTO organizations (name, slug, document_type, document, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [client.name, client.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40),
          client.document.length === 11 ? "cpf" : "cnpj", client.document, created]);
      await q.query("INSERT INTO memberships (organization_id, account_id, role, created_at) VALUES ($1, $2, 'owner', $3)", [org.id, account.id, created]);
      await q.query("INSERT INTO credit_wallets (organization_id) VALUES ($1)", [org.id]);
      await q.query("INSERT INTO terms_acceptances (account_id, organization_id, document, version, accepted_at, ip, user_agent) VALUES ($1, $2, 'terms', '2026-11', $3, $4, 'Mozilla/5.0'), ($1, $2, 'privacy', '2026-11', $3, $4, 'Mozilla/5.0')",
        [account.id, org.id, created, `189.40.${index + 10}.${20 + index}`]);
      await audit(q, operator, { action: "organization.created", targetType: "organization", targetId: org.id, organizationId: org.id, data: { name: client.name } });
      await q.query("INSERT INTO billing_customers (organization_id, billing_account_id, provider_customer_id) VALUES ($1, $2, $3)", [org.id, accountId, `cus_demo${String(index).padStart(4, "0")}`]);

      const subStatus = client.status === "canceled_org" ? "canceled" : client.status;
      const periodStart = client.months > 0 ? addMonths(created, client.months - 1) : null;
      const sub = await one<{ id: string }>(q,
        `INSERT INTO subscriptions (organization_id, plan_id, billing_account_id, status, billing_type, provider_subscription_id, price_cents, credits_per_month,
           current_period_start, current_period_end, next_due_date, past_due_since, canceled_at, cancel_reason, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
        [org.id, plan.id, accountId, subStatus, client.billingType, `sub_demo${String(index).padStart(4, "0")}`, plan.price_cents, plan.credits_per_month,
          periodStart, periodStart ? addMonths(periodStart, 1) : null, isoDate(periodStart ? addMonths(periodStart, 1) : now),
          client.overdueDays ? ago(client.overdueDays) : null, subStatus === "canceled" ? ago(6) : null, subStatus === "canceled" ? "Cliente pediu o cancelamento" : null, created]);
      await audit(q, operator, { action: "subscription.created", targetType: "subscription", targetId: sub.id, organizationId: org.id, data: { plan: client.plan } });
      if (client.addons) {
        await q.query("INSERT INTO subscription_addons (subscription_id, addon_id, quantity, unit_price_cents) VALUES ($1, $2, $3, $4)", [sub.id, addon.id, client.addons, addon.price_cents]);
      }

      for (let month = 0; month < client.months; month++) {
        const due = addMonths(created, month);
        const paymentId = randomUUID();
        const value = plan.price_cents + (client.addons ?? 0) * addon.price_cents;
        await q.query(
          `INSERT INTO payments (id, organization_id, subscription_id, billing_account_id, kind, provider_payment_id, status, billing_type, value_cents, due_date, paid_at, invoice_url, created_at)
           VALUES ($1, $2, $3, $4, 'subscription', $5, 'received', $6, $7, $8, $9, $10, $11)`,
          [paymentId, org.id, sub.id, accountId, `pay_demo${index}${month}`, client.billingType === "UNDEFINED" ? "PIX" : client.billingType, value, isoDate(due), new Date(due.getTime() + DAY / 3),
            `https://sandbox.asaas.com/i/demo${index}${month}`, new Date(due.getTime() - 5 * DAY)]);
        await grantPlanPeriod(q, { organizationId: org.id, quota: plan.credits_per_month, reference: `payment:${paymentId}`, billingAccountId: accountId, paymentId });
        await q.query(
          `INSERT INTO billing_events (billing_account_id, provider, event_id, event_type, payload, status, received_at, processed_at, error)
           VALUES ($1, 'asaas', $2, 'PAYMENT_RECEIVED', $3, 'processed', $4, $4, $5)`,
          [accountId, `evt_demo${eventSeq++}`, JSON.stringify({ event: "PAYMENT_RECEIVED", payment: { id: `pay_demo${index}${month}` } }), new Date(due.getTime() + DAY / 3),
            `cota de ${plan.credits_per_month.toLocaleString("pt-BR")} créditos do plano creditada`]);
      }
      if (client.overdueDays) {
        const due = ago(client.overdueDays);
        await q.query(
          `INSERT INTO payments (organization_id, subscription_id, billing_account_id, kind, provider_payment_id, status, billing_type, value_cents, due_date, invoice_url, created_at)
           VALUES ($1, $2, $3, 'subscription', $4, 'overdue', $5, $6, $7, $8, $9)`,
          [org.id, sub.id, accountId, `pay_demo${index}od`, client.billingType, plan.price_cents, isoDate(due), `https://sandbox.asaas.com/i/demo${index}od`, new Date(due.getTime() - 5 * DAY)]);
        await q.query(
          `INSERT INTO billing_events (billing_account_id, provider, event_id, event_type, payload, status, received_at, processed_at, error)
           VALUES ($1, 'asaas', $2, 'PAYMENT_OVERDUE', '{}', 'processed', $3, $3, 'cobrança vencida')`, [accountId, `evt_demo${eventSeq++}`, due]);
        await audit(q, { type: "webhook", label: "Asaas" }, { action: "subscription.past_due", targetType: "subscription", targetId: sub.id, organizationId: org.id, reason: "cobrança vencida" });
      }
      if (client.status === "pending") {
        await q.query(
          `INSERT INTO payments (organization_id, subscription_id, billing_account_id, kind, provider_payment_id, status, billing_type, value_cents, due_date, invoice_url)
           VALUES ($1, $2, $3, 'subscription', $4, 'pending', 'UNDEFINED', $5, $6, $7)`,
          [org.id, sub.id, accountId, `pay_demo${index}p`, plan.price_cents, isoDate(addMonths(now, 0)), `https://sandbox.asaas.com/i/demo${index}p`]);
      }
      if (client.status === "suspended") {
        await q.query("UPDATE organizations SET status = 'suspended', status_reason_code = 'billing', status_reason = 'pagamento em atraso além do prazo', status_changed_at = $2 WHERE id = $1", [org.id, ago(2)]);
        await audit(q, { type: "system", label: "régua de inadimplência" }, { action: "organization.suspended", targetType: "organization", targetId: org.id, organizationId: org.id, reason: "pagamento em atraso além do prazo" });
      }
      if (client.status === "canceled_org") {
        await q.query("UPDATE organizations SET status = 'canceled', status_reason_code = 'manual', status_reason = 'Cliente pediu o cancelamento', status_changed_at = $2 WHERE id = $1", [org.id, ago(6)]);
        await audit(q, operator, { action: "organization.canceled", targetType: "organization", targetId: org.id, organizationId: org.id, reason: "Cliente pediu o cancelamento" });
      }
      if (client.purchase) {
        const paymentId = randomUUID();
        await q.query(
          `INSERT INTO payments (id, organization_id, billing_account_id, kind, provider_payment_id, status, billing_type, value_cents, credits, due_date, paid_at, created_at)
           VALUES ($1, $2, $3, 'credit_purchase', $4, 'received', 'PIX', $5, $6, $7, $8, $8)`,
          [paymentId, org.id, accountId, `pay_demo${index}c`, client.purchase, client.purchase, isoDate(ago(4)), ago(4)]);
        await postLedger(q, { organizationId: org.id, bucket: "extra", kind: "purchase", amount: client.purchase, externalReference: `payment:${paymentId}:purchase`, paymentId, billingAccountId: accountId, reason: "Compra avulsa de créditos" });
      }
      const instance = client.status !== "pending" && client.status !== "canceled_org"
        ? await one<{ id: string }>(q, "INSERT INTO instances (organization_id, subscription_id, slug, machine_id, mode, state, state_reason) VALUES ($1, $2, $3, $4, 'dedicated', $5, $6) RETURNING id",
          [org.id, sub.id, `inst-${index}-${client.plan}`, `m-${randomToken(8).replace(/[^A-Za-z0-9]/g, "a")}`,
            client.status === "active" ? "ready" : "payment_problem", client.status === "active" ? null : "pagamento em atraso"])
        : null;
      const token = `arko_ai_${randomToken(32)}`;
      const tokenRow = await one<{ id: string }>(q,
        "INSERT INTO gateway_tokens (organization_id, instance_id, token_hash, token_prefix, label, created_at, last_used_at, revoked_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
        [org.id, instance?.id ?? null, sha256Hex(token), token.slice(0, 14), "Instância principal", created, client.usage ? ago(0.1) : null, client.status === "canceled_org" ? ago(6) : null]);
      if (client.usage) await seedUsage(q, { organizationId: org.id, instanceId: instance?.id ?? null, tokenId: tokenRow.id, planCode: client.plan, credits: client.usage, index });
    }

    const helena = await one<{ id: string }>(q, "SELECT id FROM organizations WHERE name LIKE 'Clínica%'", []);
    await postLedger(q, { organizationId: helena.id, bucket: "extra", kind: "admin_adjust", amount: 1500, externalReference: `admin:${randomUUID()}`, adminId: admin.id, reason: "Compensação pela instabilidade de 18/11" });
    await audit(q, operator, { action: "credits.adjusted", targetType: "organization", targetId: helena.id, organizationId: helena.id, reason: "Compensação pela instabilidade de 18/11", data: { bucket: "extra", amount: 1500 } });
    await audit(q, operator, { action: "billing_account.created", targetType: "billing_account", targetId: accountId, data: { label: "Asaas – Otávio (pessoa física)" } });
    await audit(q, operator, { action: "admin.login", targetType: "admin", targetId: admin.id });
  });
  console.log("Dados de demonstração criados. Entre com otavio@domma.com.br.");
} finally {
  await db.close();
}
