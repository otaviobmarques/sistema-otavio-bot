import { isReceipt } from "@/lib/receipts";
import { localizedTaskTitle } from "@/lib/task-title";
import type { Bot, InstanceInfo, Message, Task } from "@/state/store";

import { lastLine, lastPreviewable } from "./sidebar-preview";
import { isArchived, threadRecency } from "./SidebarThreadRow";

/** green: something to read; amber: an approval, answer or password waits on the person; red: the bot is stuck. */
export type DestaqueTone = "message" | "needs-you" | "blocked";

export interface Destaque {
  bot: Bot;
  /** The conversation the row opens: the most pressing one, else the newest. */
  threadId: string;
  tone: DestaqueTone;
  /** What waits to be read or answered across the bot's highlighted conversations. */
  count: number;
  at: number;
  preview: string;
}

const RANK: Record<DestaqueTone, number> = { message: 0, "needs-you": 1, blocked: 2 };

type BotTask = Pick<Task, "threadId" | "title" | "createdAt" | "updatedAt" | "unread" | "activity" | "routineRunId" | "archivedAt" | "openAsks" | "lastReadMessageId">;

function botTasks(bot: Bot): BotTask[] {
  if (bot.tasks?.length) return bot.tasks;
  return [{ threadId: bot.threadId, title: "", createdAt: 0, unread: bot.unread, activity: bot.activity }];
}

const waitsOnPerson = (bot: Bot, task: BotTask) =>
  task.activity === "waiting-on-you" || (task.threadId === bot.threadId && bot.activity === "waiting-on-you") || (task.openAsks ?? 0) > 0;

/** A conversation is highlighted while the bot said something the person has not read, or while it waits on them; an
 * approval stays until it is decided, since deciding it is what ends the wait. */
function highlighted(bot: Bot, task: BotTask): boolean {
  if (task.routineRunId) return false;
  const waiting = waitsOnPerson(bot, task);
  if (isArchived(task) && !waiting) return false;
  return waiting || task.unread === true;
}

function stuck(bot: Bot, last: Message | undefined): boolean {
  if (bot.activity === "dead" || bot.activity === "no-signal") return true;
  if (!last) return false;
  return last.kind === "signin" || (last.kind === "activity" && last.tool?.ok === false);
}

function toneOf(bot: Bot, task: BotTask, last: Message | undefined): DestaqueTone {
  if (stuck(bot, last)) return "blocked";
  if (waitsOnPerson(bot, task) || last?.kind === "secret") return "needs-you";
  return "message";
}

/** The bot's lines after the last one the person read; a thread whose messages are not loaded counts as one. */
export function unreadBotLines(messages: readonly Message[], lastReadMessageId: string | undefined): number {
  const from = lastReadMessageId ? messages.findIndex((message) => message.id === lastReadMessageId) + 1 : 0;
  return messages.slice(from).filter((message) => message.role === "bot" && !isReceipt(message) && message.kind !== "activity" && message.kind !== "screen").length;
}

export function botDestaque(bot: Bot, visible: Message[], instances: InstanceInfo[], advanced: boolean): Destaque | null {
  if (bot.hidden || bot.movedTo) return null;
  const tasks = botTasks(bot).filter((task) => highlighted(bot, task));
  if (!tasks.length) return null;
  const last = lastPreviewable(visible);
  const rows = tasks.map((task) => {
    const open = task.threadId === bot.threadId;
    const tone = toneOf(bot, task, open ? last : undefined);
    const lines = open && task.unread ? unreadBotLines(visible, task.lastReadMessageId) : 0;
    return { task, open, tone, count: Math.max(1, lines, task.openAsks ?? 0), at: open && last ? Math.max(last.at, threadRecency(task)) : threadRecency(task) };
  });
  const lead = rows.reduce((best, row) => (RANK[row.tone] > RANK[best.tone] || (RANK[row.tone] === RANK[best.tone] && row.at > best.at) ? row : best));
  const preview = lead.open ? lastLine(bot, visible, instances, advanced) : "";
  return {
    bot,
    threadId: lead.task.threadId,
    tone: lead.tone,
    count: rows.reduce((sum, row) => sum + row.count, 0),
    at: Math.max(...rows.map((row) => row.at)),
    preview: preview || localizedTaskTitle(lead.task.title),
  };
}

/** Newest first, as a messaging app lists the chats that wrote to you. */
export function sidebarDestaques(bots: readonly Bot[], visible: (bot: Bot) => Message[], instances: InstanceInfo[], advanced: boolean): Destaque[] {
  return bots
    .map((bot) => botDestaque(bot, visible(bot), instances, advanced))
    .filter((entry): entry is Destaque => entry !== null)
    .sort((a, b) => b.at - a.at);
}

/** The bots a Destaques row stands in for, so the list below does not show them twice. */
export function withoutDestaques<T extends { pinnedBots: Bot[]; sectionChiefs: Bot[]; sectionedBots: Bot[]; unsectionedBots: Bot[]; unsectionedChief: Bot | null }>(
  parts: T,
  destaques: readonly Destaque[],
): T {
  if (!destaques.length) return parts;
  const ids = new Set(destaques.map((entry) => entry.bot.id));
  const keep = (bots: Bot[]) => bots.filter((bot) => !ids.has(bot.id));
  return {
    ...parts,
    pinnedBots: keep(parts.pinnedBots),
    sectionChiefs: keep(parts.sectionChiefs),
    sectionedBots: keep(parts.sectionedBots),
    unsectionedBots: keep(parts.unsectionedBots),
    unsectionedChief: parts.unsectionedChief && ids.has(parts.unsectionedChief.id) ? null : parts.unsectionedChief,
  };
}
