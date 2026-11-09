import type { WireMessage } from "../../../../shared/wire";
import { plainPreviewText } from "../../../../shared/plain-preview";

/** One bot talking to another, as a live message showed it. `topic` is the message's own words, cut short; null when the
 * message carried none (a "Messaged @X" chip). */
export interface TalkEvent {
  key: string;
  from: string;
  to: string;
  topic: string | null;
}

/** Whose conversation a thread is: a bot's own, or a room's with its members. */
export interface ThreadDirectory {
  ownerOf: (threadId: string) => string | undefined;
  roomOf: (threadId: string) => { botIds: readonly string[] } | undefined;
}

export const TOPIC_MAX = 60;

export function shortTopic(text: string | undefined): string | null {
  if (!text) return null;
  const line = plainPreviewText(text).replace(/\s+/g, " ").trim();
  if (!line) return null;
  const sentence = /^.{12,}?[.!?](?=\s|$)/u.exec(line)?.[0] ?? line;
  return sentence.length > TOPIC_MAX ? `${sentence.slice(0, TOPIC_MAX - 1).trimEnd()}…` : sentence;
}

type TalkMessage = Pick<WireMessage, "id" | "role" | "kind" | "text" | "from" | "peerAsk" | "comm" | "roomRequest" | "threadRef" | "tool">;

/** What the extraction remembers between messages: who spoke last in each room, and whose a thread is when a hand-off
 * named it before the app's own list of threads caught up. */
export interface TalkMemory {
  speakers: Map<string, string>;
  owners: Map<string, string>;
}

export const talkMemory = (): TalkMemory => ({ speakers: new Map(), owners: new Map() });

const withoutMention = (text: string | undefined) => text?.replace(/^@\S+\s+/u, "");

/** The talk a newly stored message shows, if any:
 * - a hand-off (coordinate_bots): the "Sent to X" row in the asker's conversation (`threadRef` names X and the thread
 *   opened on X), the ask itself at the top of that thread (`roomRequest` "request", its words the topic), and the
 *   answer row back in the asker's conversation (`roomRequest` "result", from X);
 * - a teammate's line delivered into a bot's conversation (`peerAsk`);
 * - a "Messaged @X" chip in the sender's conversation, with no words of its own;
 * - a bot speaking in a room with other bots, to the bot that spoke there before it (or, in a room of two, the other). */
export function talkFromMessage(threadId: string, message: TalkMessage, directory: ThreadDirectory, memory: TalkMemory): TalkEvent | null {
  const key = message.id;
  const ownerOf = (thread: string) => directory.ownerOf(thread) ?? memory.owners.get(thread);
  const talk = (from: string | undefined, to: string | undefined, topic: string | null): TalkEvent | null =>
    from && to && from !== to ? { key, from, to, topic } : null;
  const speaker = message.from?.botId;
  if (message.kind === "activity" && message.threadRef && !message.roomRequest) {
    memory.owners.set(message.threadRef.threadId, message.threadRef.botId);
    return talk(speaker ?? ownerOf(threadId), message.threadRef.botId, null);
  }
  if (message.roomRequest?.phase === "request" && !directory.roomOf(threadId)) {
    return talk(speaker, ownerOf(threadId), shortTopic(withoutMention(message.text)));
  }
  if (message.roomRequest?.phase === "result" && message.kind === "activity") {
    return talk(speaker, ownerOf(threadId), shortTopic(message.tool?.output));
  }
  if (message.role === "user" && message.peerAsk && !message.peerAsk.incident) {
    return talk(message.peerAsk.botId, ownerOf(threadId), shortTopic(message.text));
  }
  if (message.kind === "activity" && message.comm) return talk(ownerOf(threadId), message.comm.withBotId, null);
  const room = directory.roomOf(threadId);
  if (!room || !speaker || message.role !== "bot" || message.kind !== "text" || !room.botIds.includes(speaker)) return null;
  const before = memory.speakers.get(threadId);
  memory.speakers.set(threadId, speaker);
  const others = room.botIds.filter((id) => id !== speaker);
  const to = before && before !== speaker && others.includes(before) ? before : others.length === 1 ? others[0] : undefined;
  return talk(speaker, to, shortTopic(message.text));
}

/** A talk is planned this long after it arrives, so the chip and the ask of one conversation become one walk. */
export const SETTLE_S = 0.8;
/** A talk that could not start in this long (its bots busy all the while) is dropped rather than played late. */
export const MAX_AGE_S = 45;
/** The same two bots within this long are one conversation. */
export const PAIR_WINDOW_S = 6;
export const MAX_PENDING_PER_BOT = 3;

interface Pending extends TalkEvent {
  at: number;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** The talks waiting to be shown, in arrival order, at most one walk per bot at a time. */
export class TalkQueue {
  private pending: Pending[] = [];
  private seen = new Set<string>();
  private started = new Map<string, number>();

  get size(): number {
    return this.pending.length;
  }

  /** False when the event repeats one already queued or just shown. */
  push(event: TalkEvent, now: number): boolean {
    if (this.seen.has(event.key)) return false;
    this.seen.add(event.key);
    if (this.seen.size > 500) this.seen.delete(this.seen.values().next().value!);
    const pair = pairKey(event.from, event.to);
    const queued = this.pending.find((one) => pairKey(one.from, one.to) === pair && now - one.at < PAIR_WINDOW_S);
    if (queued) {
      if (!queued.topic && event.topic) {
        queued.topic = event.topic;
        if (queued.to === event.from) Object.assign(queued, { from: event.from, to: event.to });
      }
      return false;
    }
    if (now - (this.started.get(pair) ?? -Infinity) < PAIR_WINDOW_S) return false;
    if (this.pending.filter((one) => one.from === event.from).length >= MAX_PENDING_PER_BOT) return false;
    this.pending.push({ ...event, at: now });
    return true;
  }

  /** Starts every settled talk whose bots are free; `start` says whether it could. Talks too old are dropped. */
  drain(now: number, start: (event: TalkEvent) => boolean): void {
    const keep: Pending[] = [];
    const tried = new Set<string>();
    for (const one of this.pending) {
      if (now - one.at > MAX_AGE_S) continue;
      if (now - one.at < SETTLE_S || tried.has(one.from)) {
        keep.push(one);
        continue;
      }
      tried.add(one.from);
      if (start(one)) this.started.set(pairKey(one.from, one.to), now);
      else keep.push(one);
    }
    this.pending = keep;
  }

  clear(): void {
    this.pending = [];
  }
}
