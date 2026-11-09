import { useEffect, useMemo, useState } from "react";
import { Building2, Gavel } from "lucide-react";
import type { NotificationLogEntry } from "../../../shared/notification";
import { plainPreviewText } from "../../../shared/plain-preview";
import { productName } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { engineDisplayName } from "@/lib/engine-name";
import { t } from "@/lib/i18n";
import { useShowThreads } from "@/lib/thread-preferences";
import { openBotRow, openThread, useStore, type Bot, type InstanceInfo } from "@/state/store";
import { useCaptionChrome } from "../DesktopCapabilities";
import { departmentNames } from "../bot-sections";
import { KIND_LOOK, postNotificationRead } from "../NotificationsPanel";
import { threadUpdatedLabel } from "../SidebarThreadRow";
import { buildingRooms, feedTone, type BuildingRoom, type DeskStatus } from "./building-view";
import { DeskTile, StatusDot, StatusLegend } from "./Desk";
import { useDesks } from "./use-desks";

const FEED_LINES = 8;

const counted = (count: number, one: Parameters<typeof t>[0], many: Parameters<typeof t>[0]) => (count === 1 ? t(one) : t(many, { count }));

function enginesOf(bots: readonly Bot[], instances: readonly InstanceInfo[]): string {
  const names = bots.flatMap((bot) => {
    const instance = instances.find((one) => one.instanceId === bot.modelSelection?.instanceId);
    return instance ? [engineDisplayName(instance)] : [];
  });
  return [...new Set(names)].join(" · ");
}

function Room({ room, status, instances, onOpen }: {
  room: BuildingRoom<Bot>;
  status: ReadonlyMap<string, DeskStatus>;
  instances: readonly InstanceInfo[];
  onOpen: (bot: Bot) => void;
}) {
  const name = room.department ?? t("building.generalRoom");
  const engines = enginesOf(room.bots, instances);
  return (
    <section data-building-room={room.department ?? ""} aria-label={name} className="flex min-w-0 flex-col rounded-2xl border border-hairline/70 bg-card px-4 py-3.5">
      <h3 title={name} className="line-clamp-2 break-words text-[14px] font-medium leading-5 text-ink">{name}</h3>
      <div className="mt-3 flex min-h-[74px] flex-wrap gap-1.5">
        {room.bots.map((bot) => <DeskTile key={bot.id} bot={bot} status={status.get(bot.id) ?? "idle"} onOpen={() => onOpen(bot)} />)}
        {room.bots.length === 0 && <span className="self-center text-[12px] text-ink-tertiary">{t("building.emptyRoom")}</span>}
      </div>
      {engines && <div title={engines} className="mt-2 truncate text-[12px] text-ink-tertiary">{engines}</div>}
    </section>
  );
}

function FeedLine({ entry, now, onOpen }: { entry: NotificationLogEntry; now: number; onOpen: () => void }) {
  const look = KIND_LOOK[entry.kind] ?? KIND_LOOK.done;
  const body = plainPreviewText(entry.body || entry.title);
  return (
    <li>
      <button type="button" data-building-feed={entry.id} onClick={onOpen}
        className="flex w-full gap-2.5 rounded-xl border border-hairline/70 bg-card px-3.5 py-3 text-left outline-none hover:bg-raised/60 focus-visible:ring-2 focus-visible:ring-focus">
        <StatusDot status={feedTone(entry.kind)} className="mt-[7px]" />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[13px] leading-5 text-ink-secondary"><span className="font-semibold text-ink">{entry.botName}</span> {body}</span>
          <span className="mt-0.5 block text-[12px] text-ink-tertiary">{t(look.status)} · {threadUpdatedLabel(entry.at, now)}</span>
        </span>
      </button>
    </li>
  );
}

