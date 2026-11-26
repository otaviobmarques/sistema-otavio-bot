// Calls each free-tier provider once with "Olá", using the keys and models the gateway would use from its environment
// (apps/admin/.env when present). Prints the result per provider; never prints a key.
import { loadDotEnv } from "../src/cli/env.ts";
import { DEFAULT_FREE_MODELS, FREE_AI_PROVIDERS, freeModelAllowed, loadFreeAiConfig } from "../src/gateway/free-ai.ts";
import { OPENAI_COMPATIBLE_BASE_URLS } from "../src/gateway/providers.ts";

loadDotEnv();
const config = loadFreeAiConfig(process.env);
const BASE = { ...OPENAI_COMPATIBLE_BASE_URLS, openrouter: "https://openrouter.ai/api/v1" };
const preview = (text) => text.replace(/\s+/g, " ").trim().slice(0, 60);

let failures = 0;
for (const [name, { provider, keyEnv }] of Object.entries(FREE_AI_PROVIDERS)) {
  const key = config.keys[provider];
  if (!key) {
    console.log(`${name.padEnd(10)} pulado: ${keyEnv} não definida`);
    continue;
  }
  const model = config.models[provider] ?? DEFAULT_FREE_MODELS[name];
  if (!freeModelAllowed(provider, model)) {
    console.log(`${name.padEnd(10)} erro: ${model} não termina em :free (no OpenRouter só modelos :free entram na IA gratuita)`);
    failures++;
    continue;
  }
  const started = performance.now();
  try {
    const response = await fetch(`${BASE[provider]}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "Olá" }], max_tokens: 1024 }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    const ms = Math.round(performance.now() - started);
    const text = await response.text();
    let answer = "";
    try {
      const parsed = JSON.parse(text);
      const message = parsed.choices?.[0]?.message ?? {};
      answer = message.content || (message.reasoning_content ? `(só raciocínio) ${message.reasoning_content}` : "") || parsed.error?.message || "";
    } catch {
      answer = text;
    }
    if (!response.ok) failures++;
    console.log(`${name.padEnd(10)} ${response.ok ? "OK  " : "erro"} HTTP ${response.status} ${String(ms).padStart(6)} ms  ${model}  ${preview(answer.replaceAll(key, "***"))}`);
  } catch (error) {
    failures++;
    console.log(`${name.padEnd(10)} erro sem resposta ${Math.round(performance.now() - started)} ms  ${model}  ${preview(error.message ?? String(error))}`);
  }
}
process.exitCode = failures ? 1 : 0;
