import { z } from "zod";
import { audit } from "../../audit.ts";
import type { AppContext } from "../../context.ts";
import { DomainError } from "../../domain/lifecycle.ts";
import { actorOf, body, param, router } from "../http.ts";

export const REPORT_STATUSES = ["new", "seen", "closed"] as const;
const PAGE = 100;

export function reportRoutes(ctx: AppContext) {
  const app = router();

  app.get("/", async (c) => {
    const params: unknown[] = [];
    const where: string[] = [];
    const status = c.req.query("status");
    if (status && (REPORT_STATUSES as readonly string[]).includes(status)) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    const before = c.req.query("before");
    if (before && !Number.isNaN(Date.parse(before))) {
      params.push(new Date(before));
      where.push(`received_at < $${params.length}`);
    }
    const [{ rows }, counts] = await Promise.all([
      ctx.db.query(
        `SELECT id, received_at, install_id, app_version, platform, contact, ip, status, status_changed_at,
                left(payload->>'description', 200) AS summary
         FROM bug_reports ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY received_at DESC, id DESC LIMIT ${PAGE}`, params),
      ctx.db.query<{ status: string; count: string }>("SELECT status, count(*) AS count FROM bug_reports GROUP BY status"),
    ]);
    return c.json({ reports: rows, counts: Object.fromEntries(counts.rows.map((row) => [row.status, Number(row.count)])) });
  });

  app.get("/:id", async (c) => {
    const { rows } = await ctx.db.query(
      `SELECT r.*, a.email AS status_changed_by_email FROM bug_reports r LEFT JOIN admins a ON a.id = r.status_changed_by WHERE r.id = $1`,
      [param(c, "id")]);
    if (!rows[0]) throw new DomainError("Relatório não encontrado", 404);
    return c.json({ report: rows[0] });
  });

  app.post("/:id/status", async (c) => {
    const id = param(c, "id");
    const { status } = await body(c, z.object({ status: z.enum(REPORT_STATUSES) }));
    const actor = actorOf(c);
    const changed = await ctx.db.tx(async (q) => {
      const { rows } = await q.query<{ status: string }>("SELECT status FROM bug_reports WHERE id = $1 FOR UPDATE", [id]);
      const from = rows[0]?.status;
      if (!from) throw new DomainError("Relatório não encontrado", 404);
      if (from === status) return false;
      await q.query("UPDATE bug_reports SET status = $2, status_changed_at = $3, status_changed_by = $4 WHERE id = $1", [id, status, ctx.now(), actor.id]);
      await audit(q, actor, { action: "bug_report.status_changed", targetType: "bug_report", targetId: id, data: { from, to: status } });
      return true;
    });
    return c.json({ ok: true, changed });
  });

  return app;
}
