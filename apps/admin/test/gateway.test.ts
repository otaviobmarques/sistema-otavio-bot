import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { settleRequest, type UsageRecord } from "../src/gateway/accounting.ts";
import { priceFromRow, type PriceRow } from "../src/gateway/pricing.ts";
import { resolveGatewayToken } from "../src/gateway/tokens.ts";
import { tick } from "../src/jobs/handlers.ts";
import { anthropicStream, json, openaiChatStream, openaiResponsesStream, sse } from "./fake-ai.ts";
import { addProviderKey, gatewayFixture, HOSTS, type GatewayFixture } from "./gateway-fixture.ts";
import { advance } from "./helpers.ts";

const haiku = (extra: Record<string, unknown> = {}) => ({ model: "claude-haiku-4-5", max_tokens: 1000, stream: true, messages: [{ role: "user", content: "Oi" }], ...extra });
const ledger = (f: GatewayFixture) => f.ctx.db.query<{ bucket: string; kind: string; amount: number; external_reference: string }>(
  "SELECT bucket, kind, amount, external_reference FROM credit_ledger WHERE organization_id = $1 AND kind = 'usage' ORDER BY id", [f.organizationId]);
const events = (f: GatewayFixture) => f.ctx.db.query<Record<string, any>>("SELECT * FROM usage_events WHERE organization_id = $1 ORDER BY id", [f.organizationId]);

