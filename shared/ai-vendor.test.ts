import { describe, expect, it } from "vitest";
import { AI_VENDOR_NAMES, AI_VENDORS, aiVendorFor, type AiVendorId, type AiVendorSource } from "./ai-vendor";

const byModel = (model: string, rest: Omit<AiVendorSource, "model"> = {}) => aiVendorFor({ model, ...rest });

describe("aiVendorFor: the model's maker", () => {
  it.each<[string, AiVendorId]>([
    // ArkoBot gateway (apps/admin/migrations/0003_gateway_ia.sql)
    ["claude-haiku-4-5", "anthropic"], ["claude-sonnet-4-5", "anthropic"], ["claude-opus-5", "anthropic"],
    ["claude-fable-5", "anthropic"], ["claude-haiku-5-5", "anthropic"],
    ["gpt-5-mini", "openai"], ["gpt-5.4", "openai"], ["gpt-5.5", "openai"], ["gpt-5.3-codex", "openai"],
    ["google/gemini-2.5-flash", "google"], ["google/gemini-3.1-pro-preview", "google"],
    ["x-ai/grok-4.7", "xai"], ["minimax/minimax-m3", "minimax"],
    // Claude Code and Codex aliases and catalogs
    ["opus", "anthropic"], ["sonnet-5", "anthropic"], ["haiku", "anthropic"], ["claude-haiku-4-5-20251001", "anthropic"],
    ["gpt-6.1-sol", "openai"], ["gpt-5-codex", "openai"], ["o3", "openai"], ["o4-mini", "openai"],
    // Routes in front of a maker's model
    ["anthropic/claude-sonnet-5", "anthropic"], ["github-copilot/claude-sonnet-4.6", "anthropic"],
    ["opencode/claude-sonnet-5-5", "anthropic"], ["github-copilot/gpt-5.3-codex", "openai"],
    ["github-copilot/gemini-3.8-flash", "google"], ["models/gemini-2.5-pro", "google"],
    ["opencode-go/minimax-m3", "minimax"], ["omlx/MiniMax-M3-4bit", "minimax"], ["MiniMax-M2.7-highspeed", "minimax"],
    ["venice/deepseek-v4-1-flash-uncensored", "deepseek"], ["deepseek-official/deepseek-v4-pro", "deepseek"],
    ["deepseek/deepseek-v4.1-flash-1017", "deepseek"], ["deepseek-reasoner", "deepseek"],
    ["meta-llama/llama-3.3-70b-instruct", "meta"], ["meta/llama-3.3-70b-instruct", "meta"],
    ["muse-spark-1.3", "meta"], ["muse-wonder-1.0", "meta"],
    ["mistral-large-latest", "mistral"], ["mistralai/devstral-small", "mistral"], ["codestral-latest", "mistral"],
    ["kimi-code/k3", "moonshot"], ["kimi-k3", "moonshot"], ["moonshotai/kimi-k2", "moonshot"],
    ["qwen/qwen3-coder-next", "alibaba"], ["qwen-3.8-27b", "alibaba"], ["greenference/qwen3.6-27b", "alibaba"],
    ["z-ai/glm-5.2", "zai"], ["greenference/glm-5.3-flash", "zai"], ["ollama-cloud/glm-5.2", "zai"],
    ["grok-4-fast", "xai"], ["grok-3-mini", "xai"],
    ["gemini-3.8-flash", "google"], ["google/gemma-4-31b-it:free", "google"], ["unsloth/gemma-4-26B-A4B-it-GGUF", "google"],
    // NVIDIA's own models, and other makers' models hosted by NVIDIA or Groq
    ["nvidia/nemotron-3-super-120b-a12b:free", "nvidia"], ["nvidia/llama-3.1-nemotron-70b-instruct", "nvidia"],
    ["openai/gpt-oss-120b", "openai"], ["gpt-oss-120b", "openai"],
    // Local models keep their maker
    ["ollama::qwen3", "alibaba"], ["ollama::llama3.2:latest", "meta"], ["llama3.2:latest", "meta"], ["qwen3.5:4b", "alibaba"],
    ["typed::openrouter/meta-llama/llama-3.3-70b-instruct", "meta"],
  ])("%s → %s", (model, vendor) => {
    expect(byModel(model)).toBe(vendor);
  });

  it("lets the model's maker win over the engine that hosts it", () => {
    expect(byModel("claude-opus-5", { driverKind: "codex" })).toBe("anthropic");
    expect(byModel("google/gemini-2.5-pro", { driverKind: "openai-compat", url: "https://openrouter.ai/api/v1" })).toBe("google");
    expect(byModel("openai/gpt-oss-20b", { driverKind: "groq", url: "https://integrate.api.nvidia.com/v1" })).toBe("openai");
    expect(byModel("llama3.2:latest", { driverKind: "openai-compat", url: "http://127.0.0.1:11434/v1" })).toBe("meta");
    expect(byModel("openrouter/free", { provider: "anthropic" })).toBe("anthropic");
  });
});

