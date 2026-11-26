import { randomUUID } from "node:crypto";
import { Hono, type Context } from "hono";
import { hit } from "../auth/rate-limit.ts";
import type { Db } from "../db/db.ts";
import type { SecretBox } from "../security/crypto.ts";
import {
  GatewayRefusal, loadSettings, recordRefusal, releaseRequest, reserveCredits, settleRequest, type RefusalCode, type UsageRecord,
} from "./accounting.ts";
import type { UsageAlertNotifier } from "./alerts.ts";
import { brasiliaDate } from "../billing/subscription-machine.ts";
import {
  creditsFor, isGatewayProvider, isOpenAiCompatible, priceFromRow, type GatewayProvider, type ModelPrice, type PriceRow, type TokenUsage,
} from "./pricing.ts";
import { FreeAiRateLimiter, freeModelAllowed, loadFreeAiConfig, type FreeAiConfig } from "./free-ai.ts";
import { isVersionedProvider, OPENAI_COMPATIBLE_BASE_URLS } from "./providers.ts";
import { planAllows, resolveGatewayToken, type GatewayCaller } from "./tokens.ts";
import { UsageMeter, type ApiFlavor } from "./usage.ts";

export interface GatewayContext {
  db: Db;
  box: SecretBox;
  now: () => Date;
  /** Every call to a provider goes through this. */
  fetch: typeof fetch;
  notifier?: UsageAlertNotifier;
  /** The free pool's keys, order, models and rates from the gateway host's environment; none when absent. */
  freeAi?: FreeAiConfig;
}

interface ProviderKey {
  /** Null for a key from the gateway host's environment. */
  id: string | null;
  baseUrl: string | null;
  secret: () => string;
}

/** The smallest output limit sent to a free model. */
const FREE_MIN_OUTPUT_TOKENS = 1024;

interface Endpoint {
  flavor: ApiFlavor | null;
  upstreamPath: string;
}

/** What each provider path accepts; `flavor: null` is forwarded without billing (token counting is free upstream). */
const ENDPOINTS: Record<GatewayProvider, Record<string, Endpoint>> = {
  anthropic: {
    "v1/messages": { flavor: "anthropic-messages", upstreamPath: "/v1/messages" },
    "v1/messages/count_tokens": { flavor: null, upstreamPath: "/v1/messages/count_tokens" },
  },
  openai: {
    "v1/chat/completions": { flavor: "openai-chat", upstreamPath: "/v1/chat/completions" },
    "v1/responses": { flavor: "openai-responses", upstreamPath: "/v1/responses" },
  },
  openrouter: {
    "v1/chat/completions": { flavor: "openai-chat", upstreamPath: "/v1/chat/completions" },
  },
  google: { "v1/chat/completions": { flavor: "openai-chat", upstreamPath: "/chat/completions" } },
  nvidia: { "v1/chat/completions": { flavor: "openai-chat", upstreamPath: "/chat/completions" } },
  groq: { "v1/chat/completions": { flavor: "openai-chat", upstreamPath: "/chat/completions" } },
  cerebras: { "v1/chat/completions": { flavor: "openai-chat", upstreamPath: "/chat/completions" } },
};

const UPSTREAM: Record<GatewayProvider, string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com",
  openrouter: "https://openrouter.ai/api",
  ...OPENAI_COMPATIBLE_BASE_URLS,
};

function upstreamUrl(provider: GatewayProvider, baseUrl: string | null, path: string): string {
  const base = (baseUrl ?? UPSTREAM[provider]).replace(/\/+$/, "");
  return `${isVersionedProvider(provider) ? base : base.replace(/\/v1$/, "")}${path}`;
}

/**
 * Where a model is reached from the instance. Every OpenAI-compatible provider is served on the
 * `openrouter` path too, because the ArkoBot instance only knows the anthropic, openai and
 * openrouter engines (server/hosted-models.ts) and rejects a catalog naming any other provider.
 */
