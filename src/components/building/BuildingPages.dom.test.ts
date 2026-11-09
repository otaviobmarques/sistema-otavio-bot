// @vitest-environment happy-dom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/use-owner-or-admin", () => ({ useOwnerOrAdmin: () => true }));
vi.mock("../../state/api", () => ({ api: vi.fn(async () => null) }));

import { publishLiveFrame } from "@/lib/live-events";
import { BUILDING_MODE_KEY, setBuildingMode } from "@/lib/building-preferences";
import { api } from "@/state/api";
import { initialState, StoreContext, type AppState, type Bot } from "@/state/store";
import { setCompanies } from "@/state/companies";
import { setInboxView } from "@/state/inbox";
import { approvalRow, inboxView, messageRow, questionRow } from "@/testing/inbox-fixture";
import { BoardRoomPage } from "./BoardRoomPage";
import { BuildingPage } from "./BuildingPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const bot = (id: string, extra: Partial<Bot> = {}): Bot => ({
  id, name: id[0]!.toUpperCase() + id.slice(1), threadId: `${id}-main`, title: "", description: "", notifications: true, color: "blue",
  unread: false, messages: [], modelSelection: { instanceId: "claude", model: "sonnet" }, ...extra,
} as Bot);

const bots = [
  bot("reporter", { section: "RedBox - Agência de Marketing" }),
  bot("scout", { section: "RedBox - Agência de Marketing", busy: true }),
  bot("writer", { busy: true }),
  bot("idle", { section: "FoodX - Gestão de Restaurantes" }),
];

let root: Root;
const dispatch = vi.fn();
const mount = (child: ReactElement, state: Partial<AppState> = {}) => act(async () => {
  root.render(createElement(StoreContext.Provider,
    { value: { state: { ...initialState, bots, sections: ["RedBox - Agência de Marketing", "FoodX - Gestão de Restaurantes"], ...state } as AppState, dispatch, flushBotPatches: vi.fn(), refreshInstances: vi.fn(), refreshModels: vi.fn() } as never }, child));
});
const statusOf = (botId: string) => document.querySelector<HTMLElement>(`[data-desk="${botId}"] [data-desk-status]`)?.dataset.deskStatus;

beforeEach(() => {
  root = createRoot(document.body.appendChild(document.createElement("div")));
  dispatch.mockClear();
  setInboxView(inboxView([approvalRow, questionRow, messageRow]));
});
afterEach(() => {
  act(() => root.unmount());
  setInboxView(null);
  setCompanies(null);
  setBuildingMode("floors");
  document.body.innerHTML = "";
});

