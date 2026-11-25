// A stand-in for Anthropic, OpenAI and OpenRouter, behind the gateway's injected fetch.
// Each call is recorded; `next` queues a scripted answer per provider host.

export interface FakeCall {
  url: string;
  headers: Record<string, string>;
  body: any;
}

export type Script = (call: FakeCall) => Response | Promise<Response>;

const encoder = new TextEncoder();

export function sse(events: { event?: string; data: unknown }[], options: { gate?: Promise<void>; afterFirst?: number } = {}): Response {
  const chunks = events.map(({ event, data }) => `${event ? `event: ${event}\n` : ""}data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`);
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (i === 1 && options.gate) await options.gate;
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[i++]!));
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8", "request-id": "req_fake" } });
}

export function anthropicStream(usage: { input: number; output: number; cacheRead?: number; cacheWrite?: number }, options: { gate?: Promise<void> } = {}) {
  return sse([
    { event: "message_start", data: { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-4-5", content: [],
      usage: { input_tokens: usage.input, output_tokens: 1, cache_read_input_tokens: usage.cacheRead ?? 0, cache_creation_input_tokens: usage.cacheWrite ?? 0 } } } },
    { event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
    { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Olá! Como posso ajudar?" } } },
    { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
    { event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: usage.output } } },
    { event: "message_stop", data: { type: "message_stop" } },
  ], options);
}

export function openaiChatStream(usage: { prompt: number; completion: number; cached?: number; cost?: number }) {
  return sse([
    { data: { id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", content: "Oi" } }], usage: null } },
    { data: { id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: null } },
    { data: { id: "c1", object: "chat.completion.chunk", choices: [],
      usage: { prompt_tokens: usage.prompt, completion_tokens: usage.completion, prompt_tokens_details: { cached_tokens: usage.cached ?? 0 }, ...(usage.cost !== undefined ? { cost: usage.cost } : {}) } } },
    { data: "[DONE]" },
  ]);
}

export function openaiResponsesStream(usage: { input: number; output: number; cached?: number }) {
  return sse([
    { event: "response.created", data: { type: "response.created", response: { id: "r1", status: "in_progress" } } },
    { event: "response.output_text.delta", data: { type: "response.output_text.delta", delta: "Oi" } },
    { event: "response.completed", data: { type: "response.completed", response: { id: "r1", status: "completed",
      usage: { input_tokens: usage.input, output_tokens: usage.output, input_tokens_details: { cached_tokens: usage.cached ?? 0 } } } } },
  ]);
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export function fakeAi() {
  const calls: FakeCall[] = [];
  const queues = new Map<string, Script[]>();
  const fetcher: typeof globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const call: FakeCall = { url, headers, body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    const host = new URL(url).host;
    const script = queues.get(host)?.shift();
    if (!script) return json(500, { error: { message: `nada roteirizado para ${host}` } });
    return script(call);
  }) as typeof globalThis.fetch;
  return {
    fetch: fetcher,
    calls,
    next(host: string, script: Script) {
      const queue = queues.get(host) ?? [];
      queue.push(script);
      queues.set(host, queue);
    },
  };
}

export async function readAll(response: Response): Promise<string> {
  return response.text();
}
