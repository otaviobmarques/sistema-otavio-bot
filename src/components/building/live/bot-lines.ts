import { t } from "@/lib/i18n";
import { sidebarMessage, sidebarStatus, turnNowPhrases } from "@/lib/live-activity";
import { lastNonReceipt } from "@/lib/receipts";
import { visibleMessages } from "@/state/snapshot-navigation";
import type { Bot } from "@/state/store";
import type { LiveStatus } from "@/state/turn-status";
import { BLOCKED_REASON_LABEL, type BlockedReason, type DeskStatus } from "../building-view";
import { sidebarBotStatus } from "../../SidebarBotActivity";

/** The thread a working bot's balloon reads: the one on screen when it works there, else its first thread at work. */
export function workingThread(bot: Bot): string | undefined {
  const busy = (task: { busy?: boolean; activity?: Bot["activity"] }) => task.busy === true || task.activity === "working";
  const tasks = bot.tasks ?? [];
  const current = tasks.find((task) => task.threadId === bot.threadId);
  if (current ? busy(current) : busy(bot)) return bot.threadId;
  return tasks.find(busy)?.threadId ?? (busy(bot) ? bot.threadId : undefined);
}

/** What a bot's balloon says: the step a working bot is on, as the sidebar words it (the kind of step, never a file name
 * or a command), why a blocked bot is stuck, or that it waits on a teammate. Null for nothing worth a balloon. */
export function botLine(bot: Bot, status: DeskStatus, context: {
  queued: Record<string, unknown[]>;
  blocked?: BlockedReason | null;
  live: (threadId: string) => LiveStatus | null;
}): string | null {
  if (status === "blocked") return context.blocked ? t(BLOCKED_REASON_LABEL[context.blocked]) : null;
  if (status === "waiting") return t("task.waiting");
  if (status === "idle") return sidebarBotStatus(bot, context.queued).teammateWait ? t("task.waitingOnTeammate") : null;
  const thread = workingThread(bot);
  if (!thread) return t("chat.activity.working");
  const message = thread === bot.threadId ? sidebarMessage(lastNonReceipt(visibleMessages(bot))) : undefined;
  return turnNowPhrases(sidebarStatus(context.live(thread)), message)?.phrases[0] ?? t("chat.activity.working");
}
