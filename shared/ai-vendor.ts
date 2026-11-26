import type { ProviderIconPreset } from "./provider-icon.ts";

/** Who made the model a bot answers with. `openrouter` stands for a router whose model's maker is not known, `ollama`
 * for a model served by Ollama whose maker is not known, and `local` for any other server on the person's own
 * computer or network. */
export const AI_VENDORS = [
  "openai", "anthropic", "google", "nvidia", "deepseek", "xai", "meta", "mistral",
  "moonshot", "alibaba", "minimax", "zai", "openrouter", "ollama", "local",
] as const;

export type AiVendorId = typeof AI_VENDORS[number];

/** What is known about a bot's AI. Only `model` names the maker; the rest name who hosts it, the fallback. */
export interface AiVendorSource {
  model?: string | null;
  driverKind?: string | null;
  /** An OpenAI-compatible server's address. */
  url?: string | null;
  /** The provider an engine lists the model under, such as Pi's `anthropic` or `openrouter`. */
  provider?: string | null;
  iconPreset?: ProviderIconPreset | null;
}

const MAKERS: ReadonlyArray<readonly [RegExp, AiVendorId]> = [
  [/nemotron/, "nvidia"],
  [/^nvidia(?:$|[-_])/, "nvidia"],
  [/^(?:anthropic|claude|opus|sonnet|haiku|fable)(?:$|[-_.\d@])/, "anthropic"],
  [/^(?:openai|chatgpt|gpt|codex|o[1-9](?:$|[-_])|dall-e|whisper|sora)/, "openai"],
  [/^(?:google|gemini|gemma|lyria|imagen|veo)(?:$|[-_.\d])/, "google"],
  [/^(?:x-ai|xai|grok)(?:$|[-_.\d])/, "xai"],
  [/^(?:meta|llama(?!\.cpp)|muse)(?:$|[-_.\d:])/, "meta"],
  [/^deepseek/, "deepseek"],
  [/^(?:mistral|mixtral|codestral|devstral|magistral|ministral|pixtral|voxtral)/, "mistral"],
  [/^(?:moonshot|kimi)/, "moonshot"],
  [/^(?:qwen|qwq|qvq|alibaba)/, "alibaba"],
  [/^(?:minimax|abab)/, "minimax"],
  [/^(?:z-ai|zai|zhipu|thudm|glm|chatglm)(?:$|[-_.\d])/, "zai"],
];

const ROUTERS: ReadonlyArray<readonly [RegExp, AiVendorId]> = [
  [/^openrouter$/, "openrouter"],
  [/^ollama(?:-cloud)?$/, "ollama"],
  [/^(?:lmstudio|lm-studio|llamacpp|llama\.cpp|omlx|mlx|vllm)$/, "local"],
];

const DRIVERS: Readonly<Record<string, AiVendorId>> = {
  claudeAgent: "anthropic", claude: "anthropic",
  codex: "openai",
  geminiAgent: "google", antigravityAgent: "google",
  grok: "xai", grokAgent: "xai",
  meta: "meta", museCode: "meta",
  mistral: "mistral",
  deepseekAgent: "deepseek",
  kimiAgent: "moonshot",
  qwenAgent: "alibaba",
  minimax: "minimax",
};

const HOSTS: ReadonlyArray<readonly [RegExp, AiVendorId]> = [
  [/(?:^|\.)openrouter\.ai$/, "openrouter"],
  [/(?:^|\.)openai\.com$/, "openai"],
  [/(?:^|\.)anthropic\.com$/, "anthropic"],
  [/(?:^|\.)googleapis\.com$/, "google"],
  [/^api\.x\.ai$/, "xai"],
  [/(?:^|\.)deepseek\.com$/, "deepseek"],
  [/(?:^|\.)mistral\.ai$/, "mistral"],
  [/(?:^|\.)moonshot\.(?:ai|cn)$/, "moonshot"],
  [/(?:^|\.)aliyuncs\.com$/, "alibaba"],
  [/(?:^|\.)minimaxi?\.(?:io|com|chat)$/, "minimax"],
  [/(?:^|\.)nvidia\.com$/, "nvidia"],
  [/(?:^|\.)(?:llama|meta)\.(?:com|ai)$/, "meta"],
  [/(?:^|\.)(?:z\.ai|bigmodel\.cn)$/, "zai"],
  [/(?:^|\.)ollama\.com$/, "ollama"],
];

