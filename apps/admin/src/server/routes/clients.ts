import { z } from "zod";
import { grantCourtesy, revokeCourtesy } from "../../billing/courtesy.ts";
import { BILLING_TYPES } from "../../billing/provider.ts";
import { cancelSubscription, createCreditCharge, setSubscriptionAddon, startSubscription } from "../../billing/service.ts";
import { audit } from "../../audit.ts";
import type { AppContext } from "../../context.ts";
import { DomainError, setOrganizationStatus } from "../../domain/lifecycle.ts";
import { adjustCredits, createOrganization } from "../../domain/organizations.ts";
import { freeRequestsToday } from "../../gateway/accounting.ts";
import { issueGatewayToken, revokeGatewayToken } from "../../gateway/tokens.ts";
import { actorOf, body, param, reason, router } from "../http.ts";

const billingType = z.enum(BILLING_TYPES as unknown as ["PIX", "BOLETO", "CREDIT_CARD", "UNDEFINED"]);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use AAAA-MM-DD");

const createSchema = z.object({
  name: z.string().trim().min(2).max(160),
  document: z.string().trim().min(11).max(20),
  ownerEmail: z.string().trim().min(5).max(254),
  ownerName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional().nullable(),
  billingEmail: z.string().trim().max(254).optional().nullable(),
});

const SUBSCRIPTION_SQL = `
  SELECT s.*, p.name AS plan_name, p.code AS plan_code, p.free AS plan_free, p.billing_cycle, p.free_requests_per_day, ga.email AS courtesy_granted_by_email,
    (s.price_cents + COALESCE((SELECT SUM(a.quantity * a.unit_price_cents) FROM subscription_addons a WHERE a.subscription_id = s.id), 0))::int AS total_cents
  FROM subscriptions s JOIN plans p ON p.id = s.plan_id LEFT JOIN admins ga ON ga.id = s.courtesy_granted_by`;

