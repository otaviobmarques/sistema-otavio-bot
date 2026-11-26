import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGatewayApp } from "../src/gateway/app.ts";
import { FreeAiRateLimiter, freeModelAllowed, loadFreeAiConfig } from "../src/gateway/free-ai.ts";
import { overdraftFor } from "../src/gateway/accounting.ts";
import { loadSettings } from "../src/gateway/accounting.ts";
import { resolveGatewayToken } from "../src/gateway/tokens.ts";
import { json, openaiChatStream } from "./fake-ai.ts";
import { addProviderKey, gatewayFixture, HOSTS, type GatewayFixture } from "./gateway-fixture.ts";
import { advance, DAY } from "./helpers.ts";

const FREE = { google: "google.fake", nvidia: "nvidia.fake", groq: "groq.fake", cerebras: "cerebras.fake" } as const;
const chat = (model = "gratis/gemini-3.8-flash", extra: Record<string, unknown> = {}) =>
  ({ model, stream: true, messages: [{ role: "user", content: "Oi" }], ...extra });
const events = (f: GatewayFixture) => f.ctx.db.query<Record<string, any>>("SELECT * FROM usage_events WHERE organization_id = $1 ORDER BY id", [f.organizationId]);

async function freeKeys(f: GatewayFixture) {
  await addProviderKey(f.ctx, "google", `https://${FREE.google}/v1beta/openai`, 10, "AIza-google-1");
  await addProviderKey(f.ctx, "nvidia", `https://${FREE.nvidia}/v1`, 10);
  await addProviderKey(f.ctx, "groq", `https://${FREE.groq}/openai/v1`, 10);
  await addProviderKey(f.ctx, "cerebras", `https://${FREE.cerebras}/v1`, 10);
}

