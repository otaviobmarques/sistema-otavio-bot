import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InsufficientCreditsError, postLedger } from "../src/credits/ledger.ts";
import { claimJobs, enqueue, retryDelayMs, runJobs } from "../src/jobs/queue.ts";
import { advance, client, cnpj, sessionCookie, testContext, type TestContext } from "./helpers.ts";

async function org(ctx: TestContext): Promise<string> {
  const api = client(ctx, await sessionCookie(ctx));
  const response = await api.post("/api/clients", { name: "Loja da Ana", document: cnpj("112223330001"), ownerEmail: "ana@loja.com.br", ownerName: "Ana" });
  return response.data.client.id;
}

describe("livro de créditos", () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await testContext();
  });
  afterEach(() => ctx.db.close());

  it("posts once per external_reference, even when the same post races", async () => {
    const id = await org(ctx);
    const post = () => ctx.db.tx((q) => postLedger(q, { organizationId: id, bucket: "extra", kind: "purchase", amount: 700, externalReference: "payment:x:purchase" }));
    const results = await Promise.all([post(), post(), post()]);
    expect(results.filter((r) => r.applied)).toHaveLength(1);
    expect(results.every((r) => r.balanceAfter === 700)).toBe(true);
    const rows = await ctx.db.query<{ n: number }>("SELECT count(*)::int AS n FROM credit_ledger");
    expect(rows.rows[0]!.n).toBe(1);
    const wallet = await ctx.db.query("SELECT extra_balance FROM credit_wallets WHERE organization_id = $1", [id]);
    expect(wallet.rows[0]).toEqual({ extra_balance: 700 });
  });

  it("never lets a bucket go negative", async () => {
    const id = await org(ctx);
    await expect(ctx.db.tx((q) => postLedger(q, { organizationId: id, bucket: "plan", kind: "usage", amount: -1, externalReference: "u1" })))
      .rejects.toBeInstanceOf(InsufficientCreditsError);
  });

  it("an admin adjustment needs a reason and writes ledger + audit", async () => {
    const id = await org(ctx);
    const api = client(ctx, await sessionCookie(ctx, "operator", "op@domma.com.br"));
    expect((await api.post(`/api/clients/${id}/credits`, { bucket: "extra", amount: 250 })).status).toBe(400);
    expect((await api.post(`/api/clients/${id}/credits`, { bucket: "extra", amount: 250, reason: "ok" })).status).toBe(400);
    const done = await api.post(`/api/clients/${id}/credits`, { bucket: "extra", amount: 250, reason: "compensação por indisponibilidade" });
    expect(done.data).toEqual({ ok: true, balanceAfter: 250 });
    const ledger = await ctx.db.query("SELECT kind, amount, reason, admin_id IS NOT NULL AS by_admin FROM credit_ledger");
    expect(ledger.rows).toEqual([{ kind: "admin_adjust", amount: 250, reason: "compensação por indisponibilidade", by_admin: true }]);
    const audit = await ctx.db.query("SELECT actor_label, reason FROM audit_log WHERE action = 'credits.adjusted'");
    expect(audit.rows).toEqual([{ actor_label: "op@domma.com.br", reason: "compensação por indisponibilidade" }]);
    expect((await api.post(`/api/clients/${id}/credits`, { bucket: "extra", amount: -999, reason: "retirada indevida" })).status).toBe(400);
  });
});

describe("fila de tarefas em Postgres", () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await testContext();
  });
  afterEach(() => ctx.db.close());

  it("deduplicates queued jobs by key", async () => {
    expect(await enqueue(ctx.db, "t", {}, { dedupeKey: "k" })).not.toBeNull();
    expect(await enqueue(ctx.db, "t", {}, { dedupeKey: "k" })).toBeNull();
  });

  it("claims a job once and retries with backoff, then fails", async () => {
    await enqueue(ctx.db, "flaky", { n: 1 }, { maxAttempts: 2, runAt: ctx.now() });
    const first = await ctx.db.tx((q) => claimJobs(q, ctx.now(), 10));
    expect(first).toHaveLength(1);
    expect(await ctx.db.tx((q) => claimJobs(q, ctx.now(), 10))).toHaveLength(0);
    advance(ctx, 6 * 60_000);
    // a job whose worker died is taken again after the stale-lock window
    expect(await ctx.db.tx((q) => claimJobs(q, ctx.now(), 10))).toHaveLength(1);

    await ctx.db.query("UPDATE jobs SET status = 'queued', attempts = 0, locked_at = NULL");
    const handlers = { flaky: async () => { throw new Error("falhou"); } };
    expect(await runJobs(ctx, handlers)).toEqual({ done: 0, retried: 1, failed: 0 });
    expect(await runJobs(ctx, handlers)).toEqual({ done: 0, retried: 0, failed: 0 });
    advance(ctx, retryDelayMs(1));
    expect(await runJobs(ctx, handlers)).toEqual({ done: 0, retried: 0, failed: 1 });
    const row = await ctx.db.query("SELECT status, last_error FROM jobs");
    expect(row.rows[0]).toEqual({ status: "failed", last_error: "falhou" });
  });

  it("concurrent workers never take the same job (FOR UPDATE SKIP LOCKED)", async () => {
    for (let i = 0; i < 20; i++) await enqueue(ctx.db, "ok", { i }, { runAt: ctx.now() });
    const seen: number[] = [];
    const handlers = { ok: async (_: unknown, payload: Record<string, unknown>) => { seen.push(Number(payload.i)); } };
    const results = await Promise.all([runJobs(ctx, handlers, { limit: 8 }), runJobs(ctx, handlers, { limit: 8 }), runJobs(ctx, handlers, { limit: 8 })]);
    expect(results.reduce((sum, r) => sum + r.done, 0)).toBe(20);
    expect(new Set(seen).size).toBe(20);
    expect(seen).toHaveLength(20);
  });
});
