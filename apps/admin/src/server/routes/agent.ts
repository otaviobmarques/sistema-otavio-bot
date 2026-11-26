import { bodyLimit } from "hono/body-limit";
import type { AppContext } from "../../context.ts";
import { applyStatusReport, desiredStateFor, sweepProvisioning } from "../../provisioning/instances.ts";
import { nodeForToken } from "../../provisioning/nodes.ts";
import { statusReportSchema } from "../../provisioning/protocol.ts";
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
    return c.json({ ok: true, ready: result.ready.length });
  });

  return app;
}
