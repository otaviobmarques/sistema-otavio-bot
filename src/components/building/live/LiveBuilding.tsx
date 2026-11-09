import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, Gavel } from "lucide-react";
import { listenLiveFrames } from "@/lib/live-events";
import { t } from "@/lib/i18n";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { turnLive } from "@/state/turn-status";
import { useStore, type Bot } from "@/state/store";
import type { BuildingFloor } from "../building-floors";
import type { BlockedReason } from "../building-view";
import type { Desks } from "../use-desks";
import { botLine } from "./bot-lines";
import { BuildingSvg } from "./BuildingSvg";
import { LiveClock, motionPlan } from "./live-clock";
import { liveLayout, seatingKey, type LiveLayout } from "./live-model";
import { levelTag } from "./live-labels";
import { busyUntil, createWorld, planGlance, planVisit, prune, reseat, type World } from "./sim";
import { TalkQueue, talkFromMessage, talkMemory, type TalkEvent, type ThreadDirectory } from "./talk-queue";
import "./live.css";

const InteriorView = lazy(() => import("./InteriorView"));

const LINE_REFRESH_MS = 1000;
/** With nobody walking and nothing said, the cut-away is redrawn only this often: screens flicker, nothing moves. */
const IDLE_FRAME_S = 0.25;

const moving = (w: World) => w.segs.length > 0 || w.says.length > 0 || w.car.length > 0;

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

const readVisible = () => document.visibilityState !== "hidden";

function useDocumentVisible(): boolean {
  return useSyncExternalStore(subscribeVisibility, readVisible, () => true);
}

function sameLines(a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, line] of a) if (b.get(id) !== line) return false;
  return true;
}

function threadDirectory(bots: readonly Bot[], groups: ReturnType<typeof useStore>["state"]["groups"]): ThreadDirectory {
  const owners = new Map<string, string>();
  for (const bot of bots) {
    owners.set(bot.threadId, bot.id);
    if (bot.mainThreadId) owners.set(bot.mainThreadId, bot.id);
    for (const task of bot.tasks ?? []) owners.set(task.threadId, bot.id);
  }
  const botIds = new Set(bots.map((bot) => bot.id));
  const rooms = new Map<string, { botIds: string[] }>();
  for (const group of groups) {
    const room = { botIds: group.memberIds.filter((id) => botIds.has(id)) };
    rooms.set(group.threadId, room);
    for (const task of group.tasks ?? []) rooms.set(task.threadId, room);
  }
  return { ownerOf: (threadId) => owners.get(threadId), roomOf: (threadId) => rooms.get(threadId) };
}

export interface LiveBuildingProps {
  floors: BuildingFloor<Bot>[];
  desks: Desks;
  onBot: (bot: Bot) => void;
  onBoardRoom: () => void;
  onInbox?: () => void;
}

/** The Building drawn as a live cut-away: the board on top, a floor per company, the lift, and every bot at its desk,
 * walking to a teammate when the two talk. */
