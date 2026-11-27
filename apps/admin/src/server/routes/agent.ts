import { bodyLimit } from "hono/body-limit";
import type { AppContext } from "../../context.ts";
import { applyStatusReport, desiredStateFor, sweepProvisioning } from "../../provisioning/instances.ts";
import { nodeForToken } from "../../provisioning/nodes.ts";
import { statusReportSchema, wakeRequestSchema, type WakeAnswer } from "../../provisioning/protocol.ts";
import { checkIdleInstances, wakeDueInstances, wakeInstance } from "../../provisioning/sleep.ts";
import { router } from "../http.ts";

/**
 * The node agents' API (/api/agent/v1/*), on the Admin's host only. A node's bearer token is its only credential:
 * no cookie, no session. The answer carries instance secrets, so it is never cached and never logged.
 */
export function agentRoutes(ctx: AppContext) {
  const app = router();

  app.use("*", async (c, next) => {
    const node = await nodeForToken(ctx.db, c.req.header("authorization"));
    if (!node) return c.json({ error: "token do servidor inválido" }, 401);
    c.set("node", node);
    await next();
  });

  app.get("/desired", async (c) => {
    const node = c.get("node");
    // Each poll also gives new subscriptions their instance and places instances that waited for room, so a node
    // comes up even where the cron runs rarely. A failure here never keeps the node from its desired state.
    await sweepProvisioning(ctx, 5).catch((error) => console.error("[agent] varredura", (error as Error).message));
    // Sleeping instances whose next routine is near start now, whatever the cron does.
    await wakeDueInstances(ctx, { nodeId: node.id }).catch((error) => console.error("[agent] despertar", (error as Error).message));
    return c.json(await desiredStateFor(ctx, node));
  });

  app.post("/status", bodyLimit({ maxSize: 512 * 1024, onError: (c) => c.json({ error: "relatório grande demais" }, 413) }), async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "corpo inválido" }, 400);
    }
    const parsed = statusReportSchema.safeParse(raw);
    if (!parsed.success) return c.json({ error: "relatório inválido" }, 400);
    const result = await applyStatusReport(ctx, c.get("node"), parsed.data);
    // About once a minute per instance, the awake ones of a plan that sleeps are asked whether they are idle.
    await checkIdleInstances(ctx, { nodeId: c.get("node").id, limit: 5 }).catch((error) => console.error("[agent] dormir", (error as Error).message));
    return c.json({ ok: true, ready: result.ready.length });
  });

  // The agent's waking page: someone visited a sleeping instance of this node.
  app.post("/wake", bodyLimit({ maxSize: 4096, onError: (c) => c.json({ error: "corpo grande demais" }, 413) }), async (c) => {
    const parsed = wakeRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "pedido inválido" }, 400);
    const row = (await ctx.db.query<{ sleeping_since: Date | null }>(
      "SELECT sleeping_since FROM instances WHERE id = $1 AND node_id = $2 AND decommissioned_at IS NULL", [parsed.data.instanceId, c.get("node").id])).rows[0];
    let answer: WakeAnswer;
    if (!row) answer = { ok: false, state: "unknown" };
    else if (!row.sleeping_since) answer = { ok: true, state: "not_sleeping" };
    else {
      const woke = await wakeInstance(ctx, { type: "system", label: "visita ao endereço" }, parsed.data.instanceId, "visita");
      answer = { ok: true, state: woke.woke ? "waking" : "not_sleeping" };
    }
    return c.json(answer, answer.ok ? 200 : 404);
  });

  return app;
}