describe("gateway de IA", () => {
  let f: GatewayFixture;
  beforeEach(async () => {
    f = await gatewayFixture();
  });
  afterEach(() => f.ctx.db.close());

  it("streams Anthropic Messages unchanged and settles the reported usage", async () => {
    let upstream = "";
    f.ai.next(HOSTS.anthropic, (call) => {
      expect(call.url).toBe(`https://${HOSTS.anthropic}/v1/messages`);
      expect(call.headers["x-api-key"]).toBe("sk-anthropic-100");
      expect(call.headers["anthropic-version"]).toBe("2023-06-01");
      expect(call.headers.authorization).toBeUndefined();
      const response = anthropicStream({ input: 1000, output: 500, cacheRead: 2000 });
      const [a, b] = response.body!.tee();
      void new Response(b).text().then((text) => { upstream = text; });
      return new Response(a, response);
    });
    const response = await f.call("/v1/anthropic/v1/messages", haiku(), { "x-arko-company": "Clínica Centro", "x-arko-bot": "Recepção", "anthropic-beta": "x-1" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const text = await response.text();
    await f.gateway.drain();
    expect(text).toBe(upstream);
    expect(f.ai.calls[0]!.headers["anthropic-beta"]).toBe("x-1");
    // (1000 × 1 + 2000 × 0,1 + 500 × 5) / 1e6 = US$ 0,0037 → × 5,5 × 100 × 1,3 = 2,65 → 3 créditos
    expect((await ledger(f)).rows).toEqual([{ bucket: "plan", kind: "usage", amount: -3, external_reference: expect.stringMatching(/^usage:gw_.+:plan$/) }]);
    expect(await f.wallet()).toMatchObject({ plan: 3997, extra: 0 });
    const [event] = (await events(f)).rows;
    expect(event).toMatchObject({ status: "ok", model: "claude-haiku-4-5", provider: "anthropic", input_tokens: 1000, output_tokens: 500, cache_read_tokens: 2000,
      cost_usd_micros: 3700, credits: 3, company: "Clínica Centro", bot: "Recepção", usage_estimated: false, http_status: 200 });
    expect(Number(event!.cost_brl_cents)).toBeCloseTo(2.035, 3);
    const reservation = await f.ctx.db.query("SELECT status FROM credit_reservations");
    expect(reservation.rows).toEqual([{ status: "settled" }]);
    expect(response.headers.get("x-arko-request-id")).toBe(event!.request_id);
  });

  it("asks OpenAI for stream usage and bills Chat Completions with cached tokens", async () => {
    f.ai.next(HOSTS.openai, () => openaiChatStream({ prompt: 2000, completion: 300, cached: 1000 }));
    const response = await f.call("/v1/openai/v1/chat/completions", { model: "gpt-5-mini", stream: true, messages: [{ role: "user", content: "Oi" }] });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("[DONE]");
    await f.gateway.drain();
    const sent = f.ai.calls[0]!;
    expect(sent.url).toBe(`https://${HOSTS.openai}/v1/chat/completions`);
    expect(sent.headers.authorization).toBe("Bearer sk-openai-100");
    expect(sent.body.stream_options).toEqual({ include_usage: true });
    // (1000 × 0,25 + 1000 × 0,025 + 300 × 2) / 1e6 = US$ 0,000875 → 0,63 → 1 crédito
    expect((await events(f)).rows[0]).toMatchObject({ input_tokens: 1000, cache_read_tokens: 1000, output_tokens: 300, cost_usd_micros: 875, credits: 1 });
  });

  it("bills the Responses API from response.completed", async () => {
    f.ai.next(HOSTS.openai, (call) => {
      expect(call.url).toBe(`https://${HOSTS.openai}/v1/responses`);
      return openaiResponsesStream({ input: 10_000, output: 2000, cached: 4000 });
    });
    const response = await f.call("/v1/openai/v1/responses", { model: "gpt-5-mini", stream: true, input: "Oi", max_output_tokens: 4000 });
    await response.text();
    await f.gateway.drain();
    // (6000 × 0,25 + 4000 × 0,025 + 2000 × 2) / 1e6 = US$ 0,0056 → 4,004 → 5 créditos
    expect((await events(f)).rows[0]).toMatchObject({ input_tokens: 6000, cache_read_tokens: 4000, output_tokens: 2000, credits: 5 });
  });

  it("uses OpenRouter's reported cost and asks it for usage accounting", async () => {
    f.ai.next(HOSTS.openrouter, () => openaiChatStream({ prompt: 100, completion: 100, cost: 0.02 }));
    const response = await f.call("/v1/openrouter/v1/chat/completions", { model: "google/gemini-2.5-flash", stream: true, messages: [] });
    await response.text();
    await f.gateway.drain();
    expect(f.ai.calls[0]!.body.usage).toEqual({ include: true });
    // US$ 0,02 × 5,5 × 100 × 1,3 = 14,3 → 15 créditos
    expect((await events(f)).rows[0]).toMatchObject({ cost_usd_micros: 20_000, credits: 15 });
  });

  it("bills a non-streaming answer from its body", async () => {
    f.ai.next(HOSTS.anthropic, () => json(200, { id: "m", type: "message", content: [{ type: "text", text: "oi" }], usage: { input_tokens: 10_000, output_tokens: 1000 } }));
    const response = await f.call("/v1/anthropic/v1/messages", haiku({ stream: false }));
    expect(await response.json()).toMatchObject({ id: "m" });
    // (10000 + 5000) / 1e6 = US$ 0,015 → 10,725 → 11
    expect((await events(f)).rows[0]).toMatchObject({ credits: 11 });
    expect(await f.wallet()).toMatchObject({ plan: 3989 });
  });

  it("applies a per-model markup and the exchange rate from the price table", async () => {
    await f.ctx.db.query("UPDATE model_prices SET markup_percent = 100 WHERE model = 'claude-haiku-4-5'");
    await f.setSettings({ usd_brl_rate: 6 });
    f.ai.next(HOSTS.anthropic, () => anthropicStream({ input: 10_000, output: 0 }));
    await (await f.call("/v1/anthropic/v1/messages", haiku())).text();
    await f.gateway.drain();
    // US$ 0,01 × 6 × 100 × 2 = 12
    expect((await events(f)).rows[0]).toMatchObject({ credits: 12 });
  });

  it("refuses with 402 credits_used_up and a pt-BR JSON body once the balance is gone", async () => {
    await f.ctx.db.query("UPDATE credit_wallets SET plan_balance = 0 WHERE organization_id = $1", [f.organizationId]);
    const response = await f.call("/v1/anthropic/v1/messages", haiku());
    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body).toMatchObject({ code: "credits_used_up", message: expect.stringContaining("créditos de IA desta conta acabaram") });
    expect(body.error).toMatchObject({ type: "credits_used_up" });
    expect(f.ai.calls).toHaveLength(0);
    expect((await events(f)).rows[0]).toMatchObject({ status: "refused", error_code: "credits_used_up", credits: 0 });
  });

  it("lowers max_tokens to what the balance pays for, and lets the last answer overdraw within the tolerance", async () => {
    await f.ctx.db.query("UPDATE credit_wallets SET plan_balance = 5 WHERE organization_id = $1", [f.organizationId]);
    await f.setSettings({ overdraft_credits: 0 });
    f.ai.next(HOSTS.anthropic, () => anthropicStream({ input: 100, output: 1200 }));
    await (await f.call("/v1/anthropic/v1/messages", haiku({ max_tokens: 64_000 }))).text();
    await f.gateway.drain();
    const sent = f.ai.calls[0]!.body.max_tokens;
    expect(sent).toBeGreaterThan(256);
    expect(sent).toBeLessThan(1500);
    // (100 + 1200 × 5) / 1e6 × 715 = 4,36 → 5: the whole balance, nothing below zero
    expect(await f.wallet()).toMatchObject({ plan: 0, extra: 0 });

    await f.ctx.db.query("UPDATE credit_wallets SET plan_balance = 2 WHERE organization_id = $1", [f.organizationId]);
    await f.setSettings({ overdraft_credits: 20 });
    f.ai.next(HOSTS.anthropic, () => anthropicStream({ input: 100, output: 2000 }));
    await (await f.call("/v1/anthropic/v1/messages", haiku({ max_tokens: 2000 }))).text();
    await f.gateway.drain();
    // 7,22 → 8 créditos: 2 do plano e 6 avulsos abaixo de zero
    expect(await f.wallet()).toMatchObject({ plan: 0, extra: -6 });
    expect((await f.call("/v1/anthropic/v1/messages", haiku())).status).toBe(402);
  });

  it("two concurrent requests never reserve the same credits", async () => {
    await f.ctx.db.query("UPDATE credit_wallets SET plan_balance = 30 WHERE organization_id = $1", [f.organizationId]);
    await f.setSettings({ overdraft_credits: 0 });
    let open!: () => void;
    const gate = new Promise<void>((resolve) => { open = resolve; });
    f.ai.next(HOSTS.anthropic, () => anthropicStream({ input: 100, output: 4000 }, { gate }));
    f.ai.next(HOSTS.anthropic, () => anthropicStream({ input: 100, output: 4000 }, { gate }));
    // max_tokens 6000 de Haiku: até 21,5 créditos cada; mínimo (256 tokens) ≈ 1
    const both = await Promise.all([f.call("/v1/anthropic/v1/messages", haiku({ max_tokens: 6000 })), f.call("/v1/anthropic/v1/messages", haiku({ max_tokens: 6000 }))]);
    const held = await f.ctx.db.query<{ n: number }>("SELECT COALESCE(SUM(credits), 0)::int AS n FROM credit_reservations WHERE status = 'held'");
    expect(held.rows[0]!.n).toBeLessThanOrEqual(30);
    const second = f.ai.calls[1]?.body.max_tokens;
    expect(second === undefined || second < 6000).toBe(true);
    open();
    await Promise.all(both.map((response) => response.text()));
    await f.gateway.drain();
    const wallet = await f.wallet();
    expect(wallet.total).toBeGreaterThanOrEqual(0);
    const charged = (await events(f)).rows.reduce((sum, row) => sum + Number(row.credits), 0);
    expect(charged).toBeLessThanOrEqual(30);
  });

  it("a burst of concurrent requests holds no more than the balance", async () => {
    await f.ctx.db.query("UPDATE credit_wallets SET plan_balance = 40 WHERE organization_id = $1", [f.organizationId]);
    await f.setSettings({ overdraft_credits: 0 });
    let open!: () => void;
    const gate = new Promise<void>((resolve) => { open = resolve; });
    for (let i = 0; i < 8; i++) f.ai.next(HOSTS.anthropic, () => anthropicStream({ input: 10, output: 10 }, { gate }));
    const responses = await Promise.all(Array.from({ length: 8 }, () => f.call("/v1/anthropic/v1/messages", haiku({ max_tokens: 6000 }))));
    const held = await f.ctx.db.query<{ n: number }>("SELECT COALESCE(SUM(credits), 0)::int AS n FROM credit_reservations WHERE status = 'held'");
    expect(held.rows[0]!.n).toBeLessThanOrEqual(40);
    expect(responses.some((response) => response.status === 402)).toBe(true);
    open();
    await Promise.all(responses.map((response) => response.text()));
    await f.gateway.drain();
    expect((await f.wallet()).total).toBeGreaterThanOrEqual(0);
  });

  it("refuses a second concurrent request when the first holds the whole balance", async () => {
    await f.ctx.db.query("UPDATE credit_wallets SET plan_balance = 20 WHERE organization_id = $1", [f.organizationId]);
    await f.setSettings({ overdraft_credits: 0 });
    let open!: () => void;
    const gate = new Promise<void>((resolve) => { open = resolve; });
    f.ai.next(HOSTS.anthropic, () => anthropicStream({ input: 10, output: 10 }, { gate }));
    const first = await f.call("/v1/anthropic/v1/messages", haiku({ max_tokens: 6000 }));
    expect(first.status).toBe(200);
    const second = await f.call("/v1/anthropic/v1/messages", haiku({ max_tokens: 6000 }));
    expect(second.status).toBe(402);
    expect((await second.json()).code).toBe("credits_used_up");
    open();
    await first.text();
    await f.gateway.drain();
    expect((await f.wallet()).plan).toBe(19);
    expect((await f.call("/v1/anthropic/v1/messages", haiku())).status).not.toBe(402);
  });

  it("refuses a model outside the plan with 403 model_not_in_plan", async () => {
    const response = await f.call("/v1/anthropic/v1/messages", haiku({ model: "claude-opus-4-5" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "model_not_in_plan" });
    expect((await f.call("/v1/anthropic/v1/messages", haiku({ model: "modelo-inventado" }))).status).toBe(403);
    // the price table's provider must match the route
    expect((await (await f.call("/v1/openai/v1/chat/completions", { model: "claude-haiku-4-5", messages: [] })).json()).code).toBe("model_unavailable");
    expect(f.ai.calls).toHaveLength(0);
  });

  it("lists the plan's catalog on GET /v1/models", async () => {
    const all = await f.gateway.app.request("/v1/models", { headers: { authorization: `Bearer ${f.token}` } });
    const body = await all.json();
    expect(body.data.map((m: any) => m.id).sort()).toEqual(["claude-haiku-4-5", "google/gemini-2.5-flash", "gpt-5-mini"]);
    expect(body).toMatchObject({ object: "list", plan: "essencial", usable: true });
    const anthropic = await (await f.gateway.app.request("/v1/anthropic/v1/models", { headers: { "x-api-key": f.token } })).json();
    expect(anthropic.data).toEqual([expect.objectContaining({ id: "claude-haiku-4-5", type: "model", display_name: "Claude Haiku 4.5" })]);
    expect((await f.gateway.app.request("/v1/models")).status).toBe(401);
  });

  it("rejects revoked, expired and malformed tokens with 401", async () => {
    await f.admin.post(`/api/clients/${f.organizationId}/gateway-tokens/${f.tokenId}/revoke`, { reason: "instância apagada" });
    const response = await f.call("/v1/anthropic/v1/messages", haiku());
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "invalid_token" });
    expect((await f.call("/v1/anthropic/v1/messages", haiku(), { authorization: "Bearer sk-ant-qualquer" })).status).toBe(401);
    const issued = await f.admin.post(`/api/clients/${f.organizationId}/gateway-tokens`, { label: "curta" });
    await f.ctx.db.query("UPDATE gateway_tokens SET expires_at = $2 WHERE id = $1", [issued.data.id, new Date(f.ctx.now().getTime() - 1000)]);
    expect(await resolveGatewayToken(f.ctx.db, issued.data.token, f.ctx.now())).toBeNull();
  });

  it("refuses suspended, overdue and canceled customers with 402 plan_suspended", async () => {
    await f.ctx.db.query("UPDATE subscriptions SET status = 'past_due', past_due_since = now() WHERE id = $1", [f.subscription]);
    const response = await f.call("/v1/anthropic/v1/messages", haiku());
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ code: "plan_suspended" });
    await f.ctx.db.query("UPDATE subscriptions SET status = 'active', past_due_since = NULL WHERE id = $1", [f.subscription]);
    await f.ctx.db.query("UPDATE organizations SET status = 'suspended', status_reason = 'manual', status_reason_code = 'manual' WHERE id = $1", [f.organizationId]);
    expect((await (await f.call("/v1/anthropic/v1/messages", haiku())).json()).code).toBe("plan_suspended");
    expect(f.ai.calls).toHaveLength(0);
  });

  it("settles a request once, even when settlement runs twice, and refuses a repeated request id", async () => {
    const price = priceFromRow((await f.ctx.db.query<PriceRow>("SELECT * FROM model_prices WHERE model = 'claude-haiku-4-5'")).rows[0]!);
    const caller = (await resolveGatewayToken(f.ctx.db, f.token, f.ctx.now()))!;
    const record: UsageRecord = { caller, requestId: "dup-1", provider: "anthropic", model: price.model, endpoint: "v1/messages", company: null, bot: null,
      providerKeyId: null, upstreamModel: null, httpStatus: 200, durationMs: 1 };
    const settings = { markupPercent: 30, usdBrlRate: 5.5, overdraftCredits: 0, rateLimitPerMinute: 100, reservationMinutes: 30 };
    const usage = { input: 10_000, output: 1000, cacheRead: 0, cacheWrite: 0 };
    const results = await Promise.all([1, 2, 3].map(() => settleRequest(f.ctx.db, { record, usage, price, settings, estimated: false, now: f.ctx.now() })));
    expect(results.map((r) => r.credits).sort()).toEqual([0, 0, 11]);
    expect((await ledger(f)).rows).toHaveLength(1);
    expect(await f.wallet()).toMatchObject({ plan: 3989 });

    f.ai.next(HOSTS.anthropic, () => anthropicStream({ input: 1, output: 1 }));
    const first = await f.call("/v1/anthropic/v1/messages", haiku(), { "x-arko-request-id": "turno-42" });
    await first.text();
    await f.gateway.drain();
    const again = await f.call("/v1/anthropic/v1/messages", haiku(), { "x-arko-request-id": "turno-42" });
    expect(again.status).toBe(409);
    expect((await again.json()).code).toBe("duplicate_request");
    expect(f.ai.calls).toHaveLength(1);
  });

  it("passes provider errors through, releases the reservation and charges nothing", async () => {
    f.ai.next(HOSTS.anthropic, () => json(400, { type: "error", error: { type: "invalid_request_error", message: "max_tokens: muito grande" } }));
    const response = await f.call("/v1/anthropic/v1/messages", haiku());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { type: "invalid_request_error" } });
    expect(await f.wallet()).toMatchObject({ plan: 4000 });
    expect((await f.ctx.db.query("SELECT status FROM credit_reservations")).rows).toEqual([{ status: "released" }]);
    expect((await events(f)).rows[0]).toMatchObject({ status: "error", error_code: "upstream_400", credits: 0 });
  });

  it("moves to the next provider key when one is rate limited or down", async () => {
    await addProviderKey(f.ctx, "anthropic", "https://anthropic-backup.fake", 200, "sk-backup");
    f.ai.next(HOSTS.anthropic, () => json(429, { error: { type: "rate_limit_error" } }));
    f.ai.next("anthropic-backup.fake", (call) => {
      expect(call.headers["x-api-key"]).toBe("sk-backup");
      return anthropicStream({ input: 10, output: 10 });
    });
    expect((await f.call("/v1/anthropic/v1/messages", haiku())).status).toBe(200);
    await f.gateway.drain();
  });

  it("charges an estimate when the client goes away mid-stream", async () => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => { open = resolve; });
    f.ai.next(HOSTS.anthropic, () => anthropicStream({ input: 5000, output: 900 }, { gate }));
    const response = await f.call("/v1/anthropic/v1/messages", haiku());
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    open();
    await f.gateway.drain();
    const [event] = (await events(f)).rows;
    expect(event).toMatchObject({ status: "ok", usage_estimated: true, input_tokens: 5000 });
    expect(Number(event!.credits)).toBeGreaterThan(0);
  });

  it("enforces the plan's daily cap and per-request cap", async () => {
    await f.ctx.db.query("UPDATE plans SET daily_credit_cap = 10, per_request_credit_cap = 4 WHERE code = 'essencial'");
    f.ai.next(HOSTS.anthropic, () => anthropicStream({ input: 10, output: 500 }));
    await (await f.call("/v1/anthropic/v1/messages", haiku({ max_tokens: 64_000 }))).text();
    await f.gateway.drain();
    // the per-request cap (4 créditos) lowers max_tokens: 4 / (5e-6 × 715) ≈ 1118 tokens
    expect(f.ai.calls[0]!.body.max_tokens).toBeLessThan(1200);
    await f.ctx.db.query(
      `INSERT INTO usage_events (organization_id, request_id, provider, model, credits, created_at) VALUES ($1, 'antes', 'anthropic', 'claude-haiku-4-5', 8, $2)`,
      [f.organizationId, f.ctx.now()]);
    const capped = await f.call("/v1/anthropic/v1/messages", haiku());
    expect(capped.status).toBe(402);
    expect((await capped.json()).code).toBe("daily_cap_reached");
    advance(f.ctx, 24 * 60 * 60_000);
    f.ai.next(HOSTS.anthropic, () => anthropicStream({ input: 10, output: 10 }));
    expect((await f.call("/v1/anthropic/v1/messages", haiku())).status).toBe(200);
    await f.gateway.drain();
  });

  it("records 50/80/100% of the period's quota once each", async () => {
    await f.ctx.db.query("UPDATE subscriptions SET credits_per_month = 20 WHERE id = $1", [f.subscription]);
    for (let i = 0; i < 4; i++) {
      // 10000 entrada + 1000 saída = 11 créditos? não: (10000 + 5000)/1e6 × 715 = 10,7 → 11
      f.ai.next(HOSTS.anthropic, () => anthropicStream({ input: 10_000, output: 1000 }));
      await (await f.call("/v1/anthropic/v1/messages", haiku())).text();
      await f.gateway.drain();
    }
    expect(f.alerts.map((alert) => alert.threshold)).toEqual([50, 80, 100]);
    const rows = await f.ctx.db.query("SELECT threshold FROM usage_alerts ORDER BY threshold");
    expect(rows.rows).toEqual([{ threshold: 50 }, { threshold: 80 }, { threshold: 100 }]);
    const audit = await f.ctx.db.query("SELECT action FROM audit_log WHERE action LIKE 'usage.threshold%' ORDER BY id");
    expect(audit.rows.map((row: any) => row.action)).toEqual(["usage.threshold_50", "usage.threshold_80", "usage.threshold_100"]);
  });

  it("rate limits per organisation", async () => {
    await f.setSettings({ rate_limit_per_minute: 2 });
    f.ai.next(HOSTS.anthropic, () => anthropicStream({ input: 1, output: 1 }));
    f.ai.next(HOSTS.anthropic, () => anthropicStream({ input: 1, output: 1 }));
    await (await f.call("/v1/anthropic/v1/messages", haiku())).text();
    await (await f.call("/v1/anthropic/v1/messages", haiku())).text();
    const limited = await f.call("/v1/anthropic/v1/messages", haiku());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    await f.gateway.drain();
  });

  it("expires reservations a crashed gateway left behind", async () => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => { open = resolve; });
    f.ai.next(HOSTS.anthropic, () => anthropicStream({ input: 1, output: 1 }, { gate }));
    const response = await f.call("/v1/anthropic/v1/messages", haiku());
    advance(f.ctx, 31 * 60_000);
    expect((await tick(f.ctx)).expiredReservations).toBe(1);
    open();
    await response.text();
    await f.gateway.drain();
    // the late answer is still charged
    expect((await events(f)).rows[0]).toMatchObject({ status: "ok", credits: 1 });
  });

  it("answers unknown routes with a JSON 404 and forwards token counting without billing", async () => {
    expect((await f.call("/v1/anthropic/v1/complete", haiku())).status).toBe(404);
    f.ai.next(HOSTS.anthropic, () => json(200, { input_tokens: 12 }));
    const counted = await f.call("/v1/anthropic/v1/messages/count_tokens", { model: "claude-haiku-4-5", messages: [] });
    expect(await counted.json()).toEqual({ input_tokens: 12 });
    expect((await events(f)).rows).toHaveLength(0);
    expect(sse).toBeTypeOf("function");
  });
});
