import type { TokenUsage } from "./pricing.ts";

export type ApiFlavor = "anthropic-messages" | "openai-chat" | "openai-responses";

type Json = Record<string, unknown>;

const num = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined);
const obj = (value: unknown): Json | undefined => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : undefined);

/**
 * Reads token usage out of a provider response without touching it: the bytes
 * of a stream go to the client unchanged, and a copy is scanned here.
 *   Anthropic Messages: message_start.message.usage, then cumulative message_delta.usage.
 *   OpenAI Chat Completions (and OpenRouter): the chunk with `usage` (stream_options.include_usage); OpenRouter adds usage.cost.
 *   OpenAI Responses: response.completed / response.incomplete / response.failed carry response.usage.
 */
export class UsageMeter {
  readonly flavor: ApiFlavor;
  #usage: TokenUsage | null = null;
  #final = false;
  #buffer = "";
  readonly #decoder = new TextDecoder();

  constructor(flavor: ApiFlavor) {
    this.flavor = flavor;
  }

  /** Usage seen so far, or null when the response carried none. */
  get usage(): TokenUsage | null {
    return this.#usage;
  }

  /** The provider sent its final usage (the call finished and reported it). */
  get final(): boolean {
    return this.#final;
  }

  push(chunk: Uint8Array): void {
    this.#buffer += this.#decoder.decode(chunk, { stream: true });
    // A single SSE line never needs more than this; a runaway line is dropped rather than buffered without end.
    if (this.#buffer.length > 4_000_000) this.#buffer = "";
    let newline = this.#buffer.indexOf("\n");
    while (newline >= 0) {
      this.#line(this.#buffer.slice(0, newline));
      this.#buffer = this.#buffer.slice(newline + 1);
      newline = this.#buffer.indexOf("\n");
    }
  }

  end(): void {
    this.#buffer += this.#decoder.decode();
    if (this.#buffer) this.#line(this.#buffer);
    this.#buffer = "";
  }

  /** A whole (non-streaming) JSON response body. */
  readBody(text: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    const body = obj(parsed);
    if (!body) return;
    if (this.flavor === "anthropic-messages") this.#anthropic(obj(body.usage), true);
    else if (this.flavor === "openai-chat") this.#chat(obj(body.usage));
    else this.#responses(obj(body.usage));
  }

  #line(raw: string): void {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    const event = obj(parsed);
    if (!event) return;
    if (this.flavor === "anthropic-messages") {
      if (event.type === "message_start") this.#anthropic(obj(obj(event.message)?.usage), false);
      else if (event.type === "message_delta") this.#anthropic(obj(event.usage), true);
    } else if (this.flavor === "openai-chat") {
      this.#chat(obj(event.usage));
    } else if (typeof event.type === "string" && ["response.completed", "response.incomplete", "response.failed"].includes(event.type)) {
      this.#responses(obj(obj(event.response)?.usage));
    }
  }

  #merge(next: Partial<TokenUsage>, final: boolean): void {
    const current = this.#usage ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    this.#usage = {
      input: next.input ?? current.input,
      output: next.output ?? current.output,
      cacheRead: next.cacheRead ?? current.cacheRead,
      cacheWrite: next.cacheWrite ?? current.cacheWrite,
      ...(next.reportedCostUsd !== undefined ? { reportedCostUsd: next.reportedCostUsd } : current.reportedCostUsd !== undefined ? { reportedCostUsd: current.reportedCostUsd } : {}),
    };
    if (final) this.#final = true;
  }

  #anthropic(usage: Json | undefined, final: boolean): void {
    if (!usage) return;
    this.#merge({
      input: num(usage.input_tokens),
      output: num(usage.output_tokens),
      cacheRead: num(usage.cache_read_input_tokens),
      cacheWrite: num(usage.cache_creation_input_tokens),
    }, final);
  }

  #chat(usage: Json | undefined): void {
    if (!usage) return;
    const prompt = num(usage.prompt_tokens) ?? 0;
    const details = obj(usage.prompt_tokens_details);
    const cached = Math.min(prompt, num(details?.cached_tokens) ?? 0);
    const written = Math.min(prompt - cached, num(details?.cache_write_tokens) ?? 0);
    this.#merge({ input: prompt - cached - written, output: num(usage.completion_tokens) ?? 0, cacheRead: cached, cacheWrite: written, reportedCostUsd: num(usage.cost) }, true);
  }

  #responses(usage: Json | undefined): void {
    if (!usage) return;
    const input = num(usage.input_tokens) ?? 0;
    const cached = Math.min(input, num(obj(usage.input_tokens_details)?.cached_tokens) ?? 0);
    this.#merge({ input: input - cached, output: num(usage.output_tokens) ?? 0, cacheRead: cached, cacheWrite: 0 }, true);
  }
}
