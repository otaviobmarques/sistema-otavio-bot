import type { GatewayProvider } from "./pricing.ts";

/** The free-tier providers, by the name used in the gateway host's environment variables. */
export const FREE_AI_PROVIDERS = {
  groq: { provider: "groq", keyEnv: "GROQ_API_KEY", defaultRpm: 30 },
  gemini: { provider: "google", keyEnv: "GEMINI_API_KEY", defaultRpm: 10 },
  nvidia: { provider: "nvidia", keyEnv: "NVIDIA_API_KEY", defaultRpm: 40 },
  openrouter: { provider: "openrouter", keyEnv: "OPENROUTER_API_KEY", defaultRpm: 20 },
  cerebras: { provider: "cerebras", keyEnv: "CEREBRAS_API_KEY", defaultRpm: 30 },
} as const satisfies Record<string, { provider: GatewayProvider; keyEnv: string; defaultRpm: number }>;

export type FreeAiName = keyof typeof FREE_AI_PROVIDERS;

/** Upstream ids that answered on each free tier on 2026-11-26; the price table seeds the same ones. */
export const DEFAULT_FREE_MODELS: Record<FreeAiName, string> = {
  groq: "openai/gpt-oss-120b",
  gemini: "gemini-3.8-flash",
  nvidia: "moonshotai/kimi-k3.1-pro",
  openrouter: "nvidia/nemotron-3.5-super-vl:free",
  cerebras: "gpt-oss-120b",
};
export const DEFAULT_FREE_AI_ORDER: readonly FreeAiName[] = ["groq", "gemini", "nvidia", "openrouter"];
const DEFAULT_TIMEOUT_MS = 30_000;

/** What the gateway host's environment says about the free pool. Keys stay in memory only. */
export interface FreeAiConfig {
  /** Providers in fallback order; one missing from ARKOBOT_FREE_AI_ORDER comes after the listed ones. */
  order: GatewayProvider[];
  /** ARKOBOT_FREE_MODEL_<NAME>: the upstream model for that provider's free models. */
  models: Partial<Record<GatewayProvider, string>>;
  /** GROQ_API_KEY, GEMINI_API_KEY…: used for the free models only, after the keys saved in Integrações. */
  keys: Partial<Record<GatewayProvider, string>>;
  /** ARKOBOT_FREE_RPM_<NAME>: requests per minute this gateway process sends to that provider's free tier. */
  rpm: Partial<Record<GatewayProvider, number>>;
  /** ARKOBOT_FREE_TIMEOUT_MS: how long to wait for a free provider to start answering before trying the next. */
  timeoutMs: number;
}

function isFreeAiName(name: string): name is FreeAiName {
  return Object.hasOwn(FREE_AI_PROVIDERS, name);
}

export function loadFreeAiConfig(env: Record<string, string | undefined>): FreeAiConfig {
  const listed = (env.ARKOBOT_FREE_AI_ORDER ?? "").split(",").map((name) => name.trim().toLowerCase()).filter(isFreeAiName);
  const names = [...new Set([...(listed.length ? listed : DEFAULT_FREE_AI_ORDER), ...(Object.keys(FREE_AI_PROVIDERS) as FreeAiName[])])];
  const config: FreeAiConfig = { order: [], models: {}, keys: {}, rpm: {}, timeoutMs: Number(env.ARKOBOT_FREE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS };
  for (const name of names) {
    const { provider, keyEnv, defaultRpm } = FREE_AI_PROVIDERS[name];
    config.order.push(provider);
    const suffix = name.toUpperCase();
    const model = env[`ARKOBOT_FREE_MODEL_${suffix}`]?.trim();
    if (model) config.models[provider] = model;
    const key = env[keyEnv]?.trim();
    if (key) config.keys[provider] = key;
    const rpm = Number(env[`ARKOBOT_FREE_RPM_${suffix}`]);
    config.rpm[provider] = Number.isFinite(rpm) && rpm > 0 ? Math.floor(rpm) : defaultRpm;
  }
  return config;
}

/**
 * OpenRouter bills any model without the `:free` suffix to the account, so the free pool never
 * sends one there, whatever the price table or the environment says.
 */
export function freeModelAllowed(provider: GatewayProvider, upstreamModel: string): boolean {
  return provider !== "openrouter" || upstreamModel.endsWith(":free");
}

/** A token bucket per provider, refilled continuously at its requests-per-minute rate, in this process only. */
export class FreeAiRateLimiter {
  readonly #buckets = new Map<GatewayProvider, { tokens: number; at: number }>();
  readonly #rpm: Partial<Record<GatewayProvider, number>>;

  constructor(rpm: Partial<Record<GatewayProvider, number>>) {
    this.#rpm = rpm;
  }

  take(provider: GatewayProvider, nowMs: number): boolean {
    const rpm = this.#rpm[provider];
    if (!rpm) return true;
    const bucket = this.#buckets.get(provider) ?? { tokens: rpm, at: nowMs };
    bucket.tokens = Math.min(rpm, bucket.tokens + ((nowMs - bucket.at) * rpm) / 60_000);
    bucket.at = nowMs;
    this.#buckets.set(provider, bucket);
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }
}