export default function LiveBuilding({ floors, desks, onBot, onBoardRoom, onInbox }: LiveBuildingProps) {
  const { state } = useStore();
  const visible = useDocumentVisible();
  const reducedMotion = usePrefersReducedMotion();
  const plan = motionPlan({ visible, reducedMotion });
  const [inside, setInside] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  const reasons = useMemo(() => {
    const out = new Map<string, BlockedReason>(desks.blocked.map(({ bot, reason }) => [bot.id, reason]));
    for (const [id, status] of desks.status) if (status === "blocked" && !out.has(id)) out.set(id, "asks-sign-in");
    return out;
  }, [desks]);

  const readLines = useCallback(() => {
    const out = new Map<string, string>();
    for (const bot of desks.bots) {
      const line = botLine(bot, desks.status.get(bot.id) ?? "idle", { queued: state.pendingQueued, blocked: reasons.get(bot.id), live: (thread) => turnLive(thread).status });
      if (line) out.set(bot.id, line);
    }
    return out;
  }, [desks, reasons, state.pendingQueued]);
  const [lines, setLines] = useState(readLines);
  useEffect(() => {
    const refresh = () => {
      const next = readLines();
      setLines((before) => (sameLines(before, next) ? before : next));
    };
    refresh();
    if (!visible) return;
    const timer = setInterval(refresh, LINE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [readLines, visible]);

  const names = useMemo(() => ({
    presidency: t("building.presidency"), boardRoom: t("board.title"), reception: t("building.reception"),
    receptionLine: t("building.receptionLine"), noCompany: t("building.noCompany"), general: t("building.generalRoom"),
  }), []);
  const layout = useMemo(() => liveLayout(floors, { status: desks.status, lines, names }), [floors, desks.status, lines, names]);
  const seating = seatingKey(layout);

  const worldRef = useRef<World | null>(null);
  const seatedFor = useRef("");
  if (!worldRef.current) worldRef.current = createWorld(layout);
  else if (seatedFor.current !== seating) worldRef.current = reseat(worldRef.current, layout);
  seatedFor.current = seating;
  const world = worldRef.current;

  const layoutRef = useRef<LiveLayout>(layout);
  layoutRef.current = layout;
  const clock = useRef(new LiveClock()).current;
  const queue = useRef(new TalkQueue()).current;
  const planRef = useRef(plan);
  planRef.current = plan;
  const directory = useMemo(() => threadDirectory(state.bots, state.groups), [state.bots, state.groups]);
  const directoryRef = useRef(directory);
  directoryRef.current = directory;

  const start = useCallback((event: TalkEvent): boolean => {
    const w = worldRef.current!;
    const at = clock.t;
    if (!w.homes.has(event.from) || !w.homes.has(event.to)) return true;
    const toName = layoutRef.current.bots.find((bot) => bot.id === event.to)?.name ?? "";
    const walking = t("building.live.goingTo", { name: toName });
    if (!planRef.current.walk) return planGlance(w, event.from, at, event.topic ?? walking);
    if (busyUntil(w, event.to) > at) return false;
    return planVisit(w, event.from, event.to, at, { walking, topic: event.topic });
  }, [clock]);

  useEffect(() => {
    const memory = talkMemory();
    return listenLiveFrames({
      onFrame: (frame) => {
        if (frame.kind !== "message" || !clock.isRunning) return;
        const event = talkFromMessage(frame.threadId, frame.message, directoryRef.current, memory);
        if (event) queue.push(event, clock.t);
      },
    });
  }, [clock, queue]);

  useEffect(() => {
    clock.setRunning(visible);
    if (!visible) queue.clear();
  }, [visible, clock, queue]);

  useEffect(() => {
    const step = (t: number) => {
      queue.drain(t, start);
      prune(worldRef.current!, t);
    };
    if (plan.frames) {
      let raf = 0;
      let drawn = -Infinity;
      const frame = (ms: number) => {
        const t = clock.tick(ms);
        step(t);
        if (inside === null && (moving(worldRef.current!) || t - drawn >= IDLE_FRAME_S)) {
          drawn = t;
          setNow(t);
        }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      return () => cancelAnimationFrame(raf);
    }
    if (plan.tickMs === null) return;
    const timer = setInterval(() => {
      const t = clock.step(plan.tickMs! / 1000);
      step(t);
      setNow(t);
    }, plan.tickMs);
    return () => clearInterval(timer);
  }, [plan.frames, plan.tickMs, inside, clock, queue, start]);

  const openBot = (id: string) => {
    const bot = state.bots.find((one) => one.id === id);
    if (bot) onBot(bot);
  };
  const openLevel = (level: number) => {
    const target = layout.levels[level];
    if (!target) return;
    if (target.kind === "lobby") onInbox?.();
    else setInside(level);
  };
  const readClock = useCallback(() => ({ t: clock.t, frozen: !planRef.current.walk }), [clock]);

  const level = inside === null ? null : layout.levels[inside] ?? null;
  if (level === null) {
    return (
      <div className="lb-stage overflow-hidden rounded-2xl" data-live-paused={plan.frames || plan.tickMs ? undefined : ""} data-live-reduced={reducedMotion ? "" : undefined}>
        <BuildingSvg layout={layout} world={world} pending={desks.pending} t={now} still={!plan.walk}
          onLevel={openLevel} onBot={(bot) => openBot(bot.id)} />
      </div>
    );
  }

  const penthouse = level.kind === "penthouse";
  const tableChip = penthouse ? (
    <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-400/80 bg-[#120e04]/90 px-2.5 py-1 text-[11px] font-semibold text-amber-300 shadow-[0_6px_20px_#0008]">
      <span className="size-1.5 rounded-full bg-amber-400" />
      {desks.pending > 0 ? (desks.pending === 1 ? t("building.live.onTableOne") : t("building.live.onTable", { count: desks.pending })) : t("board.empty")}
    </div>
  ) : undefined;
  return (
    <div className="lb-stage relative h-[min(72vh,760px)] min-h-[420px] overflow-hidden rounded-2xl">
      <Suspense fallback={<div className="flex h-full items-center justify-center text-[13px] text-slate-400">{t("building.live.loadingFloor")}</div>}>
        <InteriorView key={level.level} level={level.level} layout={layout} world={world} seating={seating} pending={desks.pending}
          clock={readClock} running={plan.frames} tick={now} onBot={openBot} onTable={penthouse ? onBoardRoom : undefined} tableCard={tableChip} />
      </Suspense>
      <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start gap-2">
        <button type="button" onClick={() => setInside(null)} className="lb-hud-btn pointer-events-auto px-3 py-2">
          <ArrowLeft size={15} aria-hidden="true" />{t("building.live.back")}
        </button>
        <div className="lb-hud-panel pointer-events-auto flex items-center gap-2.5 px-3 py-1.5">
          <span aria-hidden="true" className="h-7 w-1.5 rounded-full" style={{ background: level.accent }} />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {level.level === 0 ? t("building.groundFloor") : penthouse ? t("building.penthouse") : t("building.floorNumber", { number: level.level })}
            </div>
            <h2 className="text-[14px] font-semibold leading-tight text-white">{level.name}{level.sub && <span className="font-normal text-slate-400"> · {level.sub}</span>}</h2>
          </div>
        </div>
        {penthouse && (
          <button type="button" onClick={onBoardRoom} className="lb-hud-btn pointer-events-auto px-3 py-2 text-amber-200">
            <Gavel size={15} aria-hidden="true" />{t("building.live.openBoardRoom")}
          </button>
        )}
        <nav aria-label={t("building.live.levels")} className="pointer-events-auto ml-auto hidden gap-1 md:flex">
          {[...layout.levels].reverse().filter((one) => one.kind !== "lobby").map((one) => (
            <button key={one.level} type="button" className="lb-hud-btn px-2.5 py-1.5" aria-pressed={one.level === level.level} title={one.name} onClick={() => setInside(one.level)}>
              {levelTag(one.level, layout.penthouse)}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
