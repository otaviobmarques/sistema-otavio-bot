import { z } from "zod";
import type { AppContext } from "../../context.ts";
import { DomainError } from "../../domain/lifecycle.ts";
import {
  decommissionInstance, desiredOf, provisionForOrganization, reprovisionInstance, startInstance, stopInstance, syncInstancePlan,
} from "../../provisioning/instances.ts";
import { createNode, rotateNodeToken, setNodeStatus } from "../../provisioning/nodes.ts";
import { NODE_STALE_MS, provisioningSettings } from "../../provisioning/settings.ts";
import { powerStateOf } from "../../provisioning/sleep.ts";
import { actorOf, body, param, reason, router, type Ctx } from "../http.ts";

const nodeSchema = z.object({
  name: z.string().trim().min(2).max(63),
  kind: z.enum(["dedicated", "shared_free"]).default("shared_free"),
  publicIp: z.string().trim().max(64).nullable().optional(),
  capacityInstances: z.number().int().min(1).max(10_000).nullable().optional(),
  capacityRamMb: z.number().int().min(256).max(10_000_000).nullable().optional(),
});

function ownerOnly(c: Ctx) {
  if (c.get("admin").role !== "owner") throw new DomainError("Só o dono cadastra servidores e troca os tokens deles", 403);
}

/** Instances and the nodes that run them (/api/instances). */
export function instanceRoutes(ctx: AppContext) {
  const app = router();

  app.get("/", async (c) => {
    const [instances, nodes] = await Promise.all([
      ctx.db.query(
        `SELECT i.id, i.organization_id, o.name AS organization_name, i.slug, i.public_url, i.mode, i.state, i.state_reason, i.node_id, n.name AS node_name,
           i.operator_stopped, i.decommissioned_at, i.observed_state, i.observed_health, i.observed_error, i.observed_at, i.ready_at, i.generation,
           i.plan_tier_synced, i.created_at, p.code AS plan_code, p.name AS plan_name,
           i.disk_used_bytes, i.disk_quota_bytes, i.disk_state, i.disk_measured_at,
           i.sleeping_since, i.wake_at, i.woke_at, i.power_busy, i.power_checked_at, i.unhealthy_since, i.unhealthy_alerted_at, p.idle_sleep_minutes
         FROM instances i JOIN organizations o ON o.id = i.organization_id LEFT JOIN nodes n ON n.id = i.node_id
         LEFT JOIN LATERAL (SELECT s.plan_id FROM subscriptions s WHERE s.organization_id = i.organization_id
                            ORDER BY (s.status <> 'canceled') DESC, s.created_at DESC LIMIT 1) s ON true
         LEFT JOIN plans p ON p.id = s.plan_id
         ORDER BY (i.decommissioned_at IS NULL) DESC, i.created_at DESC LIMIT 500`),
      ctx.db.query(
        `SELECT n.id, n.name, n.kind, n.public_ip, n.capacity_instances, n.capacity_ram_mb, n.status, n.last_seen_at, n.agent_version, n.last_error,
           n.orphan_containers, n.created_at, n.down_alerted_at, (n.agent_token_hash IS NOT NULL) AS has_token,
           (SELECT count(*)::int FROM instances i WHERE i.node_id = n.id AND i.decommissioned_at IS NULL) AS instances
         FROM nodes n ORDER BY n.created_at`),
    ]);
    const now = ctx.now().getTime();
    return c.json({
      settings: provisioningSettings(ctx.config),
      instances: instances.rows.map((row) => ({ ...row, desired: desiredOf(row as never), power: powerStateOf(row as never, ctx.now()) })),
      nodes: nodes.rows.map((row) => ({ ...row, online: row.last_seen_at ? now - new Date(row.last_seen_at as string).getTime() < NODE_STALE_MS : false })),
    });
  });

  app.post("/provision/:organizationId", async (c) => {
    const result = await provisionForOrganization(ctx, actorOf(c), param(c, "organizationId"));
    if (!result) throw new DomainError("Este cliente não tem assinatura ativa (ou está suspenso): nada a provisionar", 409);
    return c.json({ instance: { id: result.instance.id, slug: result.instance.slug }, created: result.created }, result.created ? 201 : 200);
  });

  app.post("/:id/stop", async (c) => {
    const input = await body(c, z.object({ reason }));
    await stopInstance(ctx, actorOf(c), param(c, "id"), input.reason);
    return c.json({ ok: true });
  });

  app.post("/:id/start", async (c) => {
    await startInstance(ctx, actorOf(c), param(c, "id"));
    return c.json({ ok: true });
  });

  app.post("/:id/reprovision", async (c) => {
    const input = await body(c, z.object({ reason }));
    await reprovisionInstance(ctx, actorOf(c), param(c, "id"), input.reason);
    return c.json({ ok: true });
  });

  app.post("/:id/decommission", async (c) => {
    const input = await body(c, z.object({ reason, confirm: z.literal(true) }));
    await decommissionInstance(ctx, actorOf(c), param(c, "id"), input.reason);
    return c.json({ ok: true });
  });

  app.post("/:id/sync-plan", async (c) => {
    const synced = await syncInstancePlan(ctx, param(c, "id")).catch((error) => { throw new DomainError((error as Error).message, 502); });
    return c.json({ ok: true, synced });
  });

  app.post("/nodes", async (c) => {
    ownerOnly(c);
    const input = await body(c, nodeSchema);
    const created = await createNode(ctx.db, actorOf(c), input);
    return c.json({ node: { id: created.node.id, name: created.node.name }, token: created.token }, 201);
  });

  app.post("/nodes/:id/token", async (c) => {
    ownerOnly(c);
    return c.json({ token: await rotateNodeToken(ctx.db, actorOf(c), param(c, "id")) });
  });

  app.post("/nodes/:id/status", async (c) => {
    const input = await body(c, z.object({ status: z.enum(["active", "draining", "offline"]) }));
    await setNodeStatus(ctx.db, actorOf(c), param(c, "id"), input.status);
    return c.json({ ok: true });
  });

  return app;
}
