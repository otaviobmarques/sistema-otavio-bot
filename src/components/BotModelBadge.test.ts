import { createElement, type MemoExoticComponent, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialState, type AppState, type Bot, type InstanceInfo } from "@/state/store";
import type { SidebarDensity } from "@/lib/sidebar-preferences";

const fixture = vi.hoisted(() => ({ state: {} as Partial<AppState>, advanced: true }));
vi.mock("@/lib/thread-preferences", () => ({ useShowThreads: () => false }));
vi.mock("@/lib/interface-mode", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/interface-mode")>(),
  useAdvancedMode: () => fixture.advanced,
}));
vi.mock("./DesktopCapabilities", () => ({ useDesktopCapabilities: () => ({}) }));
vi.mock("react-dom", () => ({ createPortal: (node: ReactNode) => node }));
vi.mock("@/state/store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/state/store")>();
  return { ...original, useStore: () => ({ state: { ...original.initialState, ...fixture.state }, dispatch: vi.fn() }) };
});

import { InstancesContext } from "@/state/instances-context";
import { botModel } from "./BotModelBadge";
import { BotListItem, botRowProps, type BotRowProps } from "./Sidebar";

const claude = {
  instanceId: "claude", driverKind: "claudeAgent", displayName: "Claude", snapshot: { state: "available" },
  models: { default: "sonnet", options: [{ id: "sonnet", label: "Sonnet 4.5" }, { id: "opus", label: "Opus 4.1" }] },
} as InstanceInfo;
const bot = (instanceId: string, model: string): Bot => ({
  id: "atlas", threadId: "t", name: "Atlas", title: "", description: "", color: "green",
  notifications: true, unread: false, messages: [], modelSelection: { instanceId, model },
});

describe("botModel", () => {
  it("names the bot's chosen model by its picker label", () => {
    expect(botModel(bot("claude", "opus"), [claude])).toEqual({ instance: claude, label: "Opus 4.1" });
  });

  it("names the engine's default model when the bot has not chosen one", () => {
    expect(botModel(bot("claude", ""), [claude])?.label).toBe("Sonnet 4.5");
  });

  it("falls back to the raw id of a model the engine does not list", () => {
    expect(botModel(bot("claude", "claude-custom-7"), [claude])?.label).toBe("claude-custom-7");
  });

  it("finds nothing for an engine that is not installed", () => {
    expect(botModel(bot("gone", "opus"), [claude])).toBeNull();
  });
});

describe("sidebar bot row", () => {
  const botRow = (BotListItem as MemoExoticComponent<(props: BotRowProps) => ReactNode>).type;
  const render = (candidate: Bot, density: SidebarDensity) => renderToStaticMarkup(createElement(InstancesContext, { value: [claude] },
    createElement(botRow, botRowProps({ ...initialState, ...fixture.state }, vi.fn(), candidate, { density, query: "", onMenu: vi.fn() }))));
  const badges = (markup: string) => markup.match(/<span data-testid="ai-badge"[^>]*>/g) ?? [];

  beforeEach(() => {
    fixture.state = { bots: [bot("claude", "opus")], instances: [claude], activeView: "chat", selectedId: "other" };
    fixture.advanced = true;
    vi.stubGlobal("window", { innerWidth: 1024, innerHeight: 768 });
    vi.stubGlobal("document", { body: {} });
    vi.stubGlobal("HTMLInputElement", class {});
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it.each<SidebarDensity>(["comfortable", "icons"])("puts the AI maker's mark once on the avatar's bottom-right in a %s row", (density) => {
    const found = badges(render(bot("claude", "opus"), density));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('aria-label="AI: Claude (Anthropic)"');
    expect(found[0]).toContain("absolute -bottom-0.5 -right-0.5");
  });

  it.each<SidebarDensity>(["comfortable", "icons"])("shows the AI maker's mark in a Simple mode %s row", (density) => {
    fixture.advanced = false;
    expect(badges(render(bot("claude", "opus"), density))).toHaveLength(1);
  });

  it("gives the corner to a status dot while the bot works", () => {
    const busy = { ...bot("claude", "opus"), busy: true };
    const markup = render(busy, "comfortable");
    expect(markup).toContain('data-testid="working-dot"');
    expect(badges(markup)).toHaveLength(0);
  });

  it("shows no badge while the bot's engine is missing", () => {
    expect(badges(render(bot("gone", "opus"), "comfortable"))).toHaveLength(0);
  });
});