describe("aiVendorFor: the host, when the model names no maker", () => {
  it("falls back to the engine of a first-party CLI", () => {
    expect(byModel("auto", { driverKind: "claudeAgent" })).toBe("anthropic");
    expect(byModel("", { driverKind: "codex" })).toBe("openai");
    expect(aiVendorFor({ driverKind: "geminiAgent" })).toBe("google");
    expect(aiVendorFor({ driverKind: "antigravityAgent" })).toBe("google");
    expect(aiVendorFor({ driverKind: "grokAgent" })).toBe("xai");
    expect(aiVendorFor({ driverKind: "kimiAgent" })).toBe("moonshot");
    expect(aiVendorFor({ driverKind: "qwenAgent" })).toBe("alibaba");
    expect(aiVendorFor({ driverKind: "deepseekAgent" })).toBe("deepseek");
    expect(aiVendorFor({ driverKind: "minimax" })).toBe("minimax");
    expect(aiVendorFor({ driverKind: "museCode" })).toBe("meta");
    expect(aiVendorFor({ driverKind: "mistral" })).toBe("mistral");
  });

  it("falls back to an OpenAI-compatible server's host", () => {
    expect(byModel("mystery-1", { driverKind: "openai-compat", url: "https://openrouter.ai/api/v1" })).toBe("openrouter");
    expect(byModel("openrouter/free", { driverKind: "openai-compat" })).toBe("openrouter");
    expect(byModel("xingchen-agi/xing4.0-29b-a4b:free", { url: "https://openrouter.ai/api/v1" })).toBe("openrouter");
    expect(byModel("chat-v9", { url: "https://api.deepseek.com/v1" })).toBe("deepseek");
    expect(byModel("mystery-1", { url: "https://integrate.api.nvidia.com/v1" })).toBe("nvidia");
    expect(byModel("mystery-1", { url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1" })).toBe("alibaba");
    expect(byModel("mystery-1", { url: "https://api.minimax.io/v1" })).toBe("minimax");
  });

  it("names Ollama and other local servers, and still prefers a maker", () => {
    expect(byModel("ornith:35b-bf16", { url: "http://localhost:11434/v1" })).toBe("ollama");
    expect(byModel("ollama::ornith:35b-bf16")).toBe("ollama");
    expect(byModel("my-finetune", { url: "http://127.0.0.1:1234/v1" })).toBe("local");
    expect(byModel("my-finetune", { url: "http://192.168.1.20:8080/v1" })).toBe("local");
    expect(byModel("my-finetune", { provider: "lmstudio" })).toBe("local");
    expect(byModel("ornith:35b-bf16", { provider: "ollama", driverKind: "claudeAgent" })).toBe("anthropic");
  });

  it("falls back to a provider the engine lists the model under, then the instance's icon", () => {
    expect(byModel("k2", { provider: "moonshotai", driverKind: "piAgent" })).toBe("moonshot");
    expect(byModel("mystery-1", { iconPreset: "qwen" })).toBe("alibaba");
    expect(byModel("mystery-1", { iconPreset: "azure" })).toBeNull();
  });

  it("says nothing when nothing names a maker or a host", () => {
    expect(aiVendorFor({})).toBeNull();
    expect(byModel("composer-2.5", { driverKind: "cursorAgent" })).toBeNull();
    expect(byModel("agent-default", { driverKind: "kiroAgent" })).toBeNull();
    expect(byModel("mystery-1", { url: "https://api.example.test/v1" })).toBeNull();
    expect(byModel("mystery-1", { url: "not a url" })).toBeNull();
    expect(byModel("llamacpp")).toBeNull();
    expect(byModel("omnibus")).toBeNull();
  });
});

describe("AI_VENDOR_NAMES", () => {
  it("names every vendor but the local one, which the app translates", () => {
    expect(Object.keys(AI_VENDOR_NAMES).sort()).toEqual(AI_VENDORS.filter((vendor) => vendor !== "local").sort());
  });
});