const PRESETS: Partial<Record<ProviderIconPreset, AiVendorId>> = {
  openai: "openai", anthropic: "anthropic", google: "google", xai: "xai", deepseek: "deepseek",
  meta: "meta", mistral: "mistral", qwen: "alibaba", moonshot: "moonshot", openrouter: "openrouter",
};

const OLLAMA_PORT = "11434";

function match(table: ReadonlyArray<readonly [RegExp, AiVendorId]>, value: string): AiVendorId | null {
  return table.find(([pattern]) => pattern.test(value))?.[1] ?? null;
}

/** The maker named by a model id such as `claude-opus-5`, `google/gemini-2.5-pro`, `ollama::qwen3`,
 * `typed::openrouter/meta-llama/llama-3.3-70b-instruct` or `nvidia/nemotron-3-super-120b-a12b:free`. The model's own
 * name wins over the route in front of it; a route that names no maker answers only when the name says nothing. */
function vendorOfModel(model: string): AiVendorId | null {
  const id = model.trim().toLowerCase().replace(/^typed::/, "");
  if (!id) return null;
  const segments = id.split(/::|\//).filter(Boolean);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const maker = match(MAKERS, segments[index]);
    if (maker) return maker;
  }
  for (const segment of segments.slice(0, -1)) {
    const router = match(ROUTERS, segment);
    if (router) return router;
  }
  return null;
}

function isLocalHost(host: string): boolean {
  return host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost") || host === "[::1]" ||
    host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.") || /^172\.(?:1[6-9]|2\d|3[01])\./.test(host) ||
    host === "host.docker.internal";
}

function vendorOfUrl(url: string): AiVendorId | null {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (parsed.port === OLLAMA_PORT) return "ollama";
  if (isLocalHost(host)) return "local";
  return match(HOSTS, host);
}

const ROUTED: ReadonlySet<AiVendorId> = new Set(["openrouter", "ollama", "local"]);

/** The maker of a bot's model, or who hosts it when nothing names the maker; null when nothing says. */
export function aiVendorFor(source: AiVendorSource): AiVendorId | null {
  const provider = source.provider?.trim().toLowerCase() ?? "";
  const candidates = [
    source.model ? vendorOfModel(source.model) : null,
    provider ? match(MAKERS, provider) ?? match(ROUTERS, provider) : null,
    source.driverKind ? DRIVERS[source.driverKind] ?? null : null,
    source.url ? vendorOfUrl(source.url) : null,
    source.iconPreset ? PRESETS[source.iconPreset] ?? null : null,
  ];
  return candidates.find((vendor) => vendor && !ROUTED.has(vendor)) ?? candidates.find(Boolean) ?? null;
}

/** The name a person knows each maker by: the product first, its maker after. Brand names are not translated. */
export const AI_VENDOR_NAMES: Record<Exclude<AiVendorId, "local">, string> = {
  openai: "ChatGPT (OpenAI)",
  anthropic: "Claude (Anthropic)",
  google: "Gemini (Google)",
  nvidia: "NVIDIA",
  deepseek: "DeepSeek",
  xai: "Grok (xAI)",
  meta: "Llama (Meta)",
  mistral: "Mistral AI",
  moonshot: "Kimi (Moonshot AI)",
  alibaba: "Qwen (Alibaba)",
  minimax: "MiniMax",
  zai: "GLM (Z.ai)",
  openrouter: "OpenRouter",
  ollama: "Ollama",
};
