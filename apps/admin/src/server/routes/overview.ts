import type { AppContext } from "../../context.ts";
import { router } from "../http.ts";

export function overviewRoutes(ctx: AppContext) {
  const app = router();

  app.get("/", async (c) => {
    const now = ctx.now();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [stats, recentPayments, delinquent, recentAudit] = await Promise.all([
      ctx.db.query<Record<string, number>>(
        `SELECT
           (SELECT count(*) FROM organizations WHERE status = 'active')::int AS active_clients,
           (SELECT count(*) FROM organizations WHERE status = 'suspended')::int AS suspended_clients,
           (SELECT count(*) FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.status IN ('active', 'past_due') AND NOT p.free)::int AS paying,
           (SELECT count(*) FROM subscriptions WHERE status = 'past_due')::int AS past_due,
           (SELECT count(*) FROM subscriptions s JOIN organizations o ON o.id = s.organization_id
              WHERE s.status = 'suspended' AND o.status_reason_code IN ('billing', 'chargeback'))::int AS suspended_billing,
           (SELECT COALESCE(SUM(
              (s.price_cents + COALESCE((SELECT SUM(a.quantity * a.unit_price_cents) FROM subscription_addons a WHERE a.subscription_id = s.id), 0))
              / CASE WHEN p.billing_cycle = 'yearly' THEN 12.0 ELSE 1 END), 0)
            FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.status IN ('active', 'past_due'))::bigint AS mrr_cents,
           (SELECT COALESCE(-SUM(amount), 0) FROM credit_ledger WHERE kind = 'usage' AND created_at >= $1)::bigint AS credits_used_month,
           (SELECT COALESCE(SUM(amount), 0) FROM credit_ledger WHERE kind IN ('plan_grant', 'purchase') AND created_at >= $1)::bigint AS credits_granted_month,
           (SELECT COALESCE(SUM(cost_brl_cents), 0) FROM usage_events WHERE created_at >= $1)::float8 AS ai_cost_brl_cents_month,
           (SELECT COALESCE(SUM(credits), 0) FROM usage_events WHERE created_at >= $1)::bigint AS ai_credits_month,
           (SELECT COALESCE(SUM(value_cents), 0) FROM payments WHERE status IN ('confirmed', 'received') AND paid_at >= $1)::bigint AS received_month_cents,
           (SELECT count(*) FROM billing_events WHERE status = 'received')::int AS events_waiting,
           (SELECT count(*) FROM jobs WHERE status = 'failed')::int AS jobs_failed`,
        [monthStart]),
      ctx.db.query(
        `SELECT p.id, p.status, p.kind, p.value_cents, p.billing_type, p.due_date, p.paid_at, p.created_at, o.id AS organization_id, o.name AS organization_name
         FROM payments p JOIN organizations o ON o.id = p.organization_id ORDER BY p.created_at DESC LIMIT 8`),
      ctx.db.query(
        `SELECT s.id, s.status, s.past_due_since, o.id AS organization_id, o.name AS organization_name, pl.name AS plan_name,
           (s.price_cents + COALESCE((SELECT SUM(a.quantity * a.unit_price_cents) FROM subscription_addons a WHERE a.subscription_id = s.id), 0))::int AS value_cents
         FROM subscriptions s JOIN organizations o ON o.id = s.organization_id JOIN plans pl ON pl.id = s.plan_id
         WHERE s.status = 'past_due' OR (s.status = 'suspended' AND o.status_reason_code IN ('billing', 'chargeback'))
         ORDER BY s.past_due_since NULLS LAST LIMIT 8`),
      ctx.db.query(
        `SELECT l.id, l.created_at, l.actor_type, l.actor_label, l.action, l.reason, l.organization_id, o.name AS organization_name
         FROM audit_log l LEFT JOIN organizations o ON o.id = l.organization_id ORDER BY l.id DESC LIMIT 8`),
    ]);
    return c.json({ stats: stats.rows[0], recentPayments: recentPayments.rows, delinquent: delinquent.rows, recentAudit: recentAudit.rows });
  });

  return app;
}
