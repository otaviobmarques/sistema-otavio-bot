import { z } from "zod";
import { audit } from "../../audit.ts";
import { approveMachine, discardMachine, retryMachine, syncOrganizationComputers } from "../../computers/machines.ts";
import { moveInstance } from "../../computers/placement.ts";
import { VPS_PROVIDERS } from "../../computers/provider.ts";
import { releaseMachine } from "../../computers/provisioning.ts";
import { configuredProviders, vpsSettings } from "../../computers/settings.ts";
import type { AppContext } from "../../context.ts";
import { DomainError } from "../../domain/lifecycle.ts";
import { NODE_STALE_MS } from "../../provisioning/settings.ts";
import { actorOf, body, param, reason, router, type Ctx } from "../http.ts";

const cents = z.number().int().min(0).max(10_000_000);
const settingsSchema = z.object({
  autoPurchase: z.boolean(),
  provider: z.enum(VPS_PROVIDERS),
  hetznerServerType: z.string().trim().regex(/^[a-z0-9-]{2,40}$/),
  hetznerLocation: z.string().trim().regex(/^[a-z0-9-]{2,20}$/),
  hetznerImage: z.string().trim().regex(/^[a-z0-9.-]{2,60}$/).nullable(),
  hetznerMonthlyCostCents: cents,
  hostingerItemId: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{2,120}$/),
  hostingerTemplateId: z.number().int().positive().nullable(),
  hostingerDataCenterId: z.number().int().positive().nullable(),
  hostingerMonthlyCostCents: cents,
  hostingerSetupFeeCents: cents,
  contaboProductId: z.string().trim().regex(/^[A-Za-z0-9-]{1,40}$/),
  contaboRegion: z.string().trim().regex(/^[A-Za-z0-9-]{2,40}$/),
  contaboImageId: z.string().trim().regex(/^[A-Za-z0-9-]{8,64}$/).nullable(),
  contaboMonthlyCostCents: cents,
  contaboSetupFeeCents: cents,
});

function ownerOnly(c: Ctx) {
  if (c.get("admin").role !== "owner") throw new DomainError("Só o dono muda as configurações de compra de VPS", 403);
}

/** The customers' own computers (/api/computers): machines, pending purchases, settings. */
export function computerRoutes(ctx: AppContext) {
  const app = router();

  app.get("/", async (c) => {
    const [machines, settings, revenue] = await Promise.all([
      ctx.db.query(
        `SELECT m.id, m.provider, m.organization_id, o.name AS organization_name, m.purpose, m.status, m.status_reason, m.plan_ref, m.region, m.ipv4,
           m.hostname, m.monthly_cost_cents, m.setup_fee_cents, m.provider_vm_id, m.provider_order_id, m.provider_subscription_id, m.provider_state,
           m.auto_renew, m.expires_at, m.approved_at, m.ordered_at, m.ready_at, m.released_at, m.last_error, m.created_at,
           n.id AS node_id, n.name AS node_name, n.last_seen_at, n.agent_version,
           (SELECT i.id FROM instances i WHERE i.node_id = n.id AND i.decommissioned_at IS NULL LIMIT 1) AS instance_id,
           (SELECT i.id FROM instances i WHERE i.move_to_node_id = n.id AND i.decommissioned_at IS NULL LIMIT 1) AS waiting_move_instance_id
         FROM vps_machines m LEFT JOIN organizations o ON o.id = m.organization_id LEFT JOIN nodes n ON n.vps_machine_id = m.id
         ORDER BY (m.status IN ('awaiting_approval', 'release_pending', 'failed')) DESC, m.created_at DESC LIMIT 500`),
      vpsSettings(ctx.db),
      ctx.db.query<{ price: number }>(`SELECT price_cents AS price FROM addons WHERE code = 'computador-adicional'`),
    ]);
    const now = ctx.now().getTime();
    return c.json({
      settings, configured: configuredProviders(ctx), addonPriceCents: Number(revenue.rows[0]?.price ?? 15900),
      machines: machines.rows.map((row) => ({ ...row, online: row.last_seen_at ? now - new Date(row.last_seen_at as string).getTime() < NODE_STALE_MS : false })),
    });
  });

  app.put("/settings", async (c) => {
    ownerOnly(c);
    const s = await body(c, settingsSchema);
    await ctx.db.tx(async (q) => {
      await q.query(
        `UPDATE vps_settings SET auto_purchase = $1, provider = $2, hetzner_server_type = $3, hetzner_location = $4, hetzner_image = $5,
           hetzner_monthly_cost_cents = $6, hostinger_item_id = $7, hostinger_template_id = $8, hostinger_data_center_id = $9,
           hostinger_monthly_cost_cents = $10, hostinger_setup_fee_cents = $11, contabo_product_id = $12, contabo_region = $13, contabo_image_id = $14,
           contabo_monthly_cost_cents = $15, contabo_setup_fee_cents = $16, updated_by = $17 WHERE id`,
        [s.autoPurchase, s.provider, s.hetznerServerType, s.hetznerLocation, s.hetznerImage, s.hetznerMonthlyCostCents, s.hostingerItemId,
          s.hostingerTemplateId, s.hostingerDataCenterId, s.hostingerMonthlyCostCents, s.hostingerSetupFeeCents, s.contaboProductId, s.contaboRegion,
          s.contaboImageId, s.contaboMonthlyCostCents, s.contaboSetupFeeCents, c.get("admin").id]);
      await audit(q, actorOf(c), { action: "computer.settings_changed", targetType: "vps_settings", data: s });
    });
    return c.json({ ok: true });
  });

  app.post("/sync/:organizationId", async (c) => c.json(await syncOrganizationComputers(ctx, param(c, "organizationId"), actorOf(c))));

  app.post("/:id/approve", async (c) => {
    await approveMachine(ctx, actorOf(c), param(c, "id"));
    return c.json({ ok: true });
  });

  app.post("/:id/discard", async (c) => {
    const input = await body(c, z.object({ reason }));
    await discardMachine(ctx, actorOf(c), param(c, "id"), input.reason);
    return c.json({ ok: true });
  });

  app.post("/:id/retry", async (c) => {
    await retryMachine(ctx, actorOf(c), param(c, "id"));
    return c.json({ ok: true });
  });

  app.post("/:id/release", async (c) => {
    ownerOnly(c);
    const input = await body(c, z.object({ reason, confirm: z.literal(true) }));
    return c.json({ ok: true, ...(await releaseMachine(ctx, actorOf(c), param(c, "id"), input.reason)) });
  });

  app.post("/instances/:id/move", async (c) => {
    const input = await body(c, z.object({ reason, confirm: z.literal(true) }));
    await moveInstance(ctx, actorOf(c), param(c, "id"), input.reason);
    return c.json({ ok: true });
  });

  return app;
}
