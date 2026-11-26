export const GATEWAY_PROVIDERS = ["anthropic", "openai", "openrouter", "google", "nvidia", "groq", "cerebras"] as const;
export type GatewayProvider = (typeof GATEWAY_PROVIDERS)[number];

/** Providers spoken to in the OpenAI Chat Completions format besides OpenAI itself. */
export const OPENAI_COMPATIBLE_PROVIDERS = ["openrouter", "google", "nvidia", "groq", "cerebras"] as const satisfies readonly GatewayProvider[];

export function isOpenAiCompatible(provider: string): boolean {
  return (OPENAI_COMPATIBLE_PROVIDERS as readonly string[]).includes(provider);
}

export function isGatewayProvider(provider: string): provider is GatewayProvider {
  return (GATEWAY_PROVIDERS as readonly string[]).includes(provider);
}

export interface ModelPrice {
  model: string;
  provider: GatewayProvider;
  label: string;
  /** US$ per million tokens. */
  inputUsd: number;
  cachedInputUsd: number;
  cacheWriteUsd: number;
  outputUsd: number;
  markupPercent: number | null;
  defaultMaxOutput: number;
  enabled: boolean;
  /** Served on the operator's free-tier keys: costs no credits and counts against the plan's daily free requests. */
  free: boolean;
  /** The id sent to the provider; the ArkoBot id when null. */
  upstreamModel: string | null;
}

export interface GatewaySettings {
  markupPercent: number;
  usdBrlRate: number;
  overdraftCredits: number;
  rateLimitPerMinute: number;
  reservationMinutes: number;
}

/** Tokens as billed: `input` excludes cache reads and writes. */
export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** What the provider itself says the call cost, in US$ (OpenRouter's usage.cost). */
  reportedCostUsd?: number;
}

export const EMPTY_USAGE: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

export interface PriceRow {
  model: string;
  provider: GatewayProvider;
  label: string;
  input_usd: string | number;
  cached_input_usd: string | number;
  cache_write_usd: string | number;
  output_usd: string | number;
  markup_percent: string | number | null;
  default_max_output: number;
  enabled: boolean;
  free?: boolean;
  upstream_model?: string | null;
}

export function priceFromRow(row: PriceRow): ModelPrice {
  return {
    model: row.model,
    provider: row.provider,
    label: row.label,
    inputUsd: Number(row.input_usd),
    cachedInputUsd: Number(row.cached_input_usd),
    cacheWriteUsd: Number(row.cache_write_usd),
    outputUsd: Number(row.output_usd),
    markupPercent: row.markup_percent === null ? null : Number(row.markup_percent),
    defaultMaxOutput: Number(row.default_max_output),
    enabled: row.enabled,
    free: row.free === true,
    upstreamModel: row.upstream_model ?? null,
  };
}

export function costUsd(usage: TokenUsage, price: ModelPrice): number {
  if (usage.reportedCostUsd !== undefined && Number.isFinite(usage.reportedCostUsd) && usage.reportedCostUsd >= 0) return usage.reportedCostUsd;
  return (usage.input * price.inputUsd + usage.cacheRead * price.cachedInputUsd + usage.cacheWrite * price.cacheWriteUsd + usage.output * price.outputUsd) / 1_000_000;
}

export function markupFor(price: ModelPrice, settings: GatewaySettings): number {
  return price.markupPercent ?? settings.markupPercent;
}

/** 1 crédito = R$ 0,01. Rounded up: a call that cost anything costs at least one credit. */
export function creditsFor(usd: number, price: ModelPrice, settings: GatewaySettings): number {
  if (usd <= 0 || price.free) return 0;
  const cents = usd * settings.usdBrlRate * 100 * (1 + markupFor(price, settings) / 100);
  return Math.max(1, Math.ceil(cents - 1e-9));
}

export function brlCentsFor(usd: number, settings: GatewaySettings): number {
  return usd * settings.usdBrlRate * 100;
}

/** How many output tokens `credits` still pays for after `inputCredits`. */
export function outputTokensFor(credits: number, inputCredits: number, price: ModelPrice, settings: GatewaySettings): number {
  if (price.outputUsd <= 0) return Number.MAX_SAFE_INTEGER;
  const centsPerToken = (price.outputUsd / 1_000_000) * settings.usdBrlRate * 100 * (1 + markupFor(price, settings) / 100);
  return Math.max(0, Math.floor((credits - inputCredits) / centsPerToken));
}