function catalogProvider(price: ModelPrice): GatewayProvider {
  return isOpenAiCompatible(price.provider) ? "openrouter" : price.provider;
}

function servedOn(path: GatewayProvider, price: ModelPrice): boolean {
  return price.provider === path || (path === "openrouter" && isOpenAiCompatible(price.provider));
}

/** Out of quota, revoked or down: the next key (or, for a free model, the next free provider) is tried. */
function shouldFailOver(status: number): boolean {
  return status === 401 || status === 429 || status >= 500;
}

const DAY_MS = 24 * 60 * 60_000;

const MAX_BODY_BYTES = 32 * 1024 * 1024;
/** Bytes per input token when estimating before the provider counts (deliberately high on cost: JSON is wordier than tokens). */
const BYTES_PER_INPUT_TOKEN = 4;
/** Bytes of SSE per output token when a stream stops without reporting usage. */
const SSE_BYTES_PER_OUTPUT_TOKEN = 6;
const MIN_OUTPUT_TOKENS = 256;
const FORWARDED_RESPONSE_HEADERS = ["content-type", "cache-control", "request-id", "x-request-id", "openai-processing-ms"];
const LABEL = /^[\p{L}\p{N} ._:@/#()&+-]{1,120}$/u;
const CLIENT_REQUEST_ID = /^[A-Za-z0-9_.:-]{1,100}$/;

const aiKeyContext = (id: string) => `ai_provider_keys.api_key:${id}`;

function refusalResponse(c: Context, refusal: GatewayRefusal): Response {
  if (refusal.code === "rate_limited") c.header("Retry-After", "60");
  // `code`/`message` for ArkoBot; `type`/`error` so Anthropic and OpenAI clients show the message too.
  return c.json({ code: refusal.code, message: refusal.message, type: "error", error: { type: refusal.code, code: refusal.code, message: refusal.message } },
    refusal.status as 400);
}

function bearer(c: Context): string {
  const auth = c.req.header("authorization");
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, "").trim();
  return c.req.header("x-api-key")?.trim() ?? "";
}

function label(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && LABEL.test(trimmed) ? trimmed : null;
}

function maxOutputField(flavor: ApiFlavor, body: Record<string, unknown>): string {
  if (flavor === "anthropic-messages") return "max_tokens";
  if (flavor === "openai-responses") return "max_output_tokens";
  return typeof body.max_tokens === "number" && body.max_completion_tokens === undefined ? "max_tokens" : "max_completion_tokens";
}

function usdFor(price: ModelPrice, inputTokens: number, outputTokens: number): number {
  return (inputTokens * price.inputUsd + outputTokens * price.outputUsd) / 1_000_000;
}