export function BuildingPage() {
  const { state, dispatch } = useStore();
  const { dragProps } = useCaptionChrome();
  const showThreads = useShowThreads();
  const desks = useDesks();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const { sections, bots, groups } = state;
  const rooms = useMemo(() => buildingRooms(desks.bots, departmentNames({ sections, bots, groups })), [desks.bots, sections, bots, groups]);
  const working = [...desks.status.values()].filter((status) => status === "working").length;
  const feed = state.notifications.slice(0, FEED_LINES);
  const name = productName();

  const openBot = (bot: Bot) => openBotRow(dispatch, bot, showThreads, false);
  const openFeed = (entry: NotificationLogEntry) => {
    if (!entry.read) {
      dispatch({ type: "notificationRead", id: entry.id });
      void postNotificationRead(`/api/notifications/${entry.id}/read`, dispatch);
    }
    openThread(dispatch, { botId: entry.botId, threadId: entry.threadId }, state, showThreads);
  };

  return (
    <main data-building-page="" className="flex min-w-0 flex-1 flex-col overflow-hidden bg-app text-ink">
      <header {...dragProps} className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-hairline/40 px-6 py-4 max-md:pl-12">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <Building2 size={18} aria-hidden="true" className="text-ink-secondary" />
            <h1 className="truncate text-[20px] font-semibold">{t("building.title", { name })}</h1>
          </div>
          <p className="mt-1 text-[13px] text-ink-secondary">
            {counted(rooms.length, "building.roomCountOne", "building.roomCount")} · {counted(desks.bots.length, "building.botCountOne", "building.botCount")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span data-building-working={working} className="flex items-center gap-2 rounded-full border border-hairline px-3 py-1 text-[12px] text-ink-secondary">
            <StatusDot status="working" />{counted(working, "building.workingCountOne", "building.workingCount")}
          </span>
          <button type="button" onClick={() => dispatch({ type: "showBoardRoom" })}
            className={cn("flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-focus",
              desks.pending > 0 ? "border-warning text-warning hover:bg-warning/10" : "border-hairline text-ink-secondary hover:bg-raised/60")}>
            <StatusDot status={desks.pending > 0 ? "waiting" : "idle"} />{counted(desks.pending, "building.pendingCountOne", "building.pendingCount")}
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-6 px-6 py-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section aria-label={name} className="min-w-0 overflow-hidden rounded-2xl border border-hairline/70 bg-panel/40">
            <div className="grid gap-4 border-b border-hairline/70 px-5 py-5 2xl:grid-cols-[180px_minmax(0,1fr)] 2xl:gap-6">
              <div className="min-w-0 pt-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-tertiary">{t("building.floorLabel")}</div>
                <h2 className="mt-0.5 truncate text-[17px] font-semibold text-ink" title={name}>{name}</h2>
                <div className="mt-1 text-[12px] text-ink-secondary">{counted(desks.bots.length, "building.botCountOne", "building.botCount")}</div>
              </div>
              <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3.5">
                {rooms.map((room) => <Room key={room.department ?? ""} room={room} status={desks.status} instances={state.instances} onOpen={openBot} />)}
                {rooms.length === 0 && <p className="text-[13px] text-ink-tertiary">{t("building.noBots")}</p>}
              </div>
            </div>
            <div className="grid gap-4 px-5 py-5 2xl:grid-cols-[180px_minmax(0,1fr)] 2xl:gap-6">
              <div className="min-w-0 pt-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-tertiary">{t("building.groundFloor")}</div>
                <div className="mt-0.5 text-[17px] font-semibold text-ink">{t("building.decisions")}</div>
              </div>
              <button type="button" data-building-board={desks.pending} onClick={() => dispatch({ type: "showBoardRoom" })}
                className={cn("flex min-w-0 flex-col items-start rounded-2xl border px-4 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-focus",
                  desks.pending > 0 ? "border-warning bg-warning/[0.05] hover:bg-warning/[0.09]" : "border-hairline/70 bg-card hover:bg-raised/60")}>
                <span className={cn("flex items-center gap-2 text-[14px] font-medium", desks.pending > 0 ? "text-warning" : "text-ink")}>
                  <Gavel size={15} aria-hidden="true" />{t("building.boardTile")}
                </span>
                <span className="mt-3 flex flex-wrap gap-2">
                  {desks.items.length > 0 && <span className="flex items-center gap-2 rounded-full border border-warning px-2.5 py-1 text-[12px] text-ink-secondary">
                    <StatusDot status="waiting" />{counted(desks.items.length, "building.asksCountOne", "building.asksCount")}
                  </span>}
                  {desks.blocked.length > 0 && <span className="flex items-center gap-2 rounded-full border border-hairline px-2.5 py-1 text-[12px] text-ink-secondary">
                    <StatusDot status="blocked" />{counted(desks.blocked.length, "building.blockedCountOne", "building.blockedCount")}
                  </span>}
                  {desks.pending === 0 && <span className="text-[12px] text-ink-secondary">{t("board.empty")}</span>}
                </span>
              </button>
            </div>
          </section>
          <aside aria-label={t("building.feedTitle")} className="flex min-w-0 flex-col gap-6">
            <section>
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-tertiary">{t("building.feedTitle")}</h2>
              {feed.length > 0
                ? <ul className="space-y-2.5">{feed.map((entry) => <FeedLine key={entry.id} entry={entry} now={now} onOpen={() => openFeed(entry)} />)}</ul>
                : <p className="text-[13px] text-ink-tertiary">{t("building.feedEmpty")}</p>}
            </section>
            <section>
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-tertiary">{t("building.legend")}</h2>
              <StatusLegend />
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
