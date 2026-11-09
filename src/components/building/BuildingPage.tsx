import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Building2 } from "lucide-react";
import type { NotificationLogEntry } from "../../../shared/notification";
import { plainPreviewText } from "../../../shared/plain-preview";
import { setBuildingMode, useBuildingMode } from "@/lib/building-preferences";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { useOwnerOrAdmin } from "@/lib/use-owner-or-admin";
import { useShowThreads } from "@/lib/thread-preferences";
import { useCompanies } from "@/state/companies";
import { useCompanySpend } from "@/state/company-spend";
import { openInbox, useInboxSupport } from "@/state/inbox";
import { openBotRow, openThread, useStore, type Bot } from "@/state/store";
import { Segmented } from "../bot-panel/rows";
import { useCaptionChrome } from "../DesktopCapabilities";
import { departmentNames } from "../bot-sections";
import { KIND_LOOK, postNotificationRead } from "../NotificationsPanel";
import { threadUpdatedLabel } from "../SidebarThreadRow";
import { buildingFloors } from "./building-floors";
import { buildingRooms, feedTone } from "./building-view";
import { CompaniesDialog } from "./CompaniesDialog";
import { CompanyFloor, counted, GroundFloor, PenthouseFloor } from "./BuildingFloors";
import { StatusDot, StatusLegend } from "./Desk";
import { useDesks } from "./use-desks";

const FEED_LINES = 8;

const LiveBuilding = lazy(() => import("./live/LiveBuilding"));

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
  const companies = useCompanies();
  const spend = useCompanySpend();
  const mayManage = useOwnerOrAdmin() !== false;
  const inboxSupport = useInboxSupport();
  const [managing, setManaging] = useState(false);
  const mode = useBuildingMode();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const { sections, bots, groups } = state;
  const rooms = useMemo(() => buildingRooms(desks.bots, departmentNames({ sections, bots, groups })), [desks.bots, sections, bots, groups]);
  const floors = useMemo(() => buildingFloors(rooms, companies), [rooms, companies]);
  const companyFloors = floors.filter((floor) => floor.company).length;
  const working = [...desks.status.values()].filter((status) => status === "working").length;
  const feed = state.notifications.slice(0, FEED_LINES);
  const title = t("building.ownerTitle");

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
            <h1 className="truncate text-[20px] font-semibold">{title}</h1>
          </div>
          <p className="mt-1 text-[13px] text-ink-secondary">
            {counted(companyFloors, "building.companyCountOne", "building.companyCount")} · {counted(rooms.length, "building.roomCountOne", "building.roomCount")} · {counted(desks.bots.length, "building.botCountOne", "building.botCount")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-[190px]">
            <Segmented attr="data-building-mode" label={t("building.live.mode")} value={mode} onChange={setBuildingMode}
              options={[{ value: "floors", label: t("building.live.modeFloors") }, { value: "live", label: t("building.live.modeLive") }]} />
          </div>
          <span data-building-working={working} className="flex items-center gap-2 rounded-full border border-hairline px-3 py-1 text-[12px] text-ink-secondary">
            <StatusDot status="working" />{counted(working, "building.workingCountOne", "building.workingCount")}
          </span>
          <button type="button" onClick={() => dispatch({ type: "showBoardRoom" })}
            className={cn("flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-focus",
              desks.pending > 0 ? "border-warning text-warning hover:bg-warning/10" : "border-hairline text-ink-secondary hover:bg-raised/60")}>
            <StatusDot status={desks.pending > 0 ? "waiting" : "idle"} />{counted(desks.pending, "building.pendingCountOne", "building.pendingCount")}
          </button>
          {mayManage && <button type="button" data-building-companies="" onClick={() => setManaging(true)}
            className="flex items-center gap-2 rounded-full border border-hairline px-3 py-1 text-[12px] text-ink outline-none hover:bg-raised/60 focus-visible:ring-2 focus-visible:ring-focus">
            <Building2 size={13} aria-hidden="true" />{t("companies.manage")}
          </button>}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-6 px-6 py-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          {mode === "live" ? (
            <section aria-label={title} className="min-w-0">
              <Suspense fallback={<div className="flex h-[420px] items-center justify-center rounded-2xl border border-hairline/70 bg-panel/40 text-[13px] text-ink-tertiary">{t("building.live.loading")}</div>}>
                <LiveBuilding floors={floors} desks={desks} onBot={openBot} onBoardRoom={() => dispatch({ type: "showBoardRoom" })}
                  onInbox={inboxSupport === "no" ? undefined : () => openInbox()} />
              </Suspense>
            </section>
          ) : (
            <section aria-label={title} className="min-w-0 overflow-hidden rounded-2xl border border-hairline/70 bg-panel/40">
              <PenthouseFloor desks={desks} onOpen={() => dispatch({ type: "showBoardRoom" })} />
              {floors.map((floor, index) => (
                <CompanyFloor key={floor.company?.id ?? "none"} floor={floor} index={index} floorCount={companyFloors}
                  status={desks.status} instances={state.instances} spend={floor.company ? spend.get(floor.company.id) : undefined} onOpen={openBot} />
              ))}
              <GroundFloor onInbox={inboxSupport === "no" ? undefined : () => openInbox()} />
            </section>
          )}
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
      {managing && <CompaniesDialog onClose={() => setManaging(false)} />}
    </main>
  );
}