export function createGatewayApp(ctx: GatewayContext) {
  const app = new Hono();
  const freeAi = ctx.freeAi ?? loadFreeAiConfig({});
  const freeLimiter = new FreeAiRateLimiter(freeAi.rpm);
  const inFlight = new Set<Promise<unknown>>();
  const track = (work: Promise<unknown>) => {
    const tracked = work.catch((error) => console.error("[gateway] liquidação", error)).finally(() => inFlight.delete(tracked));
    inFlight.add(tracked);
  };

  app.onError((error, c) => {
    if (error instanceof GatewayRefusal) return refusalResponse(c, error);
    console.error("[gateway] erro inesperado", error);
    return c.json({ code: "internal_error", message: "Erro interno no gateway ArkoBot.", type: "error", error: { type: "api_error", message: "Erro interno no gateway ArkoBot." } }, 500);
  });

  app.use("*", async (c, next) => {
    await next();
    c.header("Cache-Control", c.res.headers.get("cache-control") ?? "no-store");
    c.header("X-Content-Type-Options", "nosniff");
  });

  app.get("/health", async (c) => {
    await ctx.db.query("SELECT 1");
    return c.json({ ok: true });
  });

  const authenticate = async (c: Context): Promise<GatewayCaller> => {
    const caller = await resolveGatewayToken(ctx.db, bearer(c), ctx.now());
    if (!caller) throw new GatewayRefusal("invalid_token");
    await ctx.db.query("UPDATE gateway_tokens SET last_used_at = $2 WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < $3)",
      [caller.tokenId, ctx.now(), new Date(ctx.now().getTime() - 60_000)]);
    return caller;
  };

  const catalog = async (c: Context, provider: GatewayProvider | null) => {
    const caller = await authenticate(c);
    const { rows } = await ctx.db.query<PriceRow>("SELECT * FROM model_prices WHERE enabled ORDER BY provider, model");
    const usable = caller.organizationStatus === "active" && caller.subscriptionStatus === "active";
    const data = rows.map(priceFromRow).filter((price) => planAllows(caller, price) && (!provider || servedOn(provider, price))).map((price) => ({
      id: price.model, object: "model", type: "model", provider: catalogProvider(price), upstream_provider: price.provider, free: price.free,
      display_name: price.label || price.model, owned_by: price.provider, created: 0,
    }));
    return c.json({ object: "list", data, has_more: false, first_id: data[0]?.id ?? null, last_id: data.at(-1)?.id ?? null,
      plan: caller.planCode, usable, organization: { id: caller.organizationId, name: caller.organizationName } });
  };

  app.get("/v1/models", (c) => catalog(c, null));
  app.get("/v1/:provider/v1/models", (c) => {
    const provider = c.req.param("provider");
    if (!isGatewayProvider(provider)) throw new GatewayRefusal("not_found");
    return catalog(c, provider);
  });

  app.post("/v1/:provider/*", async (c) => {
    const started = Date.now();
    const param = c.req.param("provider");
    if (!isGatewayProvider(param)) throw new GatewayRefusal("not_found");
    const provider: GatewayProvider = param;
    const rest = c.req.path.slice(`/v1/${provider}/`.length);
    const endpoint = ENDPOINTS[provider][rest];
    if (!endpoint) throw new GatewayRefusal("not_found");

    const caller = await authenticate(c);
    if (caller.organizationStatus !== "active" || caller.subscriptionStatus !== "active") throw new GatewayRefusal("plan_suspended");
    const settings = await loadSettings(ctx.db);
    if (!(await hit(ctx.db, `gateway:org:${caller.organizationId}`, { windowMs: 60_000, max: settings.rateLimitPerMinute }, ctx.now()))) {
      throw new GatewayRefusal("rate_limited");
    }

    if (Number(c.req.header("content-length") ?? 0) > MAX_BODY_BYTES) throw new GatewayRefusal("invalid_request", "Requisição grande demais para o gateway ArkoBot.");
    const raw = await c.req.text();
    if (raw.length > MAX_BODY_BYTES) throw new GatewayRefusal("invalid_request", "Requisição grande demais para o gateway ArkoBot.");
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      body = parsed as Record<string, unknown>;
    } catch {
      throw new GatewayRefusal("invalid_request", "O corpo da requisição precisa ser um objeto JSON.");
    }
    const model = typeof body.model === "string" ? body.model : "";
    const clientId = c.req.header("x-arko-request-id")?.trim();
    const record: UsageRecord = {
      caller, provider, model: model.slice(0, 160) || "?", endpoint: rest,
      requestId: clientId && CLIENT_REQUEST_ID.test(clientId) ? `${caller.tokenId}:${clientId}` : `gw_${randomUUID()}`,
      company: label(c.req.header("x-arko-company")), bot: label(c.req.header("x-arko-bot")), providerKeyId: null, upstreamModel: null, httpStatus: null, durationMs: 0,
    };
    const refuse = async (code: RefusalCode): Promise<never> => {
      record.durationMs = Date.now() - started;
      await recordRefusal(ctx.db, record, code, ctx.now()).catch(() => undefined);
      throw new GatewayRefusal(code);
    };

    const priceRow = (await ctx.db.query<PriceRow>("SELECT * FROM model_prices WHERE model = $1", [model])).rows[0];
    const price = priceRow ? priceFromRow(priceRow) : null;
    if (!price || !price.enabled || !servedOn(provider, price)) return refuse(price && planAllows(caller, price) ? "model_unavailable" : "model_not_in_plan");
    if (!planAllows(caller, price)) return refuse("model_not_in_plan");

    const flavor = endpoint.flavor;
    if (price.free) {
      const day = brasiliaDate(ctx.now());
      if (!(await hit(ctx.db, `gateway:free:${caller.organizationId}:${day}`, { windowMs: DAY_MS, max: caller.freeRequestsPerDay }, ctx.now()))) {
        return refuse("free_daily_limit_reached");
      }
    }
    let reserved = 0;
    let maxOutput = 0;
    const inputEstimate = Math.ceil(raw.length / BYTES_PER_INPUT_TOKEN);
    if (flavor) {
      const field = maxOutputField(flavor, body);
      const asked = typeof body[field] === "number" && Number(body[field]) > 0 ? Math.floor(Number(body[field])) : price.defaultMaxOutput;
      maxOutput = asked;
      if (flavor === "openai-chat" && body.stream === true) {
        body.stream_options = { ...(body.stream_options as Record<string, unknown> | undefined), include_usage: true };
      }
    }
    if (flavor && !price.free) {
      const field = maxOutputField(flavor, body);
      const asked = maxOutput;
      const inputCredits = creditsFor(usdFor(price, inputEstimate, 0), price, settings);
      const wanted = creditsFor(usdFor(price, inputEstimate, asked), price, settings);
      const minimum = creditsFor(usdFor(price, inputEstimate, Math.min(asked, MIN_OUTPUT_TOKENS)), price, settings);
      try {
        reserved = await reserveCredits(ctx.db, { caller, requestId: record.requestId, wanted, minimum, settings, now: ctx.now() });
      } catch (error) {
        if (error instanceof GatewayRefusal && error.code !== "duplicate_request") return refuse(error.code);
        throw error;
      }
      if (reserved < wanted) {
        const centsPerToken = usdFor(price, 0, 1) * settings.usdBrlRate * 100 * (1 + (price.markupPercent ?? settings.markupPercent) / 100);
        maxOutput = Math.max(1, Math.min(asked, Math.floor((reserved - inputCredits) / centsPerToken)));
        body[field] = maxOutput;
        const thinking = body.thinking as { type?: string; budget_tokens?: number } | undefined;
        if (flavor === "anthropic-messages" && thinking?.type === "enabled" && typeof thinking.budget_tokens === "number" && thinking.budget_tokens >= maxOutput) {
          thinking.budget_tokens = Math.max(1024, maxOutput - 1);
        }
      }
    }

    const routes = price.free && flavor === "openai-chat" ? await freeRoutes(caller, price) : [price];
    const payloadFor = (route: ModelPrice): string => {
      if (flavor === null) return raw;
      const sent: Record<string, unknown> = { ...body, model: upstreamModel(route) };
      if (route.provider === "openrouter") sent.usage = { ...(body.usage as Record<string, unknown> | undefined), include: true };
      if (route.free) {
        // Reasoning models on the free tiers (NVIDIA's Kimi, GPT OSS) spend a short budget on reasoning alone and answer with no content.
        const field = maxOutputField(flavor, body);
        if (typeof sent[field] === "number" && Number(sent[field]) < FREE_MIN_OUTPUT_TOKENS) sent[field] = FREE_MIN_OUTPUT_TOKENS;
      }
      return JSON.stringify(sent);
    };
    const answered = await forward(c, routes, rest, payloadFor, record);
    const upstream = answered?.response ?? null;
    const used = answered?.route ?? price;
    record.provider = used.provider;
    record.model = used.model;
    record.upstreamModel = upstreamModel(used);
    record.httpStatus = upstream?.status ?? null;
    if (price.free) {
      console.info(`[gateway] IA gratuita: ${upstream ? `${used.provider} ${record.upstreamModel} respondeu ${upstream.status}` : "nenhum provedor respondeu"} em ${Date.now() - started} ms`);
    }
    if (!upstream || (price.free && shouldFailOver(upstream.status))) {
      await upstream?.body?.cancel().catch(() => undefined);
      record.durationMs = Date.now() - started;
      const code: RefusalCode = price.free ? "free_ai_unavailable" : "upstream_unavailable";
      if (flavor) await releaseRequest(ctx.db, { record, status: "error", errorCode: code, now: ctx.now() });
      throw new GatewayRefusal(code);
    }

    const headers = new Headers({ "x-arko-request-id": record.requestId });
    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (!flavor) return new Response(upstream.body, { status: upstream.status, headers });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "");
      record.durationMs = Date.now() - started;
      await releaseRequest(ctx.db, { record, status: "error", errorCode: `upstream_${upstream.status}`, now: ctx.now() });
      return new Response(text, { status: upstream.status, headers });
    }

    const meter = new UsageMeter(flavor);
    let streamed = 0;
    const settle = async (complete: boolean) => {
      record.durationMs = Date.now() - started;
      const seen = meter.usage;
      let usage: TokenUsage;
      let estimated = false;
      if (seen && meter.final && complete) {
        usage = seen;
      } else {
        // The call stopped before the provider reported its final usage (the client went away or the stream broke):
        // what was reported, plus an output estimate from the bytes that reached the client.
        estimated = true;
        usage = {
          input: seen ? seen.input : inputEstimate,
          cacheRead: seen?.cacheRead ?? 0,
          cacheWrite: seen?.cacheWrite ?? 0,
          output: Math.min(maxOutput, Math.max(seen?.output ?? 0, Math.ceil(streamed / SSE_BYTES_PER_OUTPUT_TOKEN))),
        };
      }
      const result = await settleRequest(ctx.db, { record, usage, price: used, settings, estimated, now: ctx.now() });
      for (const alert of result.alerts) await ctx.notifier?.notify(alert).catch((error) => console.error("[gateway] aviso de consumo", error));
    };

    const streaming = (upstream.headers.get("content-type") ?? "").includes("text/event-stream");
    if (!streaming) {
      const text = await upstream.text();
      meter.readBody(text);
      await settle(true);
      return new Response(text, { status: upstream.status, headers });
    }

    const reader = upstream.body.getReader();
    let finished = false;
    const finish = (complete: boolean) => {
      if (finished) return;
      finished = true;
      meter.end();
      track(settle(complete));
    };
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            finish(true);
            return;
          }
          streamed += value.byteLength;
          meter.push(value);
          controller.enqueue(value);
        } catch (error) {
          controller.error(error);
          finish(false);
        }
      },
      async cancel(reason) {
        await reader.cancel(reason).catch(() => undefined);
        finish(false);
      },
    });
    return new Response(stream, { status: upstream.status, headers });
  });

  app.all("*", (c) => refusalResponse(c, new GatewayRefusal("not_found")));

  /**
   * The requested free model first, then the plan's other free models on other OpenAI-compatible
   * providers, in the plan's order: free tiers share rate limits, so one provider being full should
   * not leave the customer without an answer.
   */
  async function freeRoutes(caller: GatewayCaller, requested: ModelPrice): Promise<ModelPrice[]> {
    const { rows } = await ctx.db.query<PriceRow>("SELECT * FROM model_prices WHERE enabled AND free AND model <> $1 ORDER BY model", [requested.model]);
    const rank = (list: readonly string[], item: string) => {
      const at = list.indexOf(item);
      return at < 0 ? Number.MAX_SAFE_INTEGER : at;
    };
    const others = rows.map(priceFromRow)
      .filter((price) => isOpenAiCompatible(price.provider) && planAllows(caller, price))
      .sort((a, b) => rank(freeAi.order, a.provider) - rank(freeAi.order, b.provider) || rank(caller.allowedModels, a.model) - rank(caller.allowedModels, b.model));
    return [requested, ...others];
  }

  function upstreamModel(route: ModelPrice): string {
    return (route.free ? freeAi.models[route.provider] : undefined) ?? route.upstreamModel ?? route.model;
  }

  /**
   * Tries each route's keys by priority while nothing has reached the client: a key or provider
   * that is out of quota, revoked or down gives way to the next. The last attempt's answer is
   * returned whatever its status; null when no attempt got an answer.
   */
  async function forward(
    c: Context, routes: ModelPrice[], endpointKey: string, payloadFor: (route: ModelPrice) => string, record: UsageRecord,
  ): Promise<{ response: Response; route: ModelPrice } | null> {
    const attempts: { route: ModelPrice; key: ProviderKey }[] = [];
    for (const route of routes) {
      if (route.free && !freeModelAllowed(route.provider, upstreamModel(route))) continue;
      const { rows } = await ctx.db.query<{ id: string; api_key_enc: string; base_url: string | null }>(
        "SELECT id, api_key_enc, base_url FROM ai_provider_keys WHERE provider = $1 AND enabled ORDER BY priority, created_at", [route.provider]);
      for (const row of rows) attempts.push({ route, key: { id: row.id, baseUrl: row.base_url, secret: () => ctx.box.decrypt(row.api_key_enc, aiKeyContext(row.id)) } });
      const envKey = route.free ? freeAi.keys[route.provider] : undefined;
      if (envKey) attempts.push({ route, key: { id: null, baseUrl: null, secret: () => envKey } });
    }
    for (let i = 0; i < attempts.length; i++) {
      const { route, key } = attempts[i]!;
      const provider = route.provider;
      const endpoint = ENDPOINTS[provider][endpointKey];
      if (!endpoint) continue;
      if (route.free && !freeLimiter.take(provider, ctx.now().getTime())) continue;
      const last = i === attempts.length - 1;
      const secret = key.secret();
      const headers: Record<string, string> = { "content-type": "application/json", accept: c.req.header("accept") ?? "application/json" };
      if (provider === "anthropic") {
        headers["x-api-key"] = secret;
        headers["anthropic-version"] = c.req.header("anthropic-version") ?? "2023-06-01";
        const beta = c.req.header("anthropic-beta");
        if (beta) headers["anthropic-beta"] = beta;
      } else {
        headers.authorization = `Bearer ${secret}`;
        if (provider === "openrouter") headers["x-title"] = "ArkoBot";
      }
      const waiting = new AbortController();
      const timer = route.free ? setTimeout(() => waiting.abort(), freeAi.timeoutMs) : null;
      try {
        const response = await ctx.fetch(upstreamUrl(provider, key.baseUrl, endpoint.upstreamPath), {
          method: "POST", headers, body: payloadFor(route), signal: AbortSignal.any([c.req.raw.signal, waiting.signal]), redirect: "error",
        });
        record.providerKeyId = key.id;
        if (!last && shouldFailOver(response.status)) {
          await response.body?.cancel().catch(() => undefined);
          continue;
        }
        return { response, route };
      } catch (error) {
        if (c.req.raw.signal.aborted) throw error;
        if (last) return null;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    return null;
  }

  return {
    app,
    /** Waits for every stream's settlement (tests; a graceful shutdown). */
    async drain(): Promise<void> {
      while (inFlight.size) await Promise.all(inFlight);
    },
  };
}

export type GatewayApp = ReturnType<typeof createGatewayApp>;
