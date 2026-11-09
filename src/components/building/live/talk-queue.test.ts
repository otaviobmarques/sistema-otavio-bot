import { describe, expect, it } from "vitest";
import { MAX_AGE_S, PAIR_WINDOW_S, SETTLE_S, TalkQueue, TOPIC_MAX, shortTopic, talkFromMessage, talkMemory, type TalkEvent, type ThreadDirectory } from "./talk-queue";

const directory: ThreadDirectory = {
  ownerOf: (thread) => ({ "noa-main": "noa", "duda-main": "duda", "lia-task": "lia" } as Record<string, string>)[thread],
  roomOf: (thread) => (thread === "room-1" ? { botIds: ["duda", "noa", "lia"] } : thread === "pair" ? { botIds: ["duda", "noa"] } : undefined),
};

const ask = (id: string, from: string, text: string, extra: object = {}) => ({ id, role: "user" as const, kind: "text" as const, text, peerAsk: { botId: from, name: from, ...extra } });
const roomLine = (id: string, from: string, text: string) => ({ id, role: "bot" as const, kind: "text" as const, text, from: { botId: from, name: from, color: "blue" } });

describe("which messages are bots talking", () => {
  it("reads a teammate's ask delivered into a bot's conversation, with its words as the topic", () => {
    expect(talkFromMessage("noa-main", ask("m1", "duda", "Noa, I need a 15s video for Friday. Can you shoot it tomorrow?"), directory, talkMemory()))
      .toEqual({ key: "m1", from: "duda", to: "noa", topic: "Noa, I need a 15s video for Friday." });
  });

  it("reads a hand-off as the app stores it: the Sent-to row, the ask on the new thread, and the answer row", () => {
    const memory = talkMemory();
    const sent = { id: "s1", role: "bot" as const, kind: "activity" as const, from: { botId: "duda", name: "Duda", color: "cyan" },
      tool: { name: "Sent to Noa", ok: true }, threadRef: { botId: "noa", threadId: "noa-work", title: "@Duda · work" } };
    expect(talkFromMessage("duda-main", sent, directory, memory)).toEqual({ key: "s1", from: "duda", to: "noa", topic: null });
    const request = { id: "s2", role: "bot" as const, kind: "text" as const, roomRequest: { id: "rq", phase: "request" as const },
      from: { botId: "duda", name: "Duda", color: "cyan" }, text: "@Noa Noa, I need a 15s video for Friday." };
    expect(talkFromMessage("noa-work", request, directory, memory), "the new thread is known from the Sent-to row")
      .toEqual({ key: "s2", from: "duda", to: "noa", topic: "Noa, I need a 15s video for Friday." });
    const answer = { id: "s3", role: "bot" as const, kind: "activity" as const, roomRequest: { id: "rq", phase: "result" as const },
      from: { botId: "noa", name: "Noa", color: "coral" }, tool: { name: "Noa replied", ok: true, output: "Deal. Shooting at 10." } };
    expect(talkFromMessage("duda-main", answer, directory, memory)).toEqual({ key: "s3", from: "noa", to: "duda", topic: "Deal. Shooting at 10." });
  });

  it("reads a Messaged chip in the sender's conversation, with no words of its own", () => {
    const chip = { id: "m2", role: "bot" as const, kind: "activity" as const, comm: { groupId: "g", withBotId: "noa", withName: "Noa", withColor: "blue" } };
    expect(talkFromMessage("duda-main", chip, directory, talkMemory())).toEqual({ key: "m2", from: "duda", to: "noa", topic: null });
  });

  it("ignores incident reports, the person's own lines and threads it cannot place", () => {
    expect(talkFromMessage("noa-main", ask("m3", "duda", "failed", { incident: { threadId: "x" } }), directory, talkMemory())).toBeNull();
    expect(talkFromMessage("noa-main", { id: "m4", role: "user", kind: "text", text: "hi" }, directory, talkMemory())).toBeNull();
    expect(talkFromMessage("nowhere", ask("m5", "duda", "hi"), directory, talkMemory())).toBeNull();
    expect(talkFromMessage("duda-main", ask("m6", "duda", "to myself"), directory, talkMemory())).toBeNull();
  });

  it("sends a room speaker to the bot that spoke before it there", () => {
    const seen = talkMemory();
    expect(talkFromMessage("room-1", roomLine("r1", "duda", "Kickoff"), directory, seen), "nobody spoke before in a room of three").toBeNull();
    expect(talkFromMessage("room-1", roomLine("r2", "noa", "On it"), directory, seen)).toMatchObject({ from: "noa", to: "duda", topic: "On it" });
    expect(talkFromMessage("room-1", roomLine("r3", "lia", "Script by tomorrow"), directory, seen)).toMatchObject({ from: "lia", to: "noa" });
  });

  it("sends a speaker in a room of two to the other one", () => {
    expect(talkFromMessage("pair", roomLine("p1", "noa", "Done"), directory, talkMemory())).toMatchObject({ from: "noa", to: "duda" });
  });

  it("cuts a topic to one short sentence of plain words", () => {
    expect(shortTopic("**Bold** start. Then more")).toBe("Bold start. Then more");
    expect(shortTopic("A first sentence that is long enough. Second one.")).toBe("A first sentence that is long enough.");
    const long = shortTopic("x".repeat(200))!;
    expect(long.length).toBe(TOPIC_MAX);
    expect(long.endsWith("…")).toBe(true);
    expect(shortTopic("   ")).toBeNull();
    expect(shortTopic(undefined)).toBeNull();
  });
});

