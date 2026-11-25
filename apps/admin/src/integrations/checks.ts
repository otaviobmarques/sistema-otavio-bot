import type { CredentialCheck } from "../billing/provider.ts";

export const AI_PROVIDERS = ["anthropic", "openai", "openrouter", "google", "groq", "other"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

interface Probe {
  url: string;
  headers: Record<string, string>;
}

function aiProbe(provider: AiProvider, key: string, baseUrl: string | null): Probe | null {
  switch (provider) {
    case "anthropic":
      return { url: `${baseUrl ?? "https://api.anthropic.com"}/v1/models?limit=1`, headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } };
    case "openai":
      return { url: `${baseUrl ?? "https://api.openai.com"}/v1/models`, headers: { Authorization: `Bearer ${key}` } };
    case "openrouter":
      return { url: `${baseUrl ?? "https://openrouter.ai"}/api/v1/key`, headers: { Authorization: `Bearer ${key}` } };
    case "google":
      return { url: `${baseUrl ?? "https://generativelanguage.googleapis.com"}/v1beta/models?pageSize=1`, headers: { "x-goog-api-key": key } };
    case "groq":
      return { url: `${baseUrl ?? "https://api.groq.com"}/openai/v1/models`, headers: { Authorization: `Bearer ${key}` } };
    case "other":
      return baseUrl ? { url: `${baseUrl}/v1/models`, headers: { Authorization: `Bearer ${key}` } } : null;
  }
}

async function probe(fetcher: typeof fetch, target: Probe): Promise<CredentialCheck> {
  try {
    const response = await fetcher(target.url, { headers: target.headers, signal: AbortSignal.timeout(15_000) });
    if (response.ok) return { ok: true, message: "Chave aceita pelo provedor" };
    if (response.status === 401 || response.status === 403) return { ok: false, message: "Chave recusada pelo provedor" };
    return { ok: false, message: `O provedor respondeu ${response.status}` };
  } catch (error) {
    return { ok: false, message: `Sem resposta do provedor: ${(error as Error).message}` };
  }
}

/** Asks the provider whether the key works, with a read-only call that spends nothing. */
export function checkAiKey(fetcher: typeof fetch, provider: AiProvider, key: string, baseUrl: string | null): Promise<CredentialCheck> {
  const target = aiProbe(provider, key, baseUrl?.replace(/\/+$/, "") ?? null);
  if (!target) return Promise.resolve({ ok: false, message: "Informe a URL base para testar este provedor" });
  return probe(fetcher, target);
}

export function checkHostingerToken(fetcher: typeof fetch, token: string): Promise<CredentialCheck> {
  return probe(fetcher, { url: "https://developers.hostinger.com/api/vps/v1/virtual-machines", headers: { Authorization: `Bearer ${token}` } });
}