describe("IA gratuita do plano Inicial", () => {
  let f: GatewayFixture;
  beforeEach(async () => {
    f = await gatewayFixture({ planCode: "inicial", credits: 0 });
    await freeKeys(f);
  });
  afterEach(() => f.ctx.db.close());

  it("lists only the free models, all on the OpenAI-compatible path the instance knows", async () => {
    const response = await f.gateway.app.request("/v1/models", { headers: { authorization: `Bearer ${f.token}` } });
    const body = await response.json();
    expect(body.plan).toBe("inicial");
    expect(body.usable).toBe(true);
    expect(body.data.map((model: any) => model.id).sort()).toEqual([
      "gratis/gemini-3.8-flash", "gratis/gemma-4-31b", "gratis/gpt-oss-120b", "gratis/gpt-oss-120b-cerebras", "gratis/kimi-k3.1-pro", "gratis/nemotron-3.5-super-vl",
    ]);
    expect(body.data.every((model: any) => model.provider === "openrouter" && model.free === true)).toBe(true);
    expect(body.data.find((model: any) => model.id === "gratis/gemini-3.8-flash").upstream_provider).toBe("google");
    const byPath = await (await f.gateway.app.request("/v1/openrouter/v1/models", { headers: { authorization: `Bearer ${f.token}` } })).json();
    expect(byPath.data).toHaveLength(6);
    const googleOnly = await (await f.gateway.app.request("/v1/google/v1/models", { headers: { authorization: `Bearer ${f.token}` } })).json();
    expect(googleOnly.data.map((model: any) => model.id)).toEqual(["gratis/gemini-3.8-flash"]);
  });

  it("streams a free model through Google's OpenAI endpoint at 0 credits, with no reservation", async () => {
    f.ai.next(FREE.google, () => openaiChatStream({ prompt: 1200, completion: 300 }));
    const response = await f.call("/v1/openrouter/v1/chat/completions", chat());
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("[DONE]");
    await f.gateway.drain();
    const sent = f.ai.calls[0]!;
    expect(sent.url).toBe(`https://${FREE.google}/v1beta/openai/chat/completions`);
    expect(sent.headers.authorization).toBe("Bearer AIza-google-1");
    expect(sent.body.model).toBe("gemini-3.8-flash");
    expect(sent.body.stream_options).toEqual({ include_usage: true });
    expect(sent.body.usage).toBeUndefined();
    expect((await events(f)).rows[0]).toMatchObject({ status: "ok", provider: "google", model: "gratis/gemini-3.8-flash", upstream_model: "gemini-3.8-flash", input_tokens: 1200, output_tokens: 300,
      credits: 0, cost_usd_micros: 0, reserved_credits: 0 });
    expect((await f.ctx.db.query("SELECT 1 FROM credit_reservations")).rows).toHaveLength(0);
    expect((await f.ctx.db.query("SELECT 1 FROM credit_ledger WHERE organization_id = $1", [f.organizationId])).rows).toHaveLength(0);
    expect(await f.wallet()).toEqual({ plan: 0, extra: 0, total: 0 });

    f.ai.next(FREE.nvidia, () => json(200, { id: "c", choices: [{ message: { content: "oi" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    const direct = await f.call("/v1/nvidia/v1/chat/completions", chat("gratis/kimi-k3.1-pro", { stream: false, max_tokens: 50 }));
    expect(direct.status).toBe(200);
    expect(f.ai.calls[1]!.url).toBe(`https://${FREE.nvidia}/v1/chat/completions`);
    expect(f.ai.calls[1]!.body).toMatchObject({ model: "moonshotai/kimi-k3.1-pro", max_tokens: 1024 });

    f.ai.next(HOSTS.openrouter, () => openaiChatStream({ prompt: 10, completion: 10, cost: 0.5 }));
    await (await f.call("/v1/openrouter/v1/chat/completions", chat("gratis/gemma-4-31b"))).text();
    await f.gateway.drain();
    expect(f.ai.calls[2]!.body).toMatchObject({ model: "google/gemma-4-31b-it:free", usage: { include: true } });
    expect((await events(f)).rows.map((row) => Number(row.credits))).toEqual([0, 0, 0]);
    const detail = await f.admin.get(`/api/clients/${f.organizationId}`);
    expect(detail.data.freeRequestsToday).toBe(3);
  });

  it("caps free requests per organisation per Brasília day with a clear 429", async () => {
    await f.ctx.db.query("UPDATE plans SET free_requests_per_day = 2 WHERE code = 'inicial'");
    for (let i = 0; i < 2; i++) {
      f.ai.next(FREE.google, () => openaiChatStream({ prompt: 10, completion: 10 }));
      expect((await f.call("/v1/openrouter/v1/chat/completions", chat())).status).toBe(200);
    }
    const third = await f.call("/v1/openrouter/v1/chat/completions", chat());
    expect(third.status).toBe(429);
    expect(await third.json()).toMatchObject({ code: "free_daily_limit_reached", message: "Limite diário da IA gratuita atingido — volta amanhã, ou faça upgrade / conecte sua própria IA." });
    expect(f.ai.calls).toHaveLength(2);
    await f.gateway.drain();

    advance(f.ctx, DAY);
    f.ai.next(FREE.google, () => openaiChatStream({ prompt: 10, completion: 10 }));
    expect((await f.call("/v1/openrouter/v1/chat/completions", chat())).status).toBe(200);
  });

  it("rotates to the next key, then to the next free provider, and answers kindly when all are full", async () => {
    await addProviderKey(f.ctx, "google", `https://${FREE.google}/v1beta/openai`, 20, "AIza-google-2");
    f.ai.next(FREE.google, () => json(429, { error: { message: "quota" } }));
    f.ai.next(FREE.google, () => openaiChatStream({ prompt: 10, completion: 10 }));
    expect((await f.call("/v1/openrouter/v1/chat/completions", chat())).status).toBe(200);
    expect(f.ai.calls.map((call) => call.headers.authorization)).toEqual(["Bearer AIza-google-1", "Bearer AIza-google-2"]);
    await f.gateway.drain();

    f.ai.calls.length = 0;
    f.ai.next(FREE.google, () => json(429, {}));
    f.ai.next(FREE.google, () => json(503, {}));
    f.ai.next(FREE.groq, () => openaiChatStream({ prompt: 10, completion: 10 }));
    const failedOver = await f.call("/v1/openrouter/v1/chat/completions", chat());
    expect(failedOver.status).toBe(200);
    await failedOver.text();
    await f.gateway.drain();
    expect(f.ai.calls.map((call) => new URL(call.url).host)).toEqual([FREE.google, FREE.google, FREE.groq]);
    expect(f.ai.calls[2]!.body.model).toBe("openai/gpt-oss-120b");
    expect((await events(f)).rows.at(-1)).toMatchObject({ status: "ok", provider: "groq", model: "gratis/gpt-oss-120b", upstream_model: "openai/gpt-oss-120b", credits: 0 });

    f.ai.calls.length = 0;
    const exhausted = await f.call("/v1/openrouter/v1/chat/completions", chat());
    expect(exhausted.status).toBe(503);
    expect(await exhausted.json()).toMatchObject({ code: "free_ai_unavailable", message: expect.stringContaining("IA gratuita está sobrecarregada") });
    expect(new Set(f.ai.calls.map((call) => new URL(call.url).host))).toEqual(new Set([FREE.google, FREE.cerebras, FREE.groq, FREE.nvidia, HOSTS.openrouter]));
    expect((await events(f)).rows.at(-1)).toMatchObject({ status: "error", error_code: "free_ai_unavailable", credits: 0 });
  });

  it("keeps Inicial off the paid models and off credit: no overdraft when the plan has no monthly credits", async () => {
    const paid = await f.call("/v1/anthropic/v1/messages", { model: "claude-haiku-4-5", max_tokens: 100, messages: [{ role: "user", content: "Oi" }] });
    expect(paid.status).toBe(403);
    expect((await paid.json()).code).toBe("model_not_in_plan");

    await f.ctx.db.query("UPDATE plans SET allowed_models = array_append(allowed_models, 'claude-haiku-5-5') WHERE code = 'inicial'");
    const noCredits = await f.call("/v1/anthropic/v1/messages", { model: "claude-haiku-5-5", max_tokens: 100, messages: [{ role: "user", content: "Oi" }] });
    expect(noCredits.status).toBe(402);
    expect((await noCredits.json()).code).toBe("credits_used_up");
    expect(f.ai.calls).toHaveLength(0);

    const caller = (await resolveGatewayToken(f.ctx.db, f.token, f.ctx.now()))!;
    const settings = await loadSettings(f.ctx.db);
    expect(settings.overdraftCredits).toBeGreaterThan(0);
    expect(overdraftFor(caller, settings)).toBe(0);
    expect(overdraftFor({ ...caller, creditsPerMonth: 4000 }, settings)).toBe(settings.overdraftCredits);
  });
});

describe("IA gratuita: chaves, ordem, modelos e ritmo pelas variáveis de ambiente do gateway", () => {
  let f: GatewayFixture;
  beforeEach(async () => {
    f = await gatewayFixture({ planCode: "inicial", credits: 0 });
  });
  afterEach(() => f.ctx.db.close());

  const gatewayWith = (env: Record<string, string>) => {
    const gateway = createGatewayApp({ ...f.ctx, freeAi: loadFreeAiConfig(env) });
    const call = (model: string, extra: Record<string, unknown> = {}) => gateway.app.request("/v1/openrouter/v1/chat/completions", {
      method: "POST", headers: { authorization: `Bearer ${f.token}`, "content-type": "application/json" }, body: JSON.stringify(chat(model, extra)),
    });
    return { gateway, call };
  };

  it("reads the four free-tier keys, the order and the per-provider model, and never uses an env key for paid models", () => {
    const config = loadFreeAiConfig({});
    expect(config.order).toEqual(["groq", "google", "nvidia", "openrouter", "cerebras"]);
    expect(config.keys).toEqual({});
    expect(config.rpm).toEqual({ groq: 30, google: 10, nvidia: 40, openrouter: 20, cerebras: 30 });
    const custom = loadFreeAiConfig({
      ARKOBOT_FREE_AI_ORDER: "nvidia, Gemini, nada", GEMINI_API_KEY: " AIza-env ", GROQ_API_KEY: "", ARKOBOT_FREE_MODEL_NVIDIA: "z-ai/glm-5.3-flash",
      ARKOBOT_FREE_RPM_NVIDIA: "5", ARKOBOT_FREE_TIMEOUT_MS: "1500",
    });
    expect(custom.order).toEqual(["nvidia", "google", "groq", "openrouter", "cerebras"]);
    expect(custom.keys).toEqual({ google: "AIza-env" });
    expect(custom.models).toEqual({ nvidia: "z-ai/glm-5.3-flash" });
    expect(custom).toMatchObject({ rpm: { nvidia: 5 }, timeoutMs: 1500 });
  });

  it("hard-blocks OpenRouter models without the :free suffix in the free pool", async () => {
    expect(freeModelAllowed("openrouter", "nvidia/nemotron-3.5-super-vl:free")).toBe(true);
    expect(freeModelAllowed("openrouter", "google/gemini-2.5-flash")).toBe(false);
    expect(freeModelAllowed("openrouter", "deepseek/deepseek-chat-v3-0324:free-ish")).toBe(false);
    expect(freeModelAllowed("groq", "openai/gpt-oss-120b")).toBe(true);
    await expect(f.ctx.db.query("UPDATE model_prices SET upstream_model = 'google/gemma-4-31b-it' WHERE model = 'gratis/gemma-4-31b'")).rejects.toThrow(/free_openrouter_suffix/);

    const { call } = gatewayWith({ OPENROUTER_API_KEY: "sk-or-env", ARKOBOT_FREE_MODEL_OPENROUTER: "openai/gpt-5" });
    const refused = await call("gratis/nemotron-3.5-super-vl");
    expect(refused.status).toBe(503);
    expect(f.ai.calls.filter((c) => c.url.includes("openrouter"))).toHaveLength(0);
  });

  it("uses the environment's key and model, follows ARKOBOT_FREE_AI_ORDER, and records who answered", async () => {
    const { gateway, call } = gatewayWith({
      GROQ_API_KEY: "gsk-env", NVIDIA_API_KEY: "nvapi-env", ARKOBOT_FREE_MODEL_GROQ: "qwen/qwen3.8-27b", ARKOBOT_FREE_AI_ORDER: "nvidia,groq",
    });
    f.ai.next("api.groq.com", () => openaiChatStream({ prompt: 10, completion: 10 }));
    const groq = await call("gratis/gpt-oss-120b");
    expect(groq.status).toBe(200);
    await groq.text();
    await gateway.drain();
    expect(f.ai.calls[0]).toMatchObject({ url: "https://api.groq.com/openai/v1/chat/completions", headers: { authorization: "Bearer gsk-env" } });
    expect(f.ai.calls[0]!.body.model).toBe("qwen/qwen3.8-27b");
    expect((await events(f)).rows[0]).toMatchObject({ provider: "groq", model: "gratis/gpt-oss-120b", upstream_model: "qwen/qwen3.8-27b", ai_provider_key_id: null, credits: 0 });

    f.ai.next("integrate.api.nvidia.com", () => openaiChatStream({ prompt: 10, completion: 10 }));
    const gemini = await call("gratis/gemini-3.8-flash");
    expect(gemini.status).toBe(200);
    await gemini.text();
    await gateway.drain();
    expect(f.ai.calls[1]).toMatchObject({ url: "https://integrate.api.nvidia.com/v1/chat/completions", headers: { authorization: "Bearer nvapi-env" } });
    expect(f.ai.calls[1]!.body.model).toBe("moonshotai/kimi-k3.1-pro");
    expect((await events(f)).rows[1]).toMatchObject({ provider: "nvidia", model: "gratis/kimi-k3.1-pro", upstream_model: "moonshotai/kimi-k3.1-pro" });
  });

  it("keeps each provider under its requests per minute and moves on after a timeout", async () => {
    const { gateway, call } = gatewayWith({ GROQ_API_KEY: "gsk-env", NVIDIA_API_KEY: "nvapi-env", ARKOBOT_FREE_RPM_GROQ: "1", ARKOBOT_FREE_TIMEOUT_MS: "50" });
    f.ai.next("api.groq.com", () => openaiChatStream({ prompt: 10, completion: 10 }));
    await (await call("gratis/gpt-oss-120b")).text();
    f.ai.next("integrate.api.nvidia.com", () => openaiChatStream({ prompt: 10, completion: 10 }));
    await (await call("gratis/gpt-oss-120b")).text();
    expect(f.ai.calls.map((c) => new URL(c.url).host)).toEqual(["api.groq.com", "integrate.api.nvidia.com"]);

    advance(f.ctx, 60_000);
    f.ai.next("api.groq.com", () => new Promise<Response>(() => undefined));
    f.ai.next("integrate.api.nvidia.com", () => openaiChatStream({ prompt: 10, completion: 10 }));
    const slow = await call("gratis/gpt-oss-120b");
    expect(slow.status).toBe(200);
    await slow.text();
    await gateway.drain();
    expect(f.ai.calls.slice(2).map((c) => new URL(c.url).host)).toEqual(["api.groq.com", "integrate.api.nvidia.com"]);
  });

  it("refills a provider's bucket over the minute", () => {
    const limiter = new FreeAiRateLimiter({ groq: 2 });
    expect([limiter.take("groq", 0), limiter.take("groq", 0), limiter.take("groq", 0)]).toEqual([true, true, false]);
    expect(limiter.take("groq", 29_000)).toBe(false);
    expect(limiter.take("groq", 30_000)).toBe(true);
    expect(limiter.take("google", 0)).toBe(true);
  });
});

describe("Central: preços grátis, limite do plano e chaves dos provedores gratuitos", () => {
  let f: GatewayFixture;
  beforeEach(async () => {
    f = await gatewayFixture({ planCode: "inicial", credits: 0 });
  });
  afterEach(() => f.ctx.db.close());

  it("toggles a free model, edits the plan's daily free requests and stores keys for every free-tier provider", async () => {
    const base = { provider: "groq", label: "Qwen (grátis)", inputUsd: 0, cachedInputUsd: 0, cacheWriteUsd: 0, outputUsd: 0, free: true };
    expect((await f.admin.put("/api/gateway/prices", { ...base, model: "qwen3-32b" })).status).toBe(400);
    expect((await f.admin.put("/api/gateway/prices", { ...base, model: "gratis/qwen3", outputUsd: 1 })).status).toBe(400);
    const saved = await f.admin.put("/api/gateway/prices", { ...base, model: "gratis/qwen3", upstreamModel: "qwen/qwen3-32b" });
    expect(saved.status).toBe(200);
    expect(saved.data.price).toMatchObject({ model: "gratis/qwen3", free: true, upstream_model: "qwen/qwen3-32b" });

    const plans = (await f.admin.get("/api/plans")).data.plans;
    const inicial = plans.find((plan: any) => plan.code === "inicial");
    const body = {
      code: inicial.code, name: inicial.name, description: inicial.description, priceCents: inicial.price_cents, billingCycle: "monthly", creditsPerMonth: 0,
      maxBots: 1, maxCompanies: 1, ramMb: 1024, diskGb: 5, includedVps: 0, allowedModels: inicial.allowed_models, defaultModel: inicial.default_model, free: false,
      cloudMode: "shared_limited", browserEnabled: true, computerEnabled: false, active: true, visible: true, trialDays: 7, freeRequestsPerDay: 300,
    };
    expect((await f.admin.put(`/api/plans/${inicial.id}`, body)).data.plan).toMatchObject({ free_requests_per_day: 300, trial_days: 7 });
    expect((await f.admin.put(`/api/plans/${inicial.id}`, { ...body, trialDays: 91 })).status).toBe(400);

    for (const provider of ["google", "nvidia", "groq", "cerebras", "openrouter"]) {
      const created = await f.admin.post("/api/integrations/ai-keys", { provider, label: `${provider} grátis`, apiKey: `chave-${provider}-0123456789`, priority: 10 });
      expect(created.status).toBe(201);
    }
  });
});

describe("planos pagos e a IA gratuita", () => {
  let f: GatewayFixture;
  beforeEach(async () => {
    f = await gatewayFixture({ planCode: "essencial" });
    await freeKeys(f);
  });
  afterEach(() => f.ctx.db.close());

  it("leaves paid plans as they were: no free models unless the owner gives the plan free requests", async () => {
    const catalog = await (await f.gateway.app.request("/v1/models", { headers: { authorization: `Bearer ${f.token}` } })).json();
    expect(catalog.data.some((model: any) => model.free)).toBe(false);
    expect(catalog.data.map((model: any) => model.id)).toContain("claude-haiku-4-5");

    await f.ctx.db.query("UPDATE plans SET allowed_models = '{}' WHERE code = 'essencial'");
    const everything = await (await f.gateway.app.request("/v1/models", { headers: { authorization: `Bearer ${f.token}` } })).json();
    expect(everything.data.some((model: any) => model.free)).toBe(false);
    const refused = await f.call("/v1/openrouter/v1/chat/completions", chat());
    expect(refused.status).toBe(403);
    expect((await refused.json()).code).toBe("model_not_in_plan");

    await f.ctx.db.query("UPDATE plans SET free_requests_per_day = 50 WHERE code = 'essencial'");
    f.ai.next(FREE.google, () => openaiChatStream({ prompt: 10, completion: 10 }));
    expect((await f.call("/v1/openrouter/v1/chat/completions", chat())).status).toBe(200);
    await f.gateway.drain();
    expect(await f.wallet()).toMatchObject({ plan: 4000 });

    f.ai.next(HOSTS.openai, () => openaiChatStream({ prompt: 2000, completion: 300, cached: 1000 }));
    await (await f.call("/v1/openai/v1/chat/completions", { model: "gpt-5-mini", stream: true, messages: [] })).text();
    await f.gateway.drain();
    expect((await events(f)).rows.at(-1)).toMatchObject({ provider: "openai", credits: 1 });
    expect((await f.ctx.db.query("SELECT status FROM credit_reservations")).rows).toEqual([{ status: "settled" }]);
  });
});
