import { useMemo } from "react";
import type { InboxRow, InboxView } from "../../../shared/inbox";
import { useInboxView } from "@/state/inbox";
import { useStore, type Bot } from "@/state/store";
import {
  blockedReason, boardItems, deskStatus, inboxWaitsByBot, unreadFailures,
  type BlockedReason, type DeskContext, type DeskStatus,
} from "./building-view";

export interface Desks {
  view: InboxView | null;
  bots: Bot[];
  status: ReadonlyMap<string, DeskStatus>;
  /** Bots stuck for a reason the inbox doesn't already list as an ask of theirs. */
  blocked: Array<{ bot: Bot; reason: Exclude<BlockedReason, "asks-sign-in"> }>;
  items: InboxRow[];
  /** What the Board room holds: every open ask and every stuck bot. */
  pending: number;
}

export function useDesks(): Desks {
  const { state } = useStore();
  const view = useInboxView();
  return useMemo(() => {
    const context: DeskContext = {
      queued: state.pendingQueued, instances: state.instances,
      inboxWaits: inboxWaitsByBot(view), failures: unreadFailures(state.notifications),
    };
    const bots = state.bots.filter((bot) => !bot.hidden);
    const status = new Map(bots.map((bot) => [bot.id, deskStatus(bot, context)]));
    const blocked = bots.flatMap((bot) => {
      const reason = status.get(bot.id) === "blocked" ? blockedReason(bot, context, false) : null;
      return reason && reason !== "asks-sign-in" ? [{ bot, reason }] : [];
    });
    const items = boardItems(view);
    return { view, bots, status, blocked, items, pending: items.length + blocked.length };
  }, [state.pendingQueued, state.instances, state.notifications, state.bots, view]);
}
