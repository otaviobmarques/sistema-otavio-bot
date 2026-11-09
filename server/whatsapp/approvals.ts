// A bot's approval card or question, sent to the owner's WhatsApp as a short message with numbered choices; the owner's
// reply answers the same card through the same path a tap in the app takes. Each message carries a reference ("#A7") so
// a reply can name its card when several wait.
import { formatQuestionAnswers } from "../../shared/ask-question.ts";
import { liveCardKind } from "../../shared/live-approval.ts";
import type { Notification } from "../../shared/notification.ts";
import { redactSecretsInText } from "../../shared/redact.ts";
import { parseReply, pickChoice, sameNumber, type WhatsAppNotify } from "../../shared/whatsapp.ts";
import type { OptionCardData } from "../../shared/wire.ts";
import { serverLine } from "../server-lines.ts";
import type { Message, Store, StoreChange } from "../store.ts";
import type { IncomingText } from "./transport.ts";

export type CardAnswer = { behavior: "allow" | "deny" | "answer"; message?: string };

export interface WhatsAppApprovalsDeps {
  store: Pick<Store, "onChange" | "messagesFor" | "bot" | "botByThread" | "groupByThread">;
  settings(): { ownerNumber?: string; notify: WhatsAppNotify };
  connected(): boolean;
  /** To the owner's number, through the rate-limited outbox; the sent message's id, or null. */
  send(text: string): Promise<string | null>;
  edit(id: string, text: string): Promise<boolean>;
  /** Answers the card exactly as a tap in the app does, with the app's checks, recorded as answered from WhatsApp. */
  answer(input: { threadId: string; requestId: string } & CardAnswer): Promise<{ ok: true } | { ok: false; error: string }>;
  /** The company the bot works for, when it is in one. */
  companyOf(botId: string): string | undefined;
  /** Whether this conversation's cards may leave for the owner's phone at all. */
  allowed(threadId: string): boolean;
  language(threadId: string): string | undefined;
  defer?(run: () => void): void;
}

interface Entry {
  reference: string;
  threadId: string;
  requestId: string;
  language: string | undefined;
  choices: string[];
  /** What each choice answers, in `choices` order; empty: any words answer it. */
  answers: CardAnswer[];
  meaning: { yes?: number; no?: number };
  sent: Promise<string | null>;
  text: string;
  open: boolean;
  /** Settled by a reply from WhatsApp, so the app's change needs no "resolved in the app" line. */
  byWhatsApp?: boolean;
  answering?: boolean;
}

const MAX_DETAIL = 280;
const KEEP_CLOSED = 200;

