// @vitest-environment happy-dom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/use-owner-or-admin", () => ({ useOwnerOrAdmin: () => true }));
vi.mock("../../state/api", () => ({ api: vi.fn(async () => null) }));

import { initialState, StoreContext, type AppState, type Bot } from "@/state/store";
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
