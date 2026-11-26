// No Node imports: the Admin web app imports this too.

/**
 * OpenAI-compatible base URLs, version included: the gateway appends `/chat/completions`
 * and the key check appends `/models`. A key saved with its own base URL uses that one.
 */
export const OPENAI_COMPATIBLE_BASE_URLS = {
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
  nvidia: "https://integrate.api.nvidia.com/v1",
  groq: "https://api.groq.com/openai/v1",
  cerebras: "https://api.cerebras.ai/v1",
} as const;

export type VersionedProvider = keyof typeof OPENAI_COMPATIBLE_BASE_URLS;

export function isVersionedProvider(provider: string): provider is VersionedProvider {
  return Object.hasOwn(OPENAI_COMPATIBLE_BASE_URLS, provider);
}
