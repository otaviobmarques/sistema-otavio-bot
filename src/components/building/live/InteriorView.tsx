import { useEffect, useRef, type ReactNode } from "react";
import { Minus, Plus, RotateCcw, RotateCw, Scan } from "lucide-react";
import { t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";
import { DESK_STATUS_LABEL } from "../building-view";
import { InteriorScene, type InteriorWords } from "./InteriorScene";
import type { LiveLayout } from "./live-model";
import type { World } from "./sim";

interface Props {
  level: number;
  layout: LiveLayout;
  world: World;
  seating: string;
  pending: number;
  clock: () => { t: number; frozen: boolean };
  /** Frames run only while true; otherwise the scene is drawn again at each `tick`. */
  running: boolean;
  tick: number;
  onBot: (id: string) => void;
  onTable?: () => void;
  tableCard?: ReactNode;
}

function words(): InteriorWords {
  return {
    coffee: t("building.live.coffee"),
    meetingRoom: t("building.live.meetingRoom"),
    boardTable: t("building.live.boardTable"),
    you: t("building.live.you"),
    sign: t("building.live.sign"),
    approvals: { title: t("building.live.approvals"), one: t("building.live.pendingOne"), many: t("building.live.pendingMany"), none: t("building.live.upToDate") },
    status: (status) => t(DESK_STATUS_LABEL[status]),
    open: t("building.live.openChat"),
  };
}

export default function InteriorView({ level, layout, world, seating, pending, clock, running, tick, onBot, onTable, tableCard }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const scene = useRef<InteriorScene | null>(null);
  const live = useRef({ onBot, onTable, clock });
  live.current = { onBot, onTable, clock };

  useEffect(() => {
    if (!host.current || !overlay.current) return;
    const s = new InteriorScene(host.current, overlay.current, {
      level,
      words: words(),
      clock: () => live.current.clock(),
      onBotClick: (id) => live.current.onBot(id),
      onTableClick: () => live.current.onTable?.(),
      onAnchor: (x, y) => {
        if (card.current) card.current.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      },
    });
    scene.current = s;
    return () => {
      s.dispose();
      scene.current = null;
    };
  }, [level]);

  useEffect(() => {
    scene.current?.setScene(layout, world, seating);
    scene.current?.setApprovals(pending);
  }, [layout, world, seating, pending, level]);

  useEffect(() => {
    scene.current?.setRunning(running);
    if (!running) scene.current?.renderOnce();
  }, [running, tick, layout, level]);

  return (
    <div className="relative h-full w-full overflow-hidden" data-live-interior={level}>
      <div ref={host} className="absolute inset-0" />
      <div ref={overlay} className="iso-overlay pointer-events-none absolute inset-0 overflow-hidden">
        {tableCard && (
          <div ref={card} className="absolute left-0 top-0 will-change-transform">
            <div className="w-max -translate-x-1/2 -translate-y-1/2">{tableCard}</div>
          </div>
        )}
      </div>
      <div className="absolute bottom-3 right-3 flex gap-1.5">
        <ToolButton label="building.live.rotateLeft" onClick={() => scene.current?.rotate(1)}><RotateCcw size={15} aria-hidden="true" /></ToolButton>
        <ToolButton label="building.live.rotateRight" onClick={() => scene.current?.rotate(-1)}><RotateCw size={15} aria-hidden="true" /></ToolButton>
        <ToolButton label="building.live.zoomOut" onClick={() => scene.current?.zoomBy(1 / 1.25)}><Minus size={15} aria-hidden="true" /></ToolButton>
        <ToolButton label="building.live.zoomIn" onClick={() => scene.current?.zoomBy(1.25)}><Plus size={15} aria-hidden="true" /></ToolButton>
        <ToolButton label="building.live.fit" onClick={() => scene.current?.resetView()}><Scan size={15} aria-hidden="true" /></ToolButton>
      </div>
    </div>
  );
}

function ToolButton({ label, onClick, children }: { label: LocaleKey; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" title={t(label)} aria-label={t(label)} onClick={onClick} className="lb-hud-btn size-9">
      {children}
    </button>
  );
}