export function clientRoutes(ctx: AppContext) {
  const app = router();

  app.get("/", async (c) => {
    const q = (c.req.query("q") ?? "").trim();
    const status = c.req.query("status");
    const page = Math.max(1, Number(c.req.query("page")) || 1);
    const digits = q.replace(/\D/g, "");
    const params: unknown[] = [];
    const where: string[] = [];
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      const like = `$${params.length}`;
      const clauses = [`lower(o.name) LIKE ${like}`, `lower(o.slug) LIKE ${like}`, `lower(coalesce(o.billing_email, '')) LIKE ${like}`,
        `EXISTS (SELECT 1 FROM memberships m JOIN accounts a ON a.id = m.account_id WHERE m.organization_id = o.id AND lower(a.email) LIKE ${like})`];
      if (digits.length >= 3) {
        params.push(`%${digits}%`);
        clauses.push(`o.document LIKE $${params.length}`);
      }
      where.push(`(${clauses.join(" OR ")})`);
    }
    if (status === "active" || status === "suspended" || status === "canceled") {
      params.push(status);
      where.push(`o.status = $${params.length}`);
    } else if (status === "past_due") {
      where.push("EXISTS (SELECT 1 FROM subscriptions s WHERE s.organization_id = o.id AND s.status = 'past_due')");
    }
    params.push(50, (page - 1) * 50);
    const { rows } = await ctx.db.query(
      `SELECT o.id, o.name, o.slug, o.document_type, o.document, o.status, o.status_reason, o.created_at,
         s.status AS subscription_status, s.courtesy, p.name AS plan_name, p.free AS plan_free,
         COALESCE(w.plan_balance, 0) + COALESCE(w.extra_balance, 0) AS credits,
         (SELECT a.email FROM memberships m JOIN accounts a ON a.id = m.account_id WHERE m.organization_id = o.id AND m.role = 'owner') AS owner_email,
         count(*) OVER ()::int AS total
       FROM organizations o
       LEFT JOIN subscriptions s ON s.organization_id = o.id AND s.status <> 'canceled'
       LEFT JOIN plans p ON p.id = s.plan_id
       LEFT JOIN credit_wallets w ON w.organization_id = o.id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY o.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params);
    return c.json({ clients: rows, total: (rows[0] as { total?: number } | undefined)?.total ?? 0, page });
  });

  app.post("/", async (c) => {
    const input = await body(c, createSchema);
    const org = await createOrganization(ctx, actorOf(c), input);
    return c.json({ client: org }, 201);
  });

  app.get("/:id", async (c) => {
    const id = param(c, "id");
    const org = (await ctx.db.query("SELECT * FROM organizations WHERE id = $1", [id])).rows[0];
    if (!org) throw new DomainError("Cliente não encontrado", 404);
    const [members, subscription, wallet, ledger, payments, instances, auditRows, terms, addons, tokens, usage, deletions, freeToday] = await Promise.all([
      ctx.db.query(`SELECT a.id, a.email, a.name, a.phone, m.role, m.created_at FROM memberships m JOIN accounts a ON a.id = m.account_id
                    WHERE m.organization_id = $1 ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, a.email`, [id]),
      ctx.db.query(`${SUBSCRIPTION_SQL} WHERE s.organization_id = $1 ORDER BY (s.status = 'canceled'), s.created_at DESC LIMIT 1`, [id]),
      ctx.db.query("SELECT plan_balance, extra_balance, updated_at FROM credit_wallets WHERE organization_id = $1", [id]),
      ctx.db.query(`SELECT l.id, l.created_at, l.bucket, l.kind, l.amount, l.balance_after, l.reason, l.external_reference, ad.email AS admin_email
                    FROM credit_ledger l LEFT JOIN admins ad ON ad.id = l.admin_id WHERE l.organization_id = $1 ORDER BY l.id DESC LIMIT 50`, [id]),
      ctx.db.query(`SELECT p.*, b.label AS billing_account_label FROM payments p JOIN billing_accounts b ON b.id = p.billing_account_id
                    WHERE p.organization_id = $1 ORDER BY p.created_at DESC LIMIT 30`, [id]),
      ctx.db.query("SELECT id, slug, machine_id, mode, state, state_reason, public_url, last_active_at FROM instances WHERE organization_id = $1 ORDER BY created_at", [id]),
      ctx.db.query("SELECT id, created_at, actor_type, actor_label, action, reason, data FROM audit_log WHERE organization_id = $1 ORDER BY id DESC LIMIT 30", [id]),
      ctx.db.query(`SELECT t.document, t.version, t.accepted_at, t.ip, a.email FROM terms_acceptances t JOIN accounts a ON a.id = t.account_id
                    WHERE t.organization_id = $1 OR t.account_id IN (SELECT account_id FROM memberships WHERE organization_id = $1)
                    ORDER BY t.accepted_at DESC LIMIT 20`, [id]),
      ctx.db.query(`SELECT sa.addon_id, sa.quantity, sa.unit_price_cents, ad.name, ad.code FROM subscription_addons sa JOIN addons ad ON ad.id = sa.addon_id
                    JOIN subscriptions s ON s.id = sa.subscription_id WHERE s.organization_id = $1 AND s.status <> 'canceled'`, [id]),
      ctx.db.query(`SELECT t.id, t.token_prefix, t.label, t.instance_id, i.slug AS instance_slug, t.created_at, t.last_used_at, t.revoked_at, t.expires_at
                    FROM gateway_tokens t LEFT JOIN instances i ON i.id = t.instance_id WHERE t.organization_id = $1 ORDER BY t.revoked_at NULLS FIRST, t.created_at DESC`, [id]),
      ctx.db.query(`SELECT count(*)::int AS requests, COALESCE(SUM(credits), 0)::bigint AS credits, COALESCE(SUM(cost_brl_cents), 0)::float8 AS cost_brl_cents
                    FROM usage_events WHERE organization_id = $1 AND created_at >= $2`, [id, new Date(ctx.now().getTime() - 30 * 86_400_000)]),
      ctx.db.query(`SELECT d.id, d.status, d.reason, d.created_at, d.resolved_at, d.resolution_note, d.ip, a.email, ad.email AS resolved_by_email
                    FROM account_deletion_requests d JOIN accounts a ON a.id = d.account_id LEFT JOIN admins ad ON ad.id = d.resolved_by
                    WHERE d.organization_id = $1 OR d.account_id IN (SELECT account_id FROM memberships WHERE organization_id = $1)
                    ORDER BY d.created_at DESC LIMIT 20`, [id]),
      freeRequestsToday(ctx.db, id, ctx.now()),
    ]);
    return c.json({
      client: org, members: members.rows, subscription: subscription.rows[0] ?? null, addons: addons.rows,
      wallet: wallet.rows[0] ?? { plan_balance: 0, extra_balance: 0 }, ledger: ledger.rows, payments: payments.rows,
      instances: instances.rows, audit: auditRows.rows, terms: terms.rows, gatewayTokens: tokens.rows, usage30d: usage.rows[0],
      deletionRequests: deletions.rows, freeRequestsToday: freeToday,
    });
  });

  app.post("/:id/status", async (c) => {
    const id = param(c, "id");
    const input = await body(c, z.object({ action: z.enum(["suspend", "reactivate", "cancel"]), reason }));
    const target = input.action === "suspend" ? "suspended" : input.action === "cancel" ? "canceled" : "active";
    const changed = await ctx.db.tx((q) => setOrganizationStatus(q, actorOf(c), id, target, target === "active" ? null : "manual", input.reason));
    if (!changed) throw new DomainError("O cliente já está nesse estado");
    return c.json({ ok: true });
  });

  app.post("/:id/deletion-requests/:requestId/resolve", async (c) => {
    const id = param(c, "id");
    const requestId = param(c, "requestId");
    const input = await body(c, z.object({ status: z.enum(["completed", "rejected"]), note: reason }));
    const actor = actorOf(c);
    await ctx.db.tx(async (q) => {
      const { rows } = await q.query<{ account_id: string }>(
        `UPDATE account_deletion_requests SET status = $3, resolved_at = $4, resolved_by = $5, resolution_note = $6
         WHERE id = $2 AND status = 'requested'
           AND (organization_id = $1 OR account_id IN (SELECT account_id FROM memberships WHERE organization_id = $1))
         RETURNING account_id`,
        [id, requestId, input.status, ctx.now(), actor.id, input.note]);
      if (!rows[0]) throw new DomainError("Pedido não encontrado ou já resolvido", 404);
      await audit(q, actor, { action: `account.deletion_${input.status}`, targetType: "account", targetId: rows[0].account_id,
        organizationId: id, reason: input.note, data: { requestId } });
    });
    return c.json({ ok: true });
  });

  app.post("/:id/credits", async (c) => {
    const id = param(c, "id");
    const input = await body(c, z.object({ bucket: z.enum(["plan", "extra"]), amount: z.number().int().min(-10_000_000).max(10_000_000), reason }));
    const balance = await adjustCredits(ctx, actorOf(c), { organizationId: id, ...input });
    return c.json({ ok: true, balanceAfter: balance });
  });

  app.post("/:id/subscription", async (c) => {
    const id = param(c, "id");
    const input = await body(c, z.object({ planId: z.uuid(), billingType, firstDueDate: isoDay.optional() }));
    const sub = await startSubscription(ctx, actorOf(c), { organizationId: id, ...input });
    return c.json({ subscription: sub }, 201);
  });

  app.post("/:id/subscription/cancel", async (c) => {
    const id = param(c, "id");
    const input = await body(c, z.object({ reason }));
    const sub = (await ctx.db.query<{ id: string }>("SELECT id FROM subscriptions WHERE organization_id = $1 AND status <> 'canceled'", [id])).rows[0];
    if (!sub) throw new DomainError("Este cliente não tem assinatura em andamento", 404);
    await cancelSubscription(ctx, actorOf(c), sub.id, input.reason);
    return c.json({ ok: true });
  });

  app.post("/:id/courtesy", async (c) => {
    const id = param(c, "id");
    const input = await body(c, z.object({ planId: z.uuid(), until: isoDay.nullable().optional(), reason }));
    const sub = await grantCourtesy(ctx, actorOf(c), { organizationId: id, ...input });
    return c.json({ subscription: sub }, 201);
  });

  app.post("/:id/courtesy/revoke", async (c) => {
    const id = param(c, "id");
    const input = await body(c, z.object({ reason }));
    const sub = (await ctx.db.query<{ id: string }>(
      "SELECT id FROM subscriptions WHERE organization_id = $1 AND status <> 'canceled' AND courtesy", [id])).rows[0];
    if (!sub) throw new DomainError("Este cliente não tem cortesia em andamento", 404);
    await revokeCourtesy(ctx, actorOf(c), sub.id, input.reason);
    return c.json({ ok: true });
  });

  app.post("/:id/subscription/addons", async (c) => {
    const id = param(c, "id");
    const input = await body(c, z.object({ addonId: z.uuid(), quantity: z.number().int().min(0).max(500) }));
    const sub = (await ctx.db.query<{ id: string }>("SELECT id FROM subscriptions WHERE organization_id = $1 AND status <> 'canceled'", [id])).rows[0];
    if (!sub) throw new DomainError("Este cliente não tem assinatura em andamento", 404);
    const total = await setSubscriptionAddon(ctx, actorOf(c), sub.id, input.addonId, input.quantity);
    return c.json({ ok: true, totalCents: total });
  });

  app.post("/:id/gateway-tokens", async (c) => {
    const id = param(c, "id");
    const input = await body(c, z.object({ label: z.string().trim().min(2).max(80), instanceId: z.uuid().nullable().optional() }));
    const issued = await issueGatewayToken(ctx.db, actorOf(c), { organizationId: id, instanceId: input.instanceId ?? null, label: input.label });
    return c.json(issued, 201);
  });

  app.post("/:id/gateway-tokens/:tokenId/revoke", async (c) => {
    const id = param(c, "id");
    const tokenId = param(c, "tokenId");
    const input = await body(c, z.object({ reason }));
    await revokeGatewayToken(ctx.db, actorOf(c), id, tokenId, input.reason);
    return c.json({ ok: true });
  });

  app.post("/:id/credit-charge", async (c) => {
    const id = param(c, "id");
    const input = await body(c, z.object({ credits: z.number().int(), billingType: billingType.default("PIX"), dueDate: isoDay.optional() }));
    const result = await createCreditCharge(ctx, actorOf(c), { organizationId: id, ...input });
    return c.json(result, 201);
  });

  return app;
}