const clip = (text: string, limit: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1).trimEnd()}…`;
};
/** Security invariant: every word a bot or a card wrote passes the shared secret redaction before it leaves. */
const safe = (text: string | undefined, limit = MAX_DETAIL) => clip(redactSecretsInText(text ?? ""), limit);

const settled = (card: OptionCardData | undefined) => !card || Boolean(card.answered || card.dismissed || card.expired || card.stopped);

/** The choices a card offers in a message, and what each one answers; null when it is answered on screen only. */
export function cardChoices(card: OptionCardData, language: string | undefined): Pick<Entry, "choices" | "answers" | "meaning"> | null {
  const kind = liveCardKind(card);
  if (kind === "review" || kind === null) return null;
  if (kind === "approval" && !card.questionRequest) {
    const budget = card.companyApproval?.kind === "budget" && card.options.length === 2;
    const choices = budget ? card.options.slice() : [serverLine(language, "server.whatsapp.approve"), serverLine(language, "server.whatsapp.deny")];
    return { choices, answers: [{ behavior: "allow" }, { behavior: "deny", message: "Denied by the user, on WhatsApp." }], meaning: { yes: 0, no: 1 } };
  }
  const questions = card.questionRequest?.questions;
  if (questions) {
    const only = questions.length === 1 && !questions[0]!.multiSelect ? questions[0]! : null;
    if (!only || !only.options.length) return null;
    const choices = only.options.map((option) => option.label);
    return { choices, answers: choices.map((label) => ({ behavior: "answer", message: formatQuestionAnswers(questions, [[label]]) })), meaning: yesNo(choices) };
  }
  const choices = card.options.slice();
  return { choices, answers: choices.map((label) => ({ behavior: "answer", message: label })), meaning: yesNo(choices) };
}

function yesNo(choices: readonly string[]): { yes?: number; no?: number } {
  const yes = choices.findIndex((choice) => /^(sim|yes|ja|aprovar|liberar)\b/i.test(choice.trim()));
  const no = choices.findIndex((choice) => /^(n[aã]o|no|nein|recusar)\b/i.test(choice.trim()));
  return { ...(yes >= 0 ? { yes } : {}), ...(no >= 0 ? { no } : {}) };
}

export function createWhatsAppApprovals(deps: WhatsAppApprovalsDeps) {
  const { store } = deps;
  const defer = deps.defer ?? ((run) => setImmediate(run));
  const entries = new Map<string, Entry>();
  const byRequest = new Map<string, string>();
  let counter = 0;

  const nextReference = () => {
    counter += 1;
    const letter = String.fromCharCode(65 + Math.floor((counter - 1) / 99) % 26);
    return `${letter}${((counter - 1) % 99) + 1}`;
  };
  const openEntries = () => [...entries.values()].filter((entry) => entry.open);
  const forget = () => {
    const closed = [...entries.values()].filter((entry) => !entry.open);
    for (const entry of closed.slice(0, Math.max(0, closed.length - KEEP_CLOSED))) {
      entries.delete(entry.reference);
      byRequest.delete(`${entry.threadId}:${entry.requestId}`);
    }
  };
  const reply = (text: string) => void deps.send(text);

  function describe(entry: Pick<Entry, "reference" | "choices" | "language">, message: Message, threadId: string): string {
    const card = message.card!;
    const botId = message.from?.botId ?? store.botByThread(threadId)?.id;
    const bot = botId ? store.bot(botId)?.name ?? message.from?.name : message.from?.name;
    const company = botId ? deps.companyOf(botId) : undefined;
    const language = entry.language;
    const who = [company, bot].filter(Boolean).map((name) => safe(name, 60)).join(" · ");
    const lines = [
      serverLine(language, "server.whatsapp.cardHead", { reference: entry.reference, who: who || serverLine(language, "server.whatsapp.someBot") }),
      safe(card.title, 140),
    ];
    const detail = safe(card.subtitle);
    if (detail && detail !== safe(card.title, 140)) lines.push(detail);
    if (entry.choices.length) {
      lines.push("", entry.choices.map((choice, index) => `${index + 1} ${safe(choice, 60)}`).join(" · "));
      lines.push(serverLine(language, "server.whatsapp.howToAnswer", { reference: entry.reference }));
    } else {
      lines.push("", serverLine(language, "server.whatsapp.howToAnswerWords", { reference: entry.reference }));
    }
    return lines.join("\n");
  }

  function offer(threadId: string, message: Message): void {
    const card = message.card;
    if (!card?.requestId || settled(card) || card.autoApplied) return;
    const key = `${threadId}:${card.requestId}`;
    if (byRequest.has(key)) return;
    const settings = deps.settings();
    if (!settings.ownerNumber || !settings.notify.approvals || !deps.connected()) return;
    if (store.groupByThread(threadId) || !store.botByThread(threadId) || !deps.allowed(threadId)) return;
    const language = deps.language(threadId);
    const choices = cardChoices(card, language);
    if (!choices) return;
    const reference = nextReference();
    const draft = { reference, language, ...choices };
    const text = describe(draft, message, threadId);
    const entry: Entry = { ...draft, threadId, requestId: card.requestId, text, open: true, sent: deps.send(text) };
    entries.set(reference, entry);
    byRequest.set(key, reference);
    forget();
  }

  function settle(threadId: string, message: Message): void {
    const card = message.card;
    if (!card?.requestId || !settled(card)) return;
    const reference = byRequest.get(`${threadId}:${card.requestId}`);
    const entry = reference ? entries.get(reference) : undefined;
    if (!entry?.open || entry.answering) return;
    entry.open = false;
    if (entry.byWhatsApp) return;
    const line = card.answered && card.answered !== "unavailable"
      ? serverLine(entry.language, "server.whatsapp.resolvedInApp", { reference: entry.reference })
      : serverLine(entry.language, "server.whatsapp.closedInApp", { reference: entry.reference });
    void entry.sent.then((id) => { if (id) void deps.edit(id, `${entry.text}\n\n${line}`); });
    reply(line);
  }

  const unsubscribe = store.onChange((change: StoreChange) => {
    if (change.type !== "message" && change.type !== "message.patch") return;
    const { threadId, message } = change;
    if (!message.card?.requestId || (!entries.size && !deps.connected())) return;
    defer(() => {
      const current = store.messagesFor(threadId).find((line) => line.id === message.id) ?? message;
      if (settled(current.card)) settle(threadId, current);
      else offer(threadId, current);
    });
  });

  async function answer(entry: Entry, index: number | null, words: string): Promise<void> {
    const pick = index === null ? { behavior: "answer" as const, message: words } : entry.answers[index]!;
    entry.answering = true;
    const result = await deps.answer({ threadId: entry.threadId, requestId: entry.requestId, ...pick });
    entry.answering = false;
    const card = store.messagesFor(entry.threadId).find((line) => line.card?.requestId === entry.requestId)?.card;
    if (result.ok) {
      entry.open = false;
      entry.byWhatsApp = true;
      const chosen = index === null ? safe(words, 80) : safe(entry.choices[index], 80);
      reply(serverLine(entry.language, "server.whatsapp.answered", { reference: entry.reference, choice: chosen }));
      return;
    }
    if (settled(card)) {
      entry.open = false;
      reply(serverLine(entry.language, "server.whatsapp.late", { reference: entry.reference }));
      return;
    }
    reply(serverLine(entry.language, "server.whatsapp.failed", { reference: entry.reference, reason: safe(result.error, 160) }));
  }

  return {
    /** A text the linked account received. Security invariant: only the owner's own number, in a one-to-one chat, is
     * ever read or answered; anything else gets no reply at all. */
    async received(message: IncomingText): Promise<void> {
      const owner = deps.settings().ownerNumber;
      if (!owner || message.fromMe || message.group || message.broadcast || !message.sender || !sameNumber(message.sender, owner)) return;
      const { reference, answer: words } = parseReply(message.text);
      const open = openEntries();
      const language = open[0]?.language ?? [...entries.values()].at(-1)?.language;
      if (reference) {
        const entry = entries.get(reference);
        if (!entry) return reply(serverLine(language, "server.whatsapp.unknownReference", { reference }));
        if (!entry.open || entry.answering) return reply(serverLine(entry.language, "server.whatsapp.late", { reference }));
        return pickAndAnswer(entry, words);
      }
      if (!open.length) return reply(serverLine(language, "server.whatsapp.nothingOpen"));
      if (open.length > 1) {
        const list = open.slice(0, 6).map((entry) => `#${entry.reference}`).join(", ");
        return reply(serverLine(language, "server.whatsapp.which", { count: open.length, list, example: `#${open.at(-1)!.reference} 1` }));
      }
      return pickAndAnswer(open[0]!, words);
    },

    /** A notice the owner chose to hear about on WhatsApp: spend, or a bot in trouble. */
    notification(notification: Notification): void {
      const settings = deps.settings();
      if (!settings.ownerNumber || !deps.connected() || notification.forPerson) return;
      const budget = notification.kind === "spend" && settings.notify.budget;
      const problem = (notification.kind === "incident" || notification.kind === "turn-failed" || notification.kind === "routine-failed") && settings.notify.problems;
      if (!budget && !problem) return;
      if (problem && !deps.allowed(notification.threadId)) return;
      const language = deps.language(notification.threadId);
      const title = safe(notification.title, 140);
      const head = budget ? serverLine(language, "server.whatsapp.budgetNotice", { title })
        : serverLine(language, "server.whatsapp.problemNotice", { bot: safe(notification.botName, 60), title });
      const body = safe(notification.body);
      reply(body ? `${head}\n${body}` : head);
    },

    pending: () => openEntries().map((entry) => ({ reference: entry.reference, threadId: entry.threadId, requestId: entry.requestId })),

    stop(): void {
      unsubscribe();
    },
  };

  function pickAndAnswer(entry: Entry, words: string): Promise<void> | void {
    if (!entry.choices.length) {
      if (!words) return reply(serverLine(entry.language, "server.whatsapp.emptyAnswer", { reference: entry.reference }));
      return answer(entry, null, words);
    }
    const index = pickChoice(words, entry.choices, entry.meaning);
    if (index !== null) return answer(entry, index, words);
    return reply(serverLine(entry.language, "server.whatsapp.notUnderstood", { reference: entry.reference, count: entry.choices.length }));
  }
}

export type WhatsAppApprovals = ReturnType<typeof createWhatsAppApprovals>;
