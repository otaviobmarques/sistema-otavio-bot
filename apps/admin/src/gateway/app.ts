import { randomUUID } from "node:crypto";
import { Hono, type Context } from "hono";
import { hit } from "../auth/rate-limit.ts";
import type { Db } from "../db/db.ts";
import type { SecretBox } from "../security/crypto.ts";
import {
  GatewayRefusal, loadSettings, recordRefusal, releaseRequest, reserveCredits, settleRequest, type RefusalCode, type UsageRecord,
} from "./accounting.ts";
import type { UsageAlertNotifier } from "./alerts.ts";
import { creditsFor, GATEWAY_PROVIDERS, priceFromRow, type GatewayProvider, type ModelPrice, type PriceRow, type TokenUsage } from "./pricing.ts";
import { planAllows, resolveGatewayToken, type GatewayCaller } from "./tokens.ts";
import { UsageMeter, type ApiFlavor } from "./usage.ts";

export interface GatewayContext {
  db: Db;
  box: SecretBox;
  now: () => Date;
  /** Every call to a provider goes through this. */
  fetch: typeof fetch;
  notifier?: UsageAlertNotifier;
}

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
};

const UPSTREAM: Record<GatewayProvider, string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com",
  openrouter: "https://openrouter.ai/api",
};

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
    const { rows } = await ctx.db.query<PriceRow>(
      `SELECT * FROM model_prices WHERE enabled ${provider ? "AND provider = $1" : ""} ORDER BY provider, model`, provider ? [provider] : []);
    const usable = caller.organizationStatus === "active" && caller.subscriptionStatus === "active";
    const data = rows.map(priceFromRow).filter((price) => planAllows(caller, price.model)).map((price) => ({
      id: price.model, object: "model", type: "model", provider: price.provider, display_name: price.label || price.model, owned_by: price.provider, created: 0,
    }));
    return c.json({ object: "list", data, has_more: false, first_id: data[0]?.id ?? null, last_id: data.at(-1)?.id ?? null,
      plan: caller.planCode, usable, organization: { id: caller.organizationId, name: caller.organizationName } });
  };

  app.get("/v1/models", (c) => catalog(c, null));
  app.get("/v1/:provider/v1/models", (c) => {
    const provider = c.req.param("provider") as GatewayProvider;
    if (!GATEWAY_PROVIDERS.includes(provider)) throw new GatewayRefusal("not_found");
    return catalog(c, provider);
  });

  app.post("/v1/:provider/*", async (c) => {
    const started = Date.now();
    const provider = c.req.param("provider") as GatewayProvider;
    const rest = c.req.path.slice(`/v1/${provider}/`.length);
    const endpoint = GATEWAY_PROVIDERS.includes(provider) ? ENDPOINTS[provider][rest] : undefined;
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
      company: label(c.req.header("x-arko-company")), bot: label(c.req.header("x-arko-bot")), providerKeyId: null, httpStatus: null, durationMs: 0,
    };
    const refuse = async (code: RefusalCode): Promise<never> => {
      record.durationMs = Date.now() - started;
      await recordRefusal(ctx.db, record, code, ctx.now()).catch(() => undefined);
      throw new GatewayRefusal(code);
    };

    const priceRow = (await ctx.db.query<PriceRow>("SELECT * FROM model_prices WHERE model = $1", [model])).rows[0];
    const price = priceRow ? priceFromRow(priceRow) : null;
    if (!price || !price.enabled || price.provider !== provider) return refuse(price && planAllows(caller, model) ? "model_unavailable" : "model_not_in_plan");
    if (!planAllows(caller, model)) return refuse("model_not_in_plan");

    const flavor = endpoint.flavor;
    let reserved = 0;
    let maxOutput = 0;
    const inputEstimate = Math.ceil(raw.length / BYTES_PER_INPUT_TOKEN);
    if (flavor) {
      const field = maxOutputField(flavor, body);
      const asked = typeof body[field] === "number" && Number(body[field]) > 0 ? Math.floor(Number(body[field])) : price.defaultMaxOutput;
      const inputCredits = creditsFor(usdFor(price, inputEstimate, 0), price, settings);
      const wanted = creditsFor(usdFor(price, inputEstimate, asked), price, settings);
      const minimum = creditsFor(usdFor(price, inputEstimate, Math.min(asked, MIN_OUTPUT_TOKENS)), price, settings);
      try {
        reserved = await reserveCredits(ctx.db, { caller, requestId: record.requestId, wanted, minimum, settings, now: ctx.now() });
      } catch (error) {
        if (error instanceof GatewayRefusal && error.code !== "duplicate_request") return refuse(error.code);
        throw error;
      }
      maxOutput = asked;
      if (reserved < wanted) {
        const centsPerToken = usdFor(price, 0, 1) * settings.usdBrlRate * 100 * (1 + (price.markupPercent ?? settings.markupPercent) / 100);
        maxOutput = Math.max(1, Math.min(asked, Math.floor((reserved - inputCredits) / centsPerToken)));
        body[field] = maxOutput;
        const thinking = body.thinking as { type?: string; budget_tokens?: number } | undefined;
        if (flavor === "anthropic-messages" && thinking?.type === "enabled" && typeof thinking.budget_tokens === "number" && thinking.budget_tokens >= maxOutput) {
          thinking.budget_tokens = Math.max(1024, maxOutput - 1);
        }
      }
      if (flavor === "openai-chat" && body.stream === true) {
        body.stream_options = { ...(body.stream_options as Record<string, unknown> | undefined), include_usage: true };
      }
      if (provider === "openrouter") body.usage = { ...(body.usage as Record<string, unknown> | undefined), include: true };
    }

    const upstream = await forward(c, provider, endpoint.upstreamPath, flavor === null ? raw : JSON.stringify(body), record);
    record.httpStatus = upstream?.status ?? null;
    if (!upstream) {
      record.durationMs = Date.now() - started;
      if (flavor) await releaseRequest(ctx.db, { record, status: "error", errorCode: "upstream_unavailable", now: ctx.now() });
      throw new GatewayRefusal("upstream_unavailable");
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
      const result = await settleRequest(ctx.db, { record, usage, price, settings, estimated, now: ctx.now() });
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

  async function forward(c: Context, provider: GatewayProvider, path: string, payload: string, record: UsageRecord): Promise<Response | null> {
    const { rows } = await ctx.db.query<{ id: string; api_key_enc: string; base_url: string | null }>(
      "SELECT id, api_key_enc, base_url FROM ai_provider_keys WHERE provider = $1 AND enabled ORDER BY priority, created_at", [provider]);
    for (let i = 0; i < rows.length; i++) {
      const key = rows[i]!;
      const last = i === rows.length - 1;
      const secret = ctx.box.decrypt(key.api_key_enc, aiKeyContext(key.id));
      const base = (key.base_url ?? UPSTREAM[provider]).replace(/\/+$/, "").replace(/\/v1$/, "");
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
      try {
        const response = await ctx.fetch(`${base}${path}`, { method: "POST", headers, body: payload, signal: c.req.raw.signal, redirect: "error" });
        record.providerKeyId = key.id;
        // A key that is out of quota, revoked or down gives way to the next one, while nothing has reached the client.
        if (!last && (response.status === 401 || response.status === 429 || response.status >= 500)) {
          await response.body?.cancel().catch(() => undefined);
          continue;
        }
        return response;
      } catch (error) {
        if (c.req.raw.signal.aborted) throw error;
        if (last) return null;
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
