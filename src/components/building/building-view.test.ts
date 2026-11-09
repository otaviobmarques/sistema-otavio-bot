import { describe, expect, it } from "vitest";
import type { InboxRow } from "../../../shared/inbox";
import type { NotificationLogEntry } from "../../../shared/notification";
import type { Bot, InstanceInfo } from "@/state/store";
import { approvalRow, inboxView, messageRow, questionRow, reportRow, settledRow } from "@/testing/inbox-fixture";
import {
  boardItems, buildingRooms, deskStatus, feedTone, inboxWaitsByBot, unreadFailures, type DeskContext,
} from "./building-view";

const bot = (id: string, extra: Partial<Bot> = {}): Bot => ({
  id, name: id, threadId: `${id}-main`, title: "", description: "", notifications: true, color: "blue", unread: false, messages: [],
  modelSelection: { instanceId: "claude", model: "sonnet" }, ...extra,
} as Bot);

const instance = (snapshot: Partial<InstanceInfo["snapshot"]>): InstanceInfo => ({
  instanceId: "claude", driverKind: "claude", displayName: "Claude", models: { default: "sonnet", options: [] },
  snapshot: { state: "available", authenticated: true, ...snapshot },
} as InstanceInfo);

const context = (extra: Partial<DeskContext> = {}): DeskContext => ({
  queued: {}, instances: [instance({})], inboxWaits: new Map(), failures: new Set(), ...extra,
});

const note = (botId: string, kind: NotificationLogEntry["kind"], at: number, read = false): NotificationLogEntry => ({
  id: `${botId}-${at}`, kind, botId, botName: botId, threadId: `${botId}-main`, title: "", body: "", at, read,
});

const signInRow: InboxRow = {
  id: "line-sign-in", kind: "ask", tab: "needs-you", unread: true, at: approvalRow.at + 1,
  from: { name: "Scout", botId: "scout" }, origin: { botId: "scout", threadId: "scout-main", title: "Scout" }, text: "Sign in to Canva",
  signIn: { site: "canva.com", url: "https://canva.com", place: "browser" },
};

describe("a desk's status", () => {
  it("is idle with nothing going on, and working while a turn runs or a message waits in its queue", () => {
    expect(deskStatus(bot("a"), context())).toBe("idle");
    expect(deskStatus(bot("a", { busy: true }), context())).toBe("working");
    expect(deskStatus(bot("a", { activity: "working" }), context())).toBe("working");
    expect(deskStatus(bot("a", { tasks: [{ threadId: "t2", title: "Other", createdAt: 1, busy: true }] }), context())).toBe("working");
    expect(deskStatus(bot("a", { tasks: [{ threadId: "t2", title: "Other", createdAt: 1 }] }), context({ queued: { t2: [{}] } }))).toBe("working");
  });

  it("waits on the person for a card in any of its threads, or an open ask in the inbox, ahead of work under way", () => {
    expect(deskStatus(bot("a", { busy: true, tasks: [{ threadId: "t2", title: "Other", createdAt: 1, activity: "waiting-on-you" }] }), context())).toBe("waiting");
    expect(deskStatus(bot("a", { busy: true }), context({ inboxWaits: new Map([["a", "waiting"]]) }))).toBe("waiting");
  });

  it("is blocked when its AI needs a sign-in or is missing, it lost its signal, or it asked for a password or a sign-in", () => {
    expect(deskStatus(bot("a", { busy: true }), context({ instances: [instance({ authenticated: false })] }))).toBe("blocked");
    expect(deskStatus(bot("a"), context({ instances: [instance({ state: "unavailable" })] }))).toBe("blocked");
    expect(deskStatus(bot("a", { activity: "no-signal" }), context())).toBe("blocked");
    expect(deskStatus(bot("a", { activity: "waiting-on-you" }), context({ inboxWaits: new Map([["a", "blocked"]]) }))).toBe("blocked");
  });

  it("shows an unread failure until a new turn starts", () => {
    const failures = new Set(["a"]);
    expect(deskStatus(bot("a"), context({ failures }))).toBe("blocked");
    expect(deskStatus(bot("a", { busy: true }), context({ failures }))).toBe("working");
  });
});

describe("unread failures", () => {
  it("counts a bot only when its newest notification is an unread failure", () => {
    expect([...unreadFailures([
      note("a", "turn-failed", 2), note("a", "done", 1),
      note("b", "turn-failed", 1), note("b", "done", 2),
      note("c", "incident", 3, true),
      note("d", "incident", 4),
    ])].sort()).toEqual(["a", "d"]);
  });
});

describe("the Board room", () => {
  it("lists every open ask, newest first, and nothing settled or merely news", () => {
    expect(boardItems(inboxView([reportRow, questionRow, messageRow, settledRow, approvalRow])).map((row) => row.id)).toEqual([approvalRow.id, questionRow.id]);
    expect(boardItems(null)).toEqual([]);
  });

  it("tells each bot's desk what its asks are: a sign-in blocks it, an approval or a question only waits", () => {
    const waits = inboxWaitsByBot(inboxView([approvalRow, questionRow, signInRow, messageRow]));
    expect(Object.fromEntries(waits)).toEqual({ reporter: "waiting", scout: "blocked" });
  });
});

describe("the Building's rooms", () => {
  it("gives each department a room in the workspace's order and puts bots in none, or a gone one, in General", () => {
    const bots = [bot("a", { section: "Sales" }), bot("b"), bot("c", { section: "Support" }), bot("d", { section: "Sales", hidden: true }), bot("e", { section: "Old" })];
    const rooms = buildingRooms(bots, ["Support", "Sales", "Empty"]);
    expect(rooms.map((room) => [room.department, room.bots.map((one) => one.id)])).toEqual([
      ["Support", ["c"]], ["Sales", ["a"]], ["Empty", []], [null, ["b", "e"]],
    ]);
  });

  it("has no General room when every bot has a department", () => {
    expect(buildingRooms([bot("a", { section: "Sales" })], ["Sales"]).map((room) => room.department)).toEqual(["Sales"]);
  });
});

describe("the feed's colours", () => {
  it("matches the desks' legend", () => {
    expect(feedTone("done")).toBe("working");
    expect(feedTone("approval")).toBe("waiting");
    expect(feedTone("turn-failed")).toBe("blocked");
    expect(feedTone("brief")).toBe("idle");
  });
});
