// A paid model is offered only while its provider has an enabled key in Admin → Integrações (ai_provider_keys): plans
// may list GPT or Gemini before the owner adds an OpenAI or OpenRouter key, and those models then show up by themselves
// once the key is there. Free models (gratis/…) keep their own rule: the saved keys or the gateway host's environment.
import type { Queryable } from "../db/db.ts";
import type { ModelPrice } from "./pricing.ts";

/** The providers with at least one enabled key. */
export async function keyedProviders(q: Queryable): Promise<Set<string>> {
  const { rows } = await q.query<{ provider: string }>("SELECT DISTINCT provider FROM ai_provider_keys WHERE enabled");
  return new Set(rows.map((row) => row.provider));
}

/** Whether the gateway can answer for this model now: a free one always (its own failover), a paid one with a key. */
export function hasKeyFor(price: Pick<ModelPrice, "free" | "provider">, keyed: ReadonlySet<string>): boolean {
  return price.free || keyed.has(price.provider);
}
