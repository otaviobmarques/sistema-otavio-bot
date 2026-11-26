// @vitest-environment happy-dom
import { createElement, type ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { InstanceInfo } from "@/state/store";
import { InstancesContext } from "@/state/instances-context";
import { loadLocale, setLocale } from "@/lib/i18n";
import { BotAvatar } from "./Avatar";
import { aiBadgeSize } from "./AiVendorBadge";

const engine = (instanceId: string, driverKind: string, extra: Partial<InstanceInfo> = {}): InstanceInfo => ({
  instanceId, driverKind, displayName: instanceId, snapshot: { state: "available" }, models: { default: "", options: [] }, ...extra,
});
const instances = [
  engine("claude", "claudeAgent", { models: { default: "claude-sonnet-5", options: [] } }),
  engine("gateway-openrouter", "openai-compat", { url: "https://openrouter.ai/api/v1" }),
  engine("ollama", "openai-compat", { url: "http://127.0.0.1:11434/v1" }),
  engine("cursor", "cursorAgent"),
];
const bot = (instanceId: string, model: string) => ({ id: "atlas", name: "Atlas", color: "green" as const, modelSelection: { instanceId, model } });

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  flushSync(() => root.unmount());
  host.remove();
  setLocale("en");
});

function show(node: ReactElement, list: readonly InstanceInfo[] = instances) {
  flushSync(() => root.render(createElement(InstancesContext, { value: list }, node)));
  return host.querySelector<HTMLElement>('[data-testid="ai-badge"]');
}

describe("the AI maker's badge on a bot's avatar", () => {
  it("names the maker of the model, not the router it goes through", () => {
    const badge = show(createElement(BotAvatar, { bot: bot("gateway-openrouter", "google/gemini-2.5-pro"), size: 44 }));
    expect(badge?.dataset.aiVendor).toBe("google");
    expect(badge?.getAttribute("aria-label")).toBe("AI: Gemini (Google)");
    expect(badge?.getAttribute("title")).toBe("AI: Gemini (Google)");
    expect(badge?.querySelector("svg")).not.toBeNull();
  });

  it("follows the engine's default model and speaks Portuguese", async () => {
    await loadLocale("pt-br");
    const badge = show(createElement(BotAvatar, { bot: bot("claude", ""), size: 44 }));
    expect(badge?.getAttribute("aria-label")).toBe("IA: Claude (Anthropic)");
  });

  it("names a local server's maker, else the server", () => {
    expect(show(createElement(BotAvatar, { bot: bot("ollama", "qwen3.5:4b"), size: 44 }))?.dataset.aiVendor).toBe("alibaba");
    expect(show(createElement(BotAvatar, { bot: bot("ollama", "ornith:35b"), size: 44 }))?.dataset.aiVendor).toBe("ollama");
  });

  it("sits on the bottom-right at 40% of the avatar, between 12 and 18 pixels, without resizing the avatar", () => {
    const badge = show(createElement(BotAvatar, { bot: bot("claude", "opus"), size: 32 }))!;
    expect(badge.className).toContain("-bottom-0.5 -right-0.5");
    expect(badge.style.width).toBe("13px");
    const frame = badge.parentElement!;
    expect([frame.style.width, frame.style.height]).toEqual(["32px", "32px"]);
    expect([aiBadgeSize(24), aiBadgeSize(44), aiBadgeSize(220)]).toEqual([12, 18, 18]);
  });

  it("redraws when the bot's model changes", () => {
    expect(show(createElement(BotAvatar, { bot: bot("gateway-openrouter", "x-ai/grok-4.7"), size: 44 }))?.dataset.aiVendor).toBe("xai");
    expect(show(createElement(BotAvatar, { bot: bot("gateway-openrouter", "minimax/minimax-m3"), size: 44 }))?.dataset.aiVendor).toBe("minimax");
  });

  it("hides when the maker is unknown, the engine is gone, the avatar is tiny, or the caller opts out", () => {
    expect(show(createElement(BotAvatar, { bot: bot("cursor", "composer-2.5"), size: 44 }))).toBeNull();
    expect(show(createElement(BotAvatar, { bot: bot("gone", "claude-opus-5"), size: 44 }))).toBeNull();
    expect(show(createElement(BotAvatar, { bot: { name: "Atlas", color: "green" }, size: 44 }))).toBeNull();
    expect(show(createElement(BotAvatar, { bot: bot("claude", "opus"), size: 22 }))).toBeNull();
    expect(show(createElement(BotAvatar, { bot: bot("claude", "opus"), size: 44, aiBadge: false }))).toBeNull();
    expect(show(createElement(BotAvatar, { bot: bot("claude", "opus"), size: 44 }), [])).toBeNull();
    expect(host.querySelector("svg[data-figurinha]")).not.toBeNull();
  });
});