describe("the Building", () => {
  it("puts each bot at a desk in its department's room, General last, ringed by what it is doing", async () => {
    await mount(createElement(BuildingPage));
    const rooms = [...document.querySelectorAll<HTMLElement>("[data-building-room]")];
    expect(rooms.map((room) => room.dataset.buildingRoom)).toEqual(["RedBox - Agência de Marketing", "FoodX - Gestão de Restaurantes", ""]);
    expect(rooms[0]!.querySelector("h3")!.getAttribute("title"), "a long department name keeps its full name on hover").toBe("RedBox - Agência de Marketing");
    expect([...rooms[2]!.querySelectorAll<HTMLElement>("[data-desk]")].map((desk) => desk.dataset.desk)).toEqual(["writer"]);
    expect(statusOf("reporter"), "an approval in the inbox").toBe("waiting");
    expect(statusOf("scout"), "a question outranks its running turn").toBe("waiting");
    expect(statusOf("writer")).toBe("working");
    expect(statusOf("idle")).toBe("idle");
    expect(document.querySelector<HTMLElement>("[data-building-board]")!.dataset.buildingBoard).toBe("2");
  });

  it("opens a bot's chat from its desk and the Board room from its tile", async () => {
    await mount(createElement(BuildingPage));
    await act(async () => { document.querySelector<HTMLElement>('[data-desk="writer"]')!.click(); });
    expect(dispatch).toHaveBeenCalledWith({ type: "select", id: "writer" });
    await act(async () => { document.querySelector<HTMLElement>("[data-building-board]")!.click(); });
    expect(dispatch).toHaveBeenCalledWith({ type: "showBoardRoom" });
  });

  it("has the presidency on top, a floor per company with its departments, the rest in No company, and the reception below", async () => {
    setCompanies([{ id: "co_1", name: "RedBox", sector: "Agência de Marketing", mission: "Campanhas com CPA menor.", color: "#FF2D33", monthlyBudgetBrl: 500, usdToBrl: null, budgetReleasedMonth: null, rules: [], order: 0,
      departmentIds: ["RedBox - Agência de Marketing"] }]);
    await mount(createElement(BuildingPage));
    expect(document.querySelector("h1")!.textContent).toBe("Otávio's building");
    const floors = [...document.querySelectorAll<HTMLElement>("[data-building-floor]")];
    expect(floors.map((floor) => floor.dataset.buildingFloor)).toEqual(["penthouse", "co_1", "none", "ground"]);
    expect([...floors[1]!.querySelectorAll<HTMLElement>("[data-building-room]")].map((room) => room.dataset.buildingRoom)).toEqual(["RedBox - Agência de Marketing"]);
    expect([...floors[2]!.querySelectorAll<HTMLElement>("[data-building-room]")].map((room) => room.dataset.buildingRoom)).toEqual(["FoodX - Gestão de Restaurantes", ""]);
    expect(floors[1]!.querySelector<HTMLElement>("[data-floor-stripe]")!.dataset.floorStripe).toBe("#FF2D33");
    expect(floors[1]!.querySelector<HTMLElement>("[data-company-budget]")!.textContent).toContain("500");
    expect(floors[0]!.querySelector<HTMLElement>("[data-building-board]")!.dataset.buildingBoard).toBe("2");
  });

  it("shows each floor's spend against its budget as a meter, and how many approval rules it has", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => (path === "/api/companies/spend"
      ? { spend: [{ companyId: "co_1", month: "2026-11", spentUsd: 80, spentBrl: 440, budgetBrl: 500, usdToBrl: 5.5, percent: 88, level: "warn", released: false }] }
      : null) as never);
    setCompanies([{ id: "co_1", name: "RedBox", sector: "", mission: "", color: "#FF2D33", monthlyBudgetBrl: 500, usdToBrl: null, budgetReleasedMonth: null, order: 0,
      rules: [{ id: "r1", trigger: "bulk-send", threshold: 50 }, { id: "r2", trigger: "deploy" }], departmentIds: ["RedBox - Agência de Marketing"] }]);
    await mount(createElement(BuildingPage));
    await act(async () => { await Promise.resolve(); });
    const meter = document.querySelector<HTMLElement>('[data-company-spend="co_1"]')!;
    expect(meter.dataset.companySpendTone).toBe("warn");
    expect(meter.textContent!.replace(/\s/g, " ")).toContain("R$440.00 of R$500");
    expect(meter.querySelector('[role="meter"]')!.getAttribute("aria-valuenow")).toBe("88");
    expect(meter.textContent).toContain("88% of the budget used");
    expect(document.querySelector<HTMLElement>("[data-company-rules]")!.textContent).toBe("2 approval rules");
    vi.mocked(api).mockImplementation(async () => null);
  });
});

let frames: FrameRequestCallback[] = [];
let frameAt = 0;
/** Plays the animation frames the live view asks for, `ms` of them, 50 ms apart. */
const playFrames = async (ms: number) => {
  for (let played = 0; played < ms; played += 50) {
    frameAt += 50;
    const due = frames;
    frames = [];
    await act(async () => { for (const frame of due) frame(frameAt); });
  }
};
const loaded = async (until: () => boolean) => {
  for (let i = 0; i < 100 && !until(); i++) await act(async () => { await new Promise((done) => setTimeout(done, 20)); });
};
const liveBot = (id: string) => document.querySelector<SVGElement>(`[data-live-bot="${id}"]`);