describe("the queue of talks to show", () => {
  const event = (key: string, from: string, to: string, topic: string | null = null): TalkEvent => ({ key, from, to, topic });

  it("waits a moment before starting a talk, then starts it once", () => {
    const queue = new TalkQueue();
    const started: TalkEvent[] = [];
    queue.push(event("a", "duda", "noa", "Video"), 0);
    queue.drain(SETTLE_S / 2, (e) => (started.push(e), true));
    expect(started).toEqual([]);
    queue.drain(SETTLE_S + 0.01, (e) => (started.push(e), true));
    expect(started.map((e) => e.key)).toEqual(["a"]);
    queue.drain(SETTLE_S + 1, (e) => (started.push(e), true));
    expect(started).toHaveLength(1);
  });

  it("makes the chip and the ask of one conversation a single walk, keeping the ask's words", () => {
    const queue = new TalkQueue();
    expect(queue.push(event("chip", "duda", "noa"), 0)).toBe(true);
    expect(queue.push(event("ask", "duda", "noa", "A 15s video"), 0.2)).toBe(false);
    const started: TalkEvent[] = [];
    queue.drain(1, (e) => (started.push(e), true));
    expect(started).toEqual([expect.objectContaining({ key: "chip", topic: "A 15s video" })]);
    expect(queue.push(event("again", "noa", "duda", "Sure"), 2), "the same two within the window").toBe(false);
    expect(queue.push(event("later", "noa", "duda", "Done"), 1 + PAIR_WINDOW_S + 0.1)).toBe(true);
  });

  it("ignores a message it already saw", () => {
    const queue = new TalkQueue();
    expect(queue.push(event("a", "duda", "noa"), 0)).toBe(true);
    queue.drain(1, () => true);
    expect(queue.push(event("a", "duda", "noa"), 20)).toBe(false);
  });

  it("keeps a talk while its bots are busy and drops it once too old", () => {
    const queue = new TalkQueue();
    queue.push(event("a", "duda", "noa"), 0);
    queue.drain(5, () => false);
    expect(queue.size).toBe(1);
    queue.drain(MAX_AGE_S + 1, () => true);
    expect(queue.size).toBe(0);
  });

  it("starts one talk per bot at a time, in arrival order", () => {
    const queue = new TalkQueue();
    queue.push(event("a", "duda", "noa"), 0);
    queue.push(event("b", "duda", "lia"), 0.1);
    queue.push(event("c", "rui", "lia"), 0.2);
    const started: string[] = [];
    queue.drain(2, (e) => (started.push(e.key), true));
    expect(started).toEqual(["a", "c"]);
    queue.drain(3, (e) => (started.push(e.key), true));
    expect(started).toEqual(["a", "c", "b"]);
  });
});
