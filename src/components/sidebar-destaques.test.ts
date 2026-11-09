import { describe, expect, it } from "vitest";

import type { Bot, Message } from "@/state/store";
import { botDestaque, sidebarDestaques, unreadBotLines, withoutDestaques } from "./sidebar-destaques";

const bot = (id: string, overrides: Partial<Bot> = {}): Bot => ({
  id,
  threadId: `${id}-main`,
  name: id,
  title: "",
  description: "",
  notifications: true,
  color: "green",
  unread: false,
  messages: [],
  tasks: [{ threadId: `${id}-main`, title: "Main", createdAt: 1, updatedAt: 1 }],
  ...overrides,
}) as Bot;

const say = (id: string, at: number, extra: Partial<Message> = {}): Message => ({ id, at, role: "bot", kind: "text", text: id, ...extra }) as Message;

const destaque = (value: Bot) => botDestaque(value, value.messages, [], false);

describe("Destaques", () => {
  it("lists a bot whose reply waits unread in green, with the count of its unread lines and its last line", () => {
    const ana = bot("ana", {
      unread: true,
      messages: [say("old", 1), { id: "me", at: 2, role: "user", kind: "text", text: "go" } as Message, say("one", 3), say("two", 4)],
      tasks: [{ threadId: "ana-main", title: "Main", createdAt: 1, updatedAt: 4, unread: true, lastReadMessageId: "old" }],
    });
    expect(destaque(ana)).toMatchObject({ tone: "message", count: 2, threadId: "ana-main", preview: "two", at: 4 });
  });

  it("leaves a read conversation out, so the bot goes back to its place", () => {
    expect(destaque(bot("ana"))).toBeNull();
  });

  it("keeps an approval in amber until it is decided, read or not", () => {
    const teo = bot("teo", { activity: "waiting-on-you", tasks: [{ threadId: "teo-main", title: "Main", createdAt: 1, activity: "waiting-on-you", unread: false }] });
    expect(destaque(teo)).toMatchObject({ tone: "needs-you", count: 1 });
  });

  it("counts open asks and shows a password request in amber", () => {
    const asks = bot("asks", { tasks: [{ threadId: "asks-main", title: "Main", createdAt: 1, openAsks: 3 }] });
    expect(destaque(asks)).toMatchObject({ tone: "needs-you", count: 3 });
    const secret = bot("secret", { unread: true, messages: [say("pw", 2, { kind: "secret" })], tasks: [{ threadId: "secret-main", title: "Main", createdAt: 1, unread: true }] });
    expect(destaque(secret)?.tone).toBe("needs-you");
  });

  it("shows a failed step, a sign-in request or a dead engine in red", () => {
    const failed = bot("failed", { unread: true, messages: [say("x", 2, { kind: "activity", tool: { name: "error: signed out", ok: false } } as Partial<Message>)], tasks: [{ threadId: "failed-main", title: "Main", createdAt: 1, unread: true }] });
    expect(destaque(failed)?.tone).toBe("blocked");
    const signIn = bot("signin", { unread: true, messages: [say("s", 2, { kind: "signin" })], tasks: [{ threadId: "signin-main", title: "Main", createdAt: 1, unread: true }] });
    expect(destaque(signIn)?.tone).toBe("blocked");
    const dead = bot("dead", { activity: "dead", tasks: [{ threadId: "dead-main", title: "Main", createdAt: 1, unread: true }] });
    expect(destaque(dead)?.tone).toBe("blocked");
  });

  it("opens the most pressing conversation, sums the bot's conversations and previews another thread by its title", () => {
    const mixed = bot("mixed", {
      tasks: [
        { threadId: "mixed-main", title: "Main", createdAt: 1, updatedAt: 9, unread: true },
        { threadId: "mixed-ask", title: "Send the invoices", createdAt: 1, updatedAt: 5, activity: "waiting-on-you" },
      ],
    });
    expect(destaque(mixed)).toMatchObject({ tone: "needs-you", threadId: "mixed-ask", count: 2, preview: "Send the invoices", at: 9 });
  });

  it("ignores routine runs, archived reads and hidden bots", () => {
    const routine = bot("routine", { tasks: [{ threadId: "run", title: "Run", createdAt: 1, unread: true, routineRunId: "r1" }] });
    const archived = bot("archived", { tasks: [{ threadId: "old", title: "Old", createdAt: 1, unread: true, archivedAt: 2 }] });
    const hidden = bot("hidden", { hidden: true, unread: true, tasks: [{ threadId: "hidden-main", title: "Main", createdAt: 1, unread: true }] });
    expect([routine, archived, hidden].map(destaque)).toEqual([null, null, null]);
  });

  it("lists newest first and takes those bots out of the list below", () => {
    const early = bot("early", { tasks: [{ threadId: "early-main", title: "A", createdAt: 1, updatedAt: 2, unread: true }] });
    const late = bot("late", { tasks: [{ threadId: "late-main", title: "B", createdAt: 1, updatedAt: 8, unread: true }] });
    const quiet = bot("quiet");
    const entries = sidebarDestaques([early, quiet, late], (value) => value.messages, [], false);
    expect(entries.map((entry) => entry.bot.id)).toEqual(["late", "early"]);
    const parts = withoutDestaques({ pinnedBots: [early], sectionChiefs: [], sectionedBots: [late], unsectionedBots: [quiet], unsectionedChief: late }, entries);
    expect(parts).toEqual({ pinnedBots: [], sectionChiefs: [], sectionedBots: [], unsectionedBots: [quiet], unsectionedChief: null });
  });

  it("counts only the bot's own lines after the last one read", () => {
    const lines = [say("a", 1), say("b", 2, { kind: "activity" }), say("c", 3)];
    expect(unreadBotLines(lines, "a")).toBe(1);
    expect(unreadBotLines(lines, undefined)).toBe(2);
  });
});
