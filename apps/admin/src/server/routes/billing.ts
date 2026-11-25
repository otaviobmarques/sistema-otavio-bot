import { z } from "zod";
import { audit } from "../../audit.ts";
import {
  apiKeyContext, billingAccount, defaultProviderFactory, publicBillingAccount, webhookTokenContext, type BillingAccountRow,
} from "../../billing/accounts.ts";
import { PROCESS_EVENT_JOB } from "../../billing/webhooks.ts";
import type { AppContext } from "../../context.ts";
import { parseDocument } from "../../domain/documents.ts";
import { DomainError } from "../../domain/lifecycle.ts";
import { enqueue } from "../../jobs/queue.ts";
import { fingerprint, randomToken } from "../../security/crypto.ts";
import { actorOf, body, param, router } from "../http.ts";

const apiKey = z.string().trim().min(20, "chave de API curta demais").max(500);
/** Asaas: 32 to 255 characters, no whitespace. */
const webhookToken = z.string().trim().min(32).max(255).regex(/^\S+$/, "sem espaços");

export function billingRoutes(ctx: AppContext) {
  const app = router();
  const webhookUrl = (id: string) => `${ctx.config.publicUrl}/webhooks/asaas/${id}`;
  const shape = (row: BillingAccountRow) => ({ ...publicBillingAccount(row), webhookUrl: webhookUrl(row.id) });

  app.get("/accounts", async (c) => {
    const { rows } = await ctx.db.query<BillingAccountRow>("SELECT * FROM billing_accounts ORDER BY active_for_new DESC, created_at");
    return c.json({ accounts: rows.map(shape) });
  });

  app.post("/accounts", async (c) => {
    const input = await body(c, z.object({
      label: z.string().trim().min(2).max(80), holderType: z.enum(["pf", "pj"]), holderName: z.string().trim().min(2).max(160),
      holderDocument: z.string().trim(), environment: z.enum(["sandbox", "production"]), apiKey,
      webhookToken: webhookToken.optional(), canIssueNfse: z.boolean().default(false), activeForNew: z.boolean().default(false),
    }));
    const document = parseDocument(input.holderDocument);
    if (!document || (input.holderType === "pf") !== (document.type === "cpf")) {
      throw new DomainError(input.holderType === "pf" ? "Informe um CPF válido para conta de pessoa física" : "Informe um CNPJ válido para conta de pessoa jurídica");
    }
    const token = input.webhookToken ?? randomToken(36);
    const row = await ctx.db.tx(async (q) => {
      if (input.activeForNew) await q.query("UPDATE billing_accounts SET active_for_new = false WHERE active_for_new");
      const { rows } = await q.query<BillingAccountRow>(
        `INSERT INTO billing_accounts (label, holder_type, holder_name, holder_document, environment, api_key_enc, api_key_fingerprint, webhook_token_enc, can_issue_nfse, active_for_new)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6, 'pending', $7, $8) RETURNING *`,
        [input.label, input.holderType, input.holderName, document.digits, input.environment, fingerprint(input.apiKey), input.canIssueNfse, input.activeForNew]);
      const created = rows[0]!;
      const sealed = await q.query<BillingAccountRow>(
        "UPDATE billing_accounts SET api_key_enc = $2, webhook_token_enc = $3 WHERE id = $1 RETURNING *",
        [created.id, ctx.box.encrypt(input.apiKey, apiKeyContext(created.id)), ctx.box.encrypt(token, webhookTokenContext(created.id))]);
      await audit(q, actorOf(c), { action: "billing_account.created", targetType: "billing_account", targetId: created.id,
        data: { label: input.label, holderType: input.holderType, environment: input.environment, activeForNew: input.activeForNew } });
      return sealed.rows[0]!;
    });
    return c.json({ account: shape(row), webhookToken: token }, 201);
  });

  app.put("/accounts/:id", async (c) => {
    const id = param(c, "id");
    const input = await body(c, z.object({ label: z.string().trim().min(2).max(80), canIssueNfse: z.boolean(), enabled: z.boolean() }));
    const row = await ctx.db.tx(async (q) => {
      const current = await billingAccount(q, id);
      if (!current) throw new DomainError("Conta de cobrança não encontrada", 404);
      if (!input.enabled && current.active_for_new) throw new DomainError("Escolha outra conta ativa para novos antes de desativar esta");
      const { rows } = await q.query<BillingAccountRow>(
        "UPDATE billing_accounts SET label = $2, can_issue_nfse = $3, enabled = $4 WHERE id = $1 RETURNING *", [id, input.label, input.canIssueNfse, input.enabled]);
      await audit(q, actorOf(c), { action: "billing_account.updated", targetType: "billing_account", targetId: id, data: input });
      return rows[0]!;
    });
    return c.json({ account: shape(row) });
  });

  app.post("/accounts/:id/api-key", async (c) => {
    const id = param(c, "id");
    const input = await body(c, z.object({ apiKey }));
    await ctx.db.tx(async (q) => {
      const { rowCount } = await q.query("UPDATE billing_accounts SET api_key_enc = $2, api_key_fingerprint = $3, last_test_ok = NULL WHERE id = $1",
        [id, ctx.box.encrypt(input.apiKey, apiKeyContext(id)), fingerprint(input.apiKey)]);
      if (!rowCount) throw new DomainError("Conta de cobrança não encontrada", 404);
      await audit(q, actorOf(c), { action: "billing_account.api_key_replaced", targetType: "billing_account", targetId: id, data: { fingerprint: fingerprint(input.apiKey) } });
    });
    return c.json({ ok: true });
  });

  app.post("/accounts/:id/webhook-token", async (c) => {
    const id = param(c, "id");
    const token = randomToken(36);
    await ctx.db.tx(async (q) => {
      const { rowCount } = await q.query("UPDATE billing_accounts SET webhook_token_enc = $2 WHERE id = $1", [id, ctx.box.encrypt(token, webhookTokenContext(id))]);
      if (!rowCount) throw new DomainError("Conta de cobrança não encontrada", 404);
      await audit(q, actorOf(c), { action: "billing_account.webhook_token_rotated", targetType: "billing_account", targetId: id });
    });
    return c.json({ webhookToken: token, webhookUrl: webhookUrl(id) });
  });

  app.post("/accounts/:id/activate", async (c) => {
    const id = param(c, "id");
    await ctx.db.tx(async (q) => {
      const current = await billingAccount(q, id);
      if (!current) throw new DomainError("Conta de cobrança não encontrada", 404);
      if (!current.enabled) throw new DomainError("Reative a conta antes de usá-la para novas assinaturas");
      const previous = await q.query<{ id: string }>("UPDATE billing_accounts SET active_for_new = false WHERE active_for_new AND id <> $1 RETURNING id", [id]);
      await q.query("UPDATE billing_accounts SET active_for_new = true WHERE id = $1", [id]);
      await audit(q, actorOf(c), { action: "billing_account.activated_for_new", targetType: "billing_account", targetId: id,
        data: { previous: previous.rows[0]?.id ?? null } });
    });
    return c.json({ ok: true });
  });

  app.post("/accounts/:id/test", async (c) => {
    const id = param(c, "id");
    const account = await billingAccount(ctx.db, id);
    if (!account) throw new DomainError("Conta de cobrança não encontrada", 404);
    const result = await defaultProviderFactory(ctx, account).checkCredentials();
    await ctx.db.query("UPDATE billing_accounts SET last_tested_at = $2, last_test_ok = $3, last_test_message = $4 WHERE id = $1",
      [id, ctx.now(), result.ok, result.message]);
    return c.json(result);
  });

  app.get("/subscriptions", async (c) => {
    const status = c.req.query("status");
    const params: unknown[] = [];
    let filter = "";
    if (status && ["pending", "active", "past_due", "suspended", "canceled"].includes(status)) {
      params.push(status);
      filter = "WHERE s.status = $1";
    }
    const { rows } = await ctx.db.query(
      `SELECT s.id, s.status, s.billing_type, s.provider_subscription_id, s.next_due_date, s.past_due_since, s.current_period_end, s.created_at,
         (s.price_cents + COALESCE((SELECT SUM(a.quantity * a.unit_price_cents) FROM subscription_addons a WHERE a.subscription_id = s.id), 0))::int AS total_cents,
         o.id AS organization_id, o.name AS organization_name, p.name AS plan_name, p.free AS plan_free, b.label AS billing_account_label
       FROM subscriptions s JOIN organizations o ON o.id = s.organization_id JOIN plans p ON p.id = s.plan_id
       LEFT JOIN billing_accounts b ON b.id = s.billing_account_id ${filter}
       ORDER BY s.created_at DESC LIMIT 200`, params);
    return c.json({ subscriptions: rows });
  });

  app.get("/payments", async (c) => {
    const status = c.req.query("status");
    const params: unknown[] = [];
    let filter = "";
    if (status && ["pending", "confirmed", "received", "overdue", "refunded", "chargeback", "canceled"].includes(status)) {
      params.push(status);
      filter = "WHERE p.status = $1";
    }
    const { rows } = await ctx.db.query(
      `SELECT p.id, p.kind, p.status, p.billing_type, p.value_cents, p.credits, p.due_date, p.paid_at, p.invoice_url, p.provider_payment_id, p.created_at,
         o.id AS organization_id, o.name AS organization_name, b.label AS billing_account_label
       FROM payments p JOIN organizations o ON o.id = p.organization_id JOIN billing_accounts b ON b.id = p.billing_account_id ${filter}
       ORDER BY p.created_at DESC LIMIT 200`, params);
    return c.json({ payments: rows });
  });

  app.get("/delinquent", async (c) => {
    const { rows } = await ctx.db.query(
      `SELECT s.id, s.status, s.past_due_since, s.next_due_date, o.id AS organization_id, o.name AS organization_name, o.status AS organization_status,
         p.name AS plan_name,
         (s.price_cents + COALESCE((SELECT SUM(a.quantity * a.unit_price_cents) FROM subscription_addons a WHERE a.subscription_id = s.id), 0))::int AS total_cents,
         (SELECT COALESCE(SUM(value_cents), 0) FROM payments pay WHERE pay.subscription_id = s.id AND pay.status = 'overdue')::int AS overdue_cents
       FROM subscriptions s JOIN organizations o ON o.id = s.organization_id JOIN plans p ON p.id = s.plan_id
       WHERE s.status = 'past_due' OR (s.status = 'suspended' AND o.status_reason_code IN ('billing', 'chargeback'))
       ORDER BY s.past_due_since NULLS LAST`);
    return c.json({ delinquent: rows, policy: ctx.config.dunning });
  });

  app.get("/events", async (c) => {
    const { rows } = await ctx.db.query(
      `SELECT e.id, e.event_id, e.event_type, e.status, e.received_at, e.processed_at, e.error, b.label AS billing_account_label
       FROM billing_events e JOIN billing_accounts b ON b.id = e.billing_account_id ORDER BY e.received_at DESC LIMIT 100`);
    const jobs = await ctx.db.query("SELECT id, type, status, attempts, last_error, run_at, created_at FROM jobs WHERE status IN ('queued', 'failed') ORDER BY id DESC LIMIT 50");
    return c.json({ events: rows, jobs: jobs.rows });
  });

  app.post("/events/:id/retry", async (c) => {
    const id = param(c, "id");
    const event = (await ctx.db.query<{ status: string }>("SELECT status FROM billing_events WHERE id = $1", [id])).rows[0];
    if (!event) throw new DomainError("Evento não encontrado", 404);
    if (event.status !== "received" && event.status !== "failed") throw new DomainError("Este evento já foi processado");
    await ctx.db.tx(async (q) => {
      await enqueue(q, PROCESS_EVENT_JOB, { billingEventId: id }, { dedupeKey: `billing_event:${id}` });
      await audit(q, actorOf(c), { action: "billing_event.retried", targetType: "billing_event", targetId: id });
    });
    return c.json({ ok: true });
  });

  return app;
}
