import { bodyLimit } from "hono/body-limit";
import type { AppContext } from "../../context.ts";
import { applyStatusReport, desiredStateFor, sweepProvisioning } from "../../provisioning/instances.ts";
import { nodeForToken } from "../../provisioning/nodes.ts";
import { statusReportSchema, taskCompleteSchema, taskFailSchema, taskPartRequestSchema, wakeRequestSchema, type WakeAnswer } from "../../provisioning/protocol.ts";
import { backupPartUrl, completeBackup, completeRestore, failTask } from "../../backups/backups.ts";
import { DomainError } from "../../domain/lifecycle.ts";
import { checkIdleInstances, wakeDueInstances, wakeInstance } from "../../provisioning/sleep.ts";
import { router, type Ctx } from "../http.ts";
import { hit } from "../../auth/rate-limit.ts";
import { enrollMachine } from "../../computers/provisioning.ts";

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

  // The backup and restore helpers (src/node-agent/tasks.ts), with this node's token: only this node's tasks.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const small = bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.json({ error: "corpo grande demais" }, 413) });
  const taskCall = (handler: (nodeId: string, id: string, body: unknown) => Promise<unknown>) => async (c: Ctx) => {
    const id = c.req.param("id") ?? "";
    if (!UUID.test(id)) return c.json({ error: "tarefa inválida" }, 400);
    try {
      return c.json((await handler(c.get("node").id, id, await c.req.json().catch(() => null))) ?? { ok: true });
    } catch (error) {
      if (error instanceof DomainError) return c.json({ error: error.message }, error.status as 400);
      if (error instanceof BadTaskBody) return c.json({ error: "pedido inválido" }, 400);
      throw error;
    }
  };
  app.post("/tasks/:id/part", small, taskCall(async (nodeId, id, body) => {
    const parsed = taskPartRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadTaskBody();
    return { url: await backupPartUrl(ctx, nodeId, id, parsed.data.partNumber) };
  }));
  app.post("/tasks/:id/complete", small, taskCall(async (nodeId, id, body) => {
    const parsed = taskCompleteSchema.safeParse(body);
    if (!parsed.success) throw new BadTaskBody();
    await completeBackup(ctx, nodeId, id, parsed.data);
  }));
  app.post("/tasks/:id/restored", small, taskCall(async (nodeId, id) => {
    await completeRestore(ctx, nodeId, id);
  }));
  app.post("/tasks/:id/fail", small, taskCall(async (nodeId, id, body) => {
    const parsed = taskFailSchema.safeParse(body);
    if (!parsed.success) throw new BadTaskBody();
    await failTask(ctx, nodeId, id, parsed.data.error);
  }));

  return app;
}

class BadTaskBody extends Error {}

const ENROLL_LIMIT = { windowMs: 60 * 60_000, max: 60 };

/** POST /api/agent/v1/enroll: the first-boot script of a customer VPS trades its enrollment token for a node token. */
export function enrollRoute(ctx: AppContext) {
  return async (c: Ctx) => {
    if (!(await hit(ctx.db, `enroll:${c.get("ip")}`, ENROLL_LIMIT, ctx.now()))) return c.json({ error: "muitas tentativas" }, 429);
    let raw: { machineId?: unknown; enrollToken?: unknown };
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "corpo inválido" }, 400);
    }
    const answer = await enrollMachine(ctx, { machineId: raw?.machineId, enrollToken: raw?.enrollToken }, c.get("ip"));
    if (!answer) return c.json({ error: "inscrição recusada" }, 401);
    return c.json(answer);
  };
}