describe("the live Building", () => {
  beforeEach(() => {
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => frames.push(frame));
    vi.stubGlobal("cancelAnimationFrame", () => { frames = []; });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("switches to the live cut-away, remembers it, and opens a bot's chat from its desk", async () => {
    await mount(createElement(BuildingPage));
    await act(async () => { document.querySelector<HTMLElement>('[data-building-mode="live"]')!.click(); });
    await loaded(() => Boolean(liveBot("writer")));
    expect(localStorage.getItem(BUILDING_MODE_KEY)).toBe("live");
    expect(document.querySelector("[data-building-room]"), "the floor lists are gone").toBeNull();
    expect(liveBot("writer")!.dataset.liveStatus).toBe("working");
    expect(liveBot("reporter")!.dataset.liveStatus, "an approval in the inbox").toBe("waiting");
    expect(liveBot("idle")!.dataset.liveStatus).toBe("idle");
    expect(liveBot("writer")!.dataset.liveMode).toBe("seated");
    await act(async () => { liveBot("writer")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(dispatch).toHaveBeenCalledWith({ type: "select", id: "writer" });
    await act(async () => { document.querySelector<HTMLElement>('[data-building-mode="floors"]')!.click(); });
    expect(document.querySelector("[data-live-building]")).toBeNull();
    expect(localStorage.getItem(BUILDING_MODE_KEY)).toBe("floors");
  });

  it("walks a bot to the teammate it asked, and runs no frames while the window is hidden", async () => {
    setBuildingMode("live");
    await mount(createElement(BuildingPage));
    await loaded(() => Boolean(liveBot("scout")));
    await act(async () => {
      publishLiveFrame({ kind: "message", threadId: "writer-main", message: { id: "ask-1", role: "user", kind: "text", text: "Can you check the copy?", peerAsk: { botId: "scout", name: "Scout" } } } as never);
    });
    await playFrames(1500);
    expect(liveBot("scout")!.dataset.liveMode).toBe("walking");
    expect(liveBot("writer")!.dataset.liveMode, "the one asked stays at its desk").toBe("seated");

    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(document.querySelector("[data-live-paused]")).not.toBeNull();
    expect(frames, "no frame is asked for while hidden").toEqual([]);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(document.querySelector("[data-live-paused]")).toBeNull();
    expect(frames.length).toBeGreaterThan(0);
  });

  it("holds still under reduced motion: the asker stays at its desk with a balloon", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
    setBuildingMode("live");
    await mount(createElement(BuildingPage));
    await loaded(() => Boolean(liveBot("scout")));
    expect(document.querySelector("[data-live-reduced]")).not.toBeNull();
    await act(async () => {
      publishLiveFrame({ kind: "message", threadId: "writer-main", message: { id: "ask-2", role: "user", kind: "text", text: "Can you check the copy?", peerAsk: { botId: "scout", name: "Scout" } } } as never);
    });
    await act(async () => { await new Promise((done) => setTimeout(done, 2100)); });
    expect(frames, "no animation frames at all").toEqual([]);
    expect(liveBot("scout")!.dataset.liveMode).toBe("seated");
    expect(document.querySelector("[data-live-building]")!.textContent).toContain("Can you check the copy?");
  });
});

describe("the Board room", () => {
  it("lists every ask with the chat's own answers, and a stuck bot with the way into its chat", async () => {
    await mount(createElement(BoardRoomPage), { notifications: [{ id: "n1", kind: "turn-failed", botId: "idle", botName: "Idle", threadId: "idle-main", title: "", body: "", at: 1, read: false }] });
    expect([...document.querySelectorAll<HTMLElement>("[data-board-item]")].map((item) => item.dataset.boardItem)).toEqual([approvalRow.id, questionRow.id]);
    expect(document.querySelector<HTMLElement>("[data-board-blocked]")!.dataset.boardBlocked).toBe("idle");
    expect(document.querySelector<HTMLElement>("[data-board-count]")!.dataset.boardCount).toBe("3");
    await act(async () => { document.querySelector<HTMLElement>(`[data-board-item="${approvalRow.id}"] [data-inbox-action="allow"]`)!.click(); });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "decideRequest", threadId: "inbox", requestId: "req-approval", behavior: "allow" }));
  });

  it("says nothing waits when the inbox is clear", async () => {
    setInboxView(inboxView([messageRow]));
    await mount(createElement(BoardRoomPage));
    expect(document.querySelector("[data-board-empty]")).not.toBeNull();
    expect(document.querySelector("[data-board-item]")).toBeNull();
  });
});
