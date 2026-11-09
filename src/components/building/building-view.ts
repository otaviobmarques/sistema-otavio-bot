import type { InboxRow, InboxView } from "../../../shared/inbox";
import type { NotificationLogEntry, NotifyKind } from "../../../shared/notification";
import type { LocaleKey } from "@/locales";
import type { Bot, InstanceInfo } from "@/state/store";
import { needsSignIn } from "../EngineSetup";
import { answerKindOf } from "../inbox/inbox-answer";
import { sidebarBotStatus } from "../SidebarBotActivity";

/** A bot's desk in the Building: at work, waiting on the person, stuck until the person steps in, or free. */
export type DeskStatus = "working" | "waiting" | "blocked" | "idle";

export const DESK_STATUSES: readonly DeskStatus[] = ["working", "waiting", "blocked", "idle"];

export const DESK_STATUS_LABEL: Record<DeskStatus, LocaleKey> = {
  working: "building.status.working",
  waiting: "building.status.waiting",
  blocked: "building.status.blocked",
  idle: "building.status.idle",
};

/** Why a bot is stuck until the person steps in. */
export type BlockedReason = "sign-in" | "unavailable" | "no-signal" | "asks-sign-in" | "failed";

export const BLOCKED_REASON_LABEL: Record<BlockedReason, LocaleKey> = {
  "sign-in": "board.blocked.signIn",
  unavailable: "board.blocked.unavailable",
  "no-signal": "board.blocked.noSignal",
  "asks-sign-in": "board.blocked.asksYou",
  failed: "board.blocked.failed",
};

const FAILURE_KINDS: ReadonlySet<NotifyKind> = new Set(["turn-failed", "incident"]);

/** The bot a line of the inbox is about. */
export const rowBotId = (row: Pick<InboxRow, "from" | "origin">): string | undefined => row.from.botId ?? row.origin?.botId;

/** Everything waiting on the person in the Board room, newest first: the inbox's open asks from every bot. */
export function boardItems(view: InboxView | null): InboxRow[] {
  return (view?.rows ?? []).filter((row) => row.tab === "needs-you").sort((a, b) => b.at - a.at);
}

/** What each bot waits on the person for, from the inbox: a password, a sign-in or an app to connect stops its work, any
 * other ask only pauses it. */
export function inboxWaitsByBot(view: InboxView | null): Map<string, "waiting" | "blocked"> {
  const waits = new Map<string, "waiting" | "blocked">();
  for (const row of boardItems(view)) {
    const botId = rowBotId(row);
    if (!botId) continue;
    const kind = answerKindOf(row);
    const wait = kind === "password" || kind === "sign-in" || kind === "connect" ? "blocked" : "waiting";
    if (waits.get(botId) !== "blocked") waits.set(botId, wait);
  }
  return waits;
}

/** The bots whose newest notification is a failure the person has not read yet. */
export function unreadFailures(notifications: readonly NotificationLogEntry[]): Set<string> {
  const newest = new Map<string, NotificationLogEntry>();
  for (const entry of notifications) {
    const seen = newest.get(entry.botId);
    if (!seen || entry.at > seen.at) newest.set(entry.botId, entry);
  }
  return new Set([...newest.values()].filter((entry) => FAILURE_KINDS.has(entry.kind) && !entry.read).map((entry) => entry.botId));
}

export interface DeskContext {
  queued: Record<string, unknown[]>;
  instances: readonly InstanceInfo[];
  inboxWaits: ReadonlyMap<string, "waiting" | "blocked">;
  failures: ReadonlySet<string>;
}

/** Why the bot can't go on without the person, or null. A turn under way outranks an older failure. */
export function blockedReason(bot: Bot, context: DeskContext, working: boolean): BlockedReason | null {
  const instance = context.instances.find((one) => one.instanceId === bot.modelSelection?.instanceId);
  if (needsSignIn(instance)) return "sign-in";
  if (instance?.snapshot.state === "unavailable") return "unavailable";
  if (bot.activity === "dead" || bot.activity === "no-signal") return "no-signal";
  if (context.inboxWaits.get(bot.id) === "blocked") return "asks-sign-in";
  if (!working && context.failures.has(bot.id)) return "failed";
  return null;
}

/** A desk's status, read from what the sidebar already shows for the bot (its threads at work or waiting), its AI's
 * sign-in, the inbox's open asks and its newest notification. Blocked outranks waiting, which outranks working. */
export function deskStatus(bot: Bot, context: DeskContext): DeskStatus {
  const sidebar = sidebarBotStatus(bot, context.queued);
  const working = sidebar.working || sidebar.queued;
  if (blockedReason(bot, context, working)) return "blocked";
  if (sidebar.waiting || context.inboxWaits.get(bot.id) === "waiting") return "waiting";
  return working ? "working" : "idle";
}

/** A room of the Building: one department, or General for bots in none. */
export interface BuildingRoom<T> {
  /** The department's name; null for General. */
  department: string | null;
  bots: T[];
}

/** One room per department, in the workspace's order, then General when any bot is in no department. */
export function buildingRooms<T extends Pick<Bot, "hidden" | "section">>(bots: readonly T[], departments: readonly string[]): BuildingRoom<T>[] {
  const shown = bots.filter((bot) => !bot.hidden);
  const rooms: BuildingRoom<T>[] = departments.map((department) => ({ department, bots: shown.filter((bot) => bot.section === department) }));
  const general = shown.filter((bot) => !bot.section || !departments.includes(bot.section));
  if (general.length > 0) rooms.push({ department: null, bots: general });
  return rooms;
}

/** The colour of a line in the Building's feed. */
export function feedTone(kind: NotifyKind): DeskStatus {
  if (kind === "approval" || kind === "question" || kind === "mention" || kind === "wait") return "waiting";
  if (kind === "sign-in" || kind === "secret" || kind === "turn-failed" || kind === "incident" || kind === "routine-failed" || kind === "spend") return "blocked";
  if (kind === "done" || kind === "delegation-settled") return "working";
  return "idle";
}
