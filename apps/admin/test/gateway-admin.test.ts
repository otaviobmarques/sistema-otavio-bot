import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sha256Hex } from "../src/security/crypto.ts";
import { anthropicStream, openaiChatStream } from "./fake-ai.ts";
import { gatewayFixture, HOSTS, type GatewayFixture } from "./gateway-fixture.ts";
import { client, sessionCookie } from "./helpers.ts";

describe("painel do gateway", () => {
  let f: GatewayFixture;
  beforeEach(async () => {
    f = await gatewayFixture();
  });
  afterEach(() => f.ctx.db.close());

  it("issues a token shown once, stores only its hash, lists and revokes it with a reason", async () => {
    const issued = await f.admin.post(`/api/clients/${f.organizationId}/gateway-tokens`, { label: "Instância principal" });
    expect(issued.status).toBe(201);
    expect(issued.data.token).toMatch(/^arko_ai_[A-Za-z0-9_-]{43}$/);
    const stored = await f.ctx.db.query("SELECT token_hash, token_prefix FROM gateway_tokens WHERE id = $1", [issued.data.id]);
    expect(stored.rows[0]).toEqual({ token_hash: sha256Hex(issued.data.token), token_prefix: issued.data.token.slice(0, 14) });
    const detail = await f.admin.get(`/api/clients/${f.organizationId}`);
    expect(JSON.stringify(detail.data)).not.toContain(issued.data.token);
    expect(detail.data.gatewayTokens.map((t: any) => t.label)).toContain("Instância principal");

    expect((await f.admin.post(`/api/clients/${f.organizationId}/gateway-tokens/${issued.data.id}/revoke`, { reason: "ok" })).status).toBe(400);
    expect((await f.admin.post(`/api/clients/${f.organizationId}/gateway-tokens/${issued.data.id}/revoke`, { reason: "vazou num print" })).status).toBe(200);
    expect((await f.admin.post(`/api/clients/${f.organizationId}/gateway-tokens/${issued.data.id}/revoke`, { reason: "vazou num print" })).status).toBe(404);
    const audit = await f.ctx.db.query("SELECT action, reason FROM audit_log WHERE action LIKE 'gateway_token.%' ORDER BY id");
    expect(audit.rows.at(-1)).toEqual({ action: "gateway_token.revoked", reason: "vazou num print" });

    const viewer = client(f.ctx, await sessionCookie(f.ctx, "viewer"));
    expect((await viewer.post(`/api/clients/${f.organizationId}/gateway-tokens`, { label: "não pode" })).status).toBe(403);
  });

  it("edits a model's price and the general markup, and the next request uses them", async () => {
    const prices = await f.admin.get("/api/gateway/prices");
    expect(prices.data.prices.find((p: any) => p.model === "claude-haiku-4-5")).toMatchObject({ provider: "anthropic" });
    expect(prices.data.settings).toMatchObject({ overdraft_credits: 20 });
    const updated = await f.admin.put("/api/gateway/prices", {
      model: "claude-haiku-4-5", provider: "anthropic", label: "Claude Haiku 4.5", inputUsd: 2, cachedInputUsd: 0.2, cacheWriteUsd: 2.5, outputUsd: 10,
    });
    expect(updated.status).toBe(200);
    expect((await f.admin.put("/api/gateway/settings", { markupPercent: 0, usdBrlRate: 5, overdraftCredits: 10, rateLimitPerMinute: 60, reservationMinutes: 30 })).status).toBe(200);
    expect((await f.admin.put("/api/gateway/settings", { markupPercent: -1, usdBrlRate: 5, overdraftCredits: 10, rateLimitPerMinute: 60, reservationMinutes: 30 })).status).toBe(400);
    f.ai.next(HOSTS.anthropic, () => anthropicStream({ input: 10_000, output: 0 }));
    await (await f.call("/v1/anthropic/v1/messages", { model: "claude-haiku-4-5", max_tokens: 100, stream: true, messages: [] })).text();
    await f.gateway.drain();
    // US$ 0,02 × 5 × 100 × 1 = 10
    expect((await f.ctx.db.query("SELECT credits FROM usage_events")).rows).toEqual([{ credits: 10 }]);
    const actions = (await f.ctx.db.query("SELECT action FROM audit_log WHERE action IN ('model_price.updated', 'gateway_settings.updated')")).rows;
    expect(actions).toHaveLength(2);
  });

  it("summarises usage by client, company, bot and model with the margin", async () => {
    f.ai.next(HOSTS.anthropic, () => anthropicStream({ input: 10_000, output: 1000 }));
    await (await f.call("/v1/anthropic/v1/messages", { model: "claude-haiku-4-5", max_tokens: 1000, stream: true, messages: [] },
      { "x-arko-company": "Unidade Sul", "x-arko-bot": "Atendente" })).text();
    f.ai.next(HOSTS.openai, () => openaiChatStream({ prompt: 1000, completion: 100 }));
    await (await f.call("/v1/openai/v1/chat/completions", { model: "gpt-5-mini", stream: true, messages: [] })).text();
    await f.call("/v1/anthropic/v1/messages", { model: "claude-opus-4-5", max_tokens: 10, messages: [] });
    await f.gateway.drain();
    const { data } = await f.admin.get("/api/gateway/usage?days=7");
    expect(data.summary).toMatchObject({ requests: 3, ok: 2, refused: 1, credits: 12 });
    expect(data.summary.cost_brl_cents).toBeCloseTo((0.015 + 0.00045) * 550, 4);
    expect(data.byClient).toHaveLength(1);
    expect(data.byBot.find((row: any) => row.bot === "Atendente")).toMatchObject({ company: "Unidade Sul", credits: 11 });
    expect(data.byModel.map((row: any) => row.model).sort()).toEqual(["claude-haiku-4-5", "claude-opus-4-5", "gpt-5-mini"]);
    expect(data.refusals).toEqual([{ error_code: "model_not_in_plan", n: 1 }]);
    expect(data.recent).toHaveLength(3);
    const detail = await f.admin.get(`/api/clients/${f.organizationId}`);
    expect(detail.data.usage30d).toMatchObject({ requests: 3, credits: 12 });
  });

  it("drops the free-plan card data from the overview and reports AI cost", async () => {
    const { data } = await f.admin.get("/api/overview");
    expect(data.stats).not.toHaveProperty("free_clients");
    expect(data.stats).toHaveProperty("ai_cost_brl_cents_month");
  });
});
