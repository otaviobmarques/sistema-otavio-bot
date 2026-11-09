import type { Dispatch } from "react";

import { cn } from "@/lib/cn";
import { intlLocale, t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";
import type { Action, AppState } from "@/state/store";

import { BotAvatar } from "./Avatar";
import { openBotContextMenu, type MenuState } from "./Sidebar";
import type { Destaque, DestaqueTone } from "./sidebar-destaques";
import { SIMPLE_ROW_FOCUS } from "./SidebarSimpleTop";

const TONE_BADGE: Record<DestaqueTone, string> = {
  message: "bg-success text-panel",
  "needs-you": "bg-warning text-panel",
  blocked: "bg-danger text-panel",
};

const TONE_LABEL: Record<DestaqueTone, LocaleKey> = {
  message: "sidebar.destaques.tone.message",
  "needs-you": "sidebar.destaques.tone.needsYou",
  blocked: "sidebar.destaques.tone.blocked",
};

/** A clock time today, else the day and month, as a chat list shows when each chat last spoke. */
export function destaqueTime(at: number, now: number): string {
  if (!Number.isFinite(at) || at <= 0) return "";
  const when = new Date(at);
  const sameDay = when.toDateString() === new Date(now).toDateString();
  return new Intl.DateTimeFormat(intlLocale(), sameDay ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" }).format(when);
}

const countText = (count: number) => (count > 99 ? "99+" : String(count));

export function destaqueLabel(entry: Destaque): string {
  return t("sidebar.destaques.item", { name: entry.bot.name, status: t(TONE_LABEL[entry.tone]), count: entry.count, preview: entry.preview });
}

/** The bots that spoke to the person and wait on them, above the bot list until each is read or decided. */
export function SidebarDestaques({ entries, state, icons, large, now, dispatch, onMenu, onOpened }: {
  entries: Destaque[];
  state: Pick<AppState, "selectedId" | "activeView">;
  icons: boolean;
  large: boolean;
  now: number;
  dispatch: Dispatch<Action>;
  onMenu: (menu: MenuState) => void;
  onOpened?: () => void;
}) {
  if (!entries.length) return null;
  const open = (entry: Destaque) => {
    dispatch({ type: "switchTask", botId: entry.bot.id, threadId: entry.threadId });
    onOpened?.();
  };
  return (
    <section data-sidebar-destaques="" aria-label={t("sidebar.destaques.title")} className={cn("flex flex-col", icons ? "items-center gap-1 pb-1" : "gap-0.5 pb-2")}>
      {icons ? <div aria-hidden="true" className="mx-auto mb-0.5 h-0.5 w-6 rounded-full bg-success/70" /> : (
        <div className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">{t("sidebar.destaques.title")}</div>
      )}
      {entries.map((entry) => {
        const selected = state.activeView === "chat" && state.selectedId === entry.bot.id;
        const label = destaqueLabel(entry);
        const badge = (
          <span data-destaque-badge={entry.tone} aria-hidden="true"
            className={cn("flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[11px] font-bold leading-none tabular-nums", TONE_BADGE[entry.tone])}>
            {entry.tone === "message" ? countText(entry.count) : entry.count > 1 ? countText(entry.count) : "!"}
          </span>
        );
        return (
          <button
            key={entry.bot.id}
            type="button"
            data-sidebar-destaque={entry.bot.id}
            data-destaque-tone={entry.tone}
            aria-label={label}
            title={icons ? label : undefined}
            aria-current={selected ? "page" : undefined}
            onClick={() => open(entry)}
            onContextMenu={(event) => openBotContextMenu(onMenu, entry.bot.id, event)}
            className={cn(
              "relative flex w-full min-w-0 items-center text-left transition-colors duration-150", SIMPLE_ROW_FOCUS,
              icons ? "justify-center rounded-xl px-1 py-1.5" : cn("gap-2.5 rounded-[10px] px-2", large ? "py-2 md:min-h-[54px]" : "py-1.5"),
              selected ? "bg-raised" : "hover:bg-raised/50",
            )}
          >
            <span className="relative flex shrink-0">
              <BotAvatar bot={entry.bot} size={icons ? 40 : large ? 36 : 30} animated={false} trackPointer={false} />
              {icons && <span className="absolute -right-1.5 -top-1.5">{badge}</span>}
            </span>
            {!icons && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className={cn("min-w-0 flex-1 truncate font-semibold text-ink", large ? "text-[14px]" : "text-[13px]")}>{entry.bot.name}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-ink-tertiary">{destaqueTime(entry.at, now)}</span>
                  </span>
                  <span className={cn("block truncate text-ink-secondary", large ? "text-[13px]" : "text-[12px]")}>{entry.preview}</span>
                </span>
                {badge}
              </>
            )}
          </button>
        );
      })}
    </section>
  );
}
export { sidebarDestaques, withoutDestaques } from "./sidebar-destaques";
