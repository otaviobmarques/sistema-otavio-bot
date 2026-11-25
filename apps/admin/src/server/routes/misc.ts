import QRCode from "qrcode";
import { z } from "zod";
import { beginTotpSetup, disableTotp, enableTotp } from "../../auth/auth.ts";
import type { AppContext } from "../../context.ts";
import { DomainError } from "../../domain/lifecycle.ts";
import { body, router } from "../http.ts";

export function auditRoutes(ctx: AppContext) {
  const app = router();
  app.get("/", async (c) => {
    const params: unknown[] = [];
    const where: string[] = [];
    const action = c.req.query("action")?.trim();
    const actor = c.req.query("actor")?.trim();
    const organization = c.req.query("organization")?.trim();
    if (action) {
      params.push(`${action}%`);
      where.push(`l.action LIKE $${params.length}`);
    }
    if (actor) {
      params.push(`%${actor.toLowerCase()}%`);
      where.push(`lower(coalesce(l.actor_label, '')) LIKE $${params.length}`);
    }
    if (organization && z.uuid().safeParse(organization).success) {
      params.push(organization);
      where.push(`l.organization_id = $${params.length}`);
    }
    const before = Number(c.req.query("before"));
    if (Number.isInteger(before) && before > 0) {
      params.push(before);
      where.push(`l.id < $${params.length}`);
    }
    const { rows } = await ctx.db.query(
      `SELECT l.*, o.name AS organization_name FROM audit_log l LEFT JOIN organizations o ON o.id = l.organization_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY l.id DESC LIMIT 100`, params);
    return c.json({ entries: rows });
  });
  return app;
}

export function meRoutes(ctx: AppContext) {
  const app = router();

  app.post("/totp/setup", async (c) => {
    const setup = await beginTotpSetup(ctx, c.get("admin")).catch((error: Error) => {
      throw new DomainError(error.message);
    });
    const qr = await QRCode.toDataURL(setup.uri, { margin: 1, width: 220, color: { dark: "#050817", light: "#ffffff" } });
    return c.json({ secret: setup.secret, uri: setup.uri, qr });
  });

  app.post("/totp/enable", async (c) => {
    const { code } = await body(c, z.object({ code: z.string().trim().length(6) }));
    if (!(await enableTotp(ctx, c.get("admin"), code, c.get("ip")))) throw new DomainError("Código do autenticador inválido");
    return c.json({ ok: true });
  });

  app.post("/totp/disable", async (c) => {
    const { code } = await body(c, z.object({ code: z.string().trim().length(6) }));
    if (!(await disableTotp(ctx, c.get("admin"), code, c.get("ip")))) throw new DomainError("Código do autenticador inválido");
    return c.json({ ok: true });
  });

  app.get("/sessions", async (c) => {
    const { rows } = await ctx.db.query(
      `SELECT id, ip, user_agent, created_at, last_seen_at, (id = $2) AS current FROM admin_sessions
       WHERE admin_id = $1 AND revoked_at IS NULL AND NOT mfa_pending AND expires_at > $3 ORDER BY last_seen_at DESC`,
      [c.get("admin").id, c.get("admin").sessionId, ctx.now()]);
    return c.json({ sessions: rows });
  });

  return app;
}
