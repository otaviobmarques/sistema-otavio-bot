import { Minus, Plus, RotateCcw, RotateCw, Scan } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import type { Bot } from "../data/mock";
import { InteriorScene } from "./InteriorScene";
import type { World } from "./sim";

interface Props {
  floor: number;
  world: World;
  bots: Bot[];
  approvals: number;
  clock: { current: { t: number; frozen: boolean } };
  onBot: (id: string) => void;
  onTable?: () => void;
  tableCard?: ReactNode;
}

export default function InteriorView({ floor, world, bots, approvals, clock, onBot, onTable, tableCard }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const scene = useRef<InteriorScene | null>(null);
  const cb = useRef({ onBot, onTable });
  cb.current = { onBot, onTable };

  useEffect(() => {
    if (!host.current || !overlay.current) return;
    const s = new InteriorScene(host.current, overlay.current, {
      floor,
      onBotClick: (id) => cb.current.onBot(id),
      onTableClick: () => cb.current.onTable?.(),
      onAnchor: (_id, x, y) => {
        if (card.current) card.current.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      },
    });
    scene.current = s;
    let raf = 0;
    const tick = () => {
      s.setTime(clock.current.t, clock.current.frozen);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      s.dispose();
      scene.current = null;
    };
  }, [floor, clock]);

  useEffect(() => {
    scene.current?.setWorld(world, bots);
  }, [world, bots, floor]);
  useEffect(() => {
    scene.current?.setApprovals(approvals);
  }, [approvals, floor, world]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={host} className="absolute inset-0" />
      <div ref={overlay} className="iso-overlay pointer-events-none absolute inset-0 overflow-hidden">
        {tableCard && (
          <div ref={card} className="absolute left-0 top-0 will-change-transform">
            <div className="w-max -translate-x-1/2 -translate-y-1/2">{tableCard}</div>
          </div>
        )}
      </div>
      <div className="absolute bottom-3 right-3 flex gap-1.5">
        <ToolBtn label="Girar para a esquerda" onClick={() => scene.current?.rotate(1)}>
          <RotateCcw size={15} />
        </ToolBtn>
        <ToolBtn label="Girar para a direita" onClick={() => scene.current?.rotate(-1)}>
          <RotateCw size={15} />
        </ToolBtn>
        <ToolBtn label="Afastar" onClick={() => scene.current?.zoomBy(1 / 1.25)}>
          <Minus size={15} />
        </ToolBtn>
        <ToolBtn label="Aproximar" onClick={() => scene.current?.zoomBy(1.25)}>
          <Plus size={15} />
        </ToolBtn>
        <ToolBtn label="Enquadrar o andar" onClick={() => scene.current?.resetView()}>
          <Scan size={15} />
        </ToolBtn>
      </div>
    </div>
  );
}

function ToolBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button title={label} aria-label={label} onClick={onClick} className="hud-btn h-9 w-9">
      {children}
    </button>
  );
}
