import { memo, useState, type ReactNode } from "react";
import { companies, outfitOf, statusLabel, type Approval, type Bot, type Company, type Status } from "../data/mock";
import { FigurinhaShapes } from "../components/Figurinha";
import { palette, statusColor } from "../lib/colors";
import { BOARD, COFFEE, ELEV, FLOOR_D, MEETING, PENTHOUSE, ZONES, boardSeat, bubblesAt, carFloor, desksOf, doorOpen, poseAt, statusAt, LOBBY, type World } from "./sim";

export const VB_W = 1000;
const BX = 236;
const S = 34;
const BW = 18 * S;
const LEVEL_H = 118;
const SLAB = 12;
const TOP = 104;
export const levelTop = (l: number) => TOP + (PENTHOUSE - l) * LEVEL_H;
export const floorY = (l: number) => levelTop(l) + LEVEL_H - SLAB;
export const VB_H = floorY(0) + SLAB + 64;
const X = (x: number) => BX + x * S;
const depthY = (z: number) => -(FLOOR_D - z) * 1.25;
const depthS = (z: number) => 0.8 + (z / FLOOR_D) * 0.16;
const BOT_K = 1.2;

const levelName = (l: number) => (l === 0 ? "Térreo" : l === PENTHOUSE ? "Cobertura" : `${l}º andar`);

interface Props {
  world: World;
  bots: Bot[];
  approvals: Approval[];
  t: number;
  frozen: boolean;
  compact?: boolean;
  onFloor: (level: number) => void;
  onBot: (bot: Bot) => void;
}

export function BuildingView({ world, bots, approvals, t, frozen, compact = false, onFloor, onBot }: Props) {
  const [hoverLevel, setHoverLevel] = useState<number | null>(null);
  const [hoverBot, setHoverBot] = useState<string | null>(null);
  const cy = frozen ? carFloor(world, 0) : carFloor(world, t);
  const bubbles = frozen ? new Map<string, string>() : new Map(bubblesAt(world, t).map((b) => [b.bot, b.text]));
  const vb = compact ? `${BX - 18} ${levelTop(PENTHOUSE) - 78} ${BW + 36} ${floorY(0) + SLAB + 10 - (levelTop(PENTHOUSE) - 78)}` : `0 0 ${VB_W} ${VB_H}`;

  const placed = bots
    .map((b) => ({ b, pose: poseAt(world, b.id, t, frozen), status: statusAt(world, b, t) }))
    .filter((p): p is { b: Bot; pose: NonNullable<typeof p.pose>; status: Status } => !!p.pose);

  const levels = [5, 4, 3, 2, 1, 0];
  return (
    <svg viewBox={vb} className="block h-full w-full select-none" role="img" aria-label="Prédio Otávio Bot em corte, com os andares das empresas">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0a1020" />
          <stop offset="1" stopColor="#141f36" />
        </linearGradient>
        <linearGradient id="glassShine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="0.35" stopColor="#ffffff" stopOpacity="0.02" />
          <stop offset="0.36" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.03" />
        </linearGradient>
        <linearGradient id="lampCone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3d6" stopOpacity="0.28" />
          <stop offset="1" stopColor="#fff3d6" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="shaft" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0c1424" />
          <stop offset="0.5" stopColor="#16223a" />
          <stop offset="1" stopColor="#0c1424" />
        </linearGradient>
        <radialGradient id="glow">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <clipPath id="shaftClip">
          <rect x={X(ELEV.x0)} y={levelTop(PENTHOUSE)} width={(ELEV.x1 - ELEV.x0) * S} height={floorY(0) - levelTop(PENTHOUSE)} />
        </clipPath>
      </defs>
      <Backdrop />
      {levels.map((l) => (
        <g
          key={l}
          className="cursor-pointer"
          onClick={() => onFloor(l)}
          onMouseEnter={() => setHoverLevel(l)}
          onMouseLeave={() => setHoverLevel((h) => (h === l ? null : h))}
        >
          <LevelBack level={l} bots={bots} hovered={hoverLevel === l} approvals={approvals.length} />
        </g>
      ))}

      <Shaft />
      <g clipPath="url(#shaftClip)">
        <Car y={floorY(0) - (floorY(0) - floorY(PENTHOUSE)) * (cy / PENTHOUSE)} open={Math.max(...levels.map((l) => doorOpen(world, l, frozen ? 0 : t)))}>
          {placed
            .filter((p) => p.pose.mode === "elevador")
            .map((p, i) => (
              <SideBot key={p.b.id} bot={p.b} x={X(ELEV.inside.x) + i * 12} y={0} scale={0.95} status={p.status} walk={0} flip={false} seated={false} />
            ))}
        </Car>
      </g>

      {levels.map((l) => {
        const here = placed.filter((p) => p.pose.mode !== "elevador" && p.pose.floor === l);
        return (
          <g key={l}>
            <LevelFront level={l} bots={bots} items={here} hoverBot={hoverBot} bubbles={bubbles} onBot={onBot} setHoverBot={setHoverBot} t={t} frozen={frozen} />
          </g>
        );
      })}
      {levels.map((l) => (
        <g key={l} className="pointer-events-none">
          <Facade level={l} hovered={hoverLevel === l} />
        </g>
      ))}
      <Roof />
      {levels.map((l) => (
        <g key={l} style={{ display: compact ? "none" : undefined }}>
          <BladeSign level={l} bots={bots} world={world} t={t} hovered={hoverLevel === l} approvals={approvals.length} onClick={() => onFloor(l)} />
        </g>
      ))}
      {placed
        .filter((p) => bubbles.has(p.b.id) && p.pose.mode !== "elevador")
        .map((p) => (
          <Bubble key={p.b.id} x={X(p.pose.x)} y={floorY(p.pose.floor) + depthY(p.pose.z) - (p.pose.mode === "sentado" ? 44 : 50)} text={bubbles.get(p.b.id)!} />
        ))}
      {hoverBot &&
        (() => {
          const p = placed.find((x) => x.b.id === hoverBot);
          if (!p || p.pose.mode === "elevador") return null;
          return <HoverCard x={X(p.pose.x)} y={floorY(p.pose.floor) + 14} bot={p.b} status={p.status} />;
        })()}
    </svg>
  );
}

const Backdrop = memo(function Backdrop() {
  const stars = Array.from({ length: 70 }, (_, i) => ({ x: (i * 137.5) % VB_W, y: (i * 61.7) % 300, r: i % 7 === 0 ? 1.3 : 0.7 }));
  const skyline: [number, number, number][] = [
    [0, 360, 60],
    [56, 300, 48],
    [100, 420, 70],
    [890, 330, 56],
    [940, 260, 60],
    [870, 470, 40],
  ];
  return (
    <g>
      <rect x={-500} y={-500} width={VB_W + 1000} height={VB_H + 1000} fill="url(#sky)" />
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#cbd5e1" opacity={0.5} />
      ))}
      <circle cx={900} cy={70} r={22} fill="#e2e8f0" opacity={0.85} />
      <circle cx={910} cy={64} r={20} fill="#0e1628" />
      {skyline.map(([x, y, w], i) => (
        <g key={i}>
          <rect x={x} y={y} width={w} height={VB_H - y} fill="#111a2c" />
          {Array.from({ length: Math.floor((VB_H - y) / 22) }, (_, r) =>
            Array.from({ length: Math.floor(w / 14) }, (_, c) =>
              (r * 7 + c * 3 + i) % 5 === 0 ? <rect key={`${r}-${c}`} x={x + 5 + c * 14} y={y + 10 + r * 22} width={6} height={8} fill="#3b4a6b" /> : null,
            ),
          )}
        </g>
      ))}
      <rect x={-500} y={floorY(0) + SLAB} width={VB_W + 1000} height={80} fill="#0d1320" />
      <rect x={-500} y={floorY(0) + SLAB} width={VB_W + 1000} height={8} fill="#263149" />
      {[40, 150, 880, 960].map((x) => (
        <g key={x}>
          <rect x={x} y={floorY(0) - 70} width={4} height={82} fill="#3b465e" />
          <rect x={x - 8} y={floorY(0) - 74} width={20} height={5} rx={2} fill="#3b465e" />
          <ellipse cx={x + 2} cy={floorY(0) - 66} rx={26} ry={10} fill="#fde68a" opacity={0.18} filter="url(#soft)" />
          <circle cx={x + 2} cy={floorY(0) - 70} r={3} fill="#fde68a" />
        </g>
      ))}
      {[90, 196, 900].map((x) => (
        <g key={x}>
          <rect x={x - 2} y={floorY(0) - 22} width={4} height={34} fill="#5b3b25" />
          <circle cx={x} cy={floorY(0) - 34} r={18} fill="#1f5d3a" />
          <circle cx={x + 8} cy={floorY(0) - 40} r={12} fill="#2c7a4b" />
        </g>
      ))}
    </g>
  );
});

function levelColors(level: number) {
  const co = companies.find((c) => c.floor === level);
  if (co) {
    const p = palette[co.color];
    return { accent: p.accent, face: p.face, co };
  }
  if (level === PENTHOUSE) return { accent: "#f59e0b", face: "#fde68a", co: undefined };
  return { accent: "#3b82f6", face: "#93c5fd", co: undefined };
}

const LevelBack = memo(function LevelBack({ level, bots, hovered, approvals }: { level: number; bots: Bot[]; hovered: boolean; approvals: number }) {
  const top = levelTop(level);
  const fy = floorY(level);
  const { accent, face, co } = levelColors(level);
  const wallTop = level === PENTHOUSE ? "#3b2a1c" : level === 0 ? "#2d3447" : "#2a3246";
  const wallBottom = level === PENTHOUSE ? "#5a3f28" : level === 0 ? "#3f475c" : "#3b4560";
  const id = `wall${level}`;
  return (
    <g>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={wallTop} />
          <stop offset="1" stopColor={wallBottom} />
        </linearGradient>
      </defs>
      <rect x={BX} y={top} width={BW} height={LEVEL_H - SLAB} fill={`url(#${id})`} />
      <rect x={BX} y={fy - 40} width={BW} height={3} fill={face} opacity={0.35} />
      {[3, 6.5, 10, 13.5, 16.5].map((x) => (
        <g key={x}>
          <polygon points={`${X(x) - 10},${top + 4} ${X(x) + 10},${top + 4} ${X(x) + 34},${fy} ${X(x) - 34},${fy}`} fill="url(#lampCone)" />
          <rect x={X(x) - 12} y={top + 1} width={24} height={4} rx={2} fill="#fff7e0" />
        </g>
      ))}
      <rect x={BX} y={fy - 6} width={BW} height={6} fill={level === PENTHOUSE ? "#7a5236" : "#b08862"} />
      {co && <CompanyBackItems co={co} bots={bots} />}
      {level === PENTHOUSE && <PenthouseBack approvals={approvals} />}
      {level === 0 && <LobbyBack />}
      {hovered && <rect x={BX} y={top} width={BW} height={LEVEL_H - SLAB} fill={accent} opacity={0.08} />}
    </g>
  );
});

function CompanyBackItems({ co, bots }: { co: Company; bots: Bot[] }) {
  const fy = floorY(co.floor);
  const p = palette[co.color];
  const zones = desksOf(co.id, bots);
  return (
    <g>
      <rect x={X(0.15)} y={fy - 58} width={0.8 * S} height={52} fill="#5b3f2b" />
      {[0, 1, 2].map((r) => (
        <g key={r}>
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={X(0.2) + i * 6} y={fy - 54 + r * 17} width={5} height={13} fill={["#ef4444", "#3b82f6", "#f59e0b", p.accent][(i + r) % 4]} />
          ))}
        </g>
      ))}
      <rect x={X(COFFEE.x - 0.95)} y={fy - 32} width={1.9 * S} height={26} fill="#e2e8f0" />
      <rect x={X(COFFEE.x - 0.97)} y={fy - 34} width={1.94 * S} height={3} fill="#6b4a33" />
      <rect x={X(COFFEE.x - 0.6)} y={fy - 48} width={12} height={14} rx={2} fill="#111827" />
      <circle cx={X(COFFEE.x - 0.6) + 6} cy={fy - 44} r={1.6} fill="#ef4444" />
      <rect x={X(COFFEE.x + 1.05)} y={fy - 62} width={0.6 * S} height={56} rx={2} fill="#cbd5e1" />
      <rect x={X(10.5)} y={fy - 90} width={1.6 * S} height={30} rx={2} fill="#f8fafc" stroke="#94a3b8" strokeWidth={2} />
      <path d={`M${X(10.5) + 6} ${fy - 82} h24 M${X(10.5) + 6} ${fy - 75} h34 M${X(10.5) + 6} ${fy - 68} h18`} stroke="#3b82f6" strokeWidth={2} />
      <rect x={X(10.5) + 40} y={fy - 86} width={9} height={9} fill={p.accent} />
      <rect x={X(MEETING.x0)} y={levelTop(co.floor) + 10} width={(MEETING.x1 - MEETING.x0) * S} height={fy - levelTop(co.floor) - 16} fill="#1f2638" opacity={0.55} />
      <rect x={X(MEETING.x0 + 1.4)} y={fy - 80} width={2.2 * S} height={26} rx={2} fill="#0b1222" stroke="#334155" />
      <rect x={X(MEETING.x0 + 1.4) + 4} y={fy - 76} width={2.2 * S - 8} height={18} fill="#1d4ed8" opacity={0.55} />
      <text x={X(MEETING.x1) - 8} y={levelTop(co.floor) + 36} textAnchor="end" fontSize={7.5} fill="#cbd5e1" opacity={0.75}>
        sala de reunião
      </text>
      <ellipse cx={X(MEETING.table.x)} cy={fy + depthY(MEETING.table.z) - 24} rx={1.3 * S} ry={6} fill="#6b4a33" />
      <rect x={X(MEETING.table.x) - 4} y={fy + depthY(MEETING.table.z) - 22} width={8} height={22 - depthY(MEETING.table.z)} fill="#3b4252" />
      {[0.55, 8.05, 12.35, 17.4].map((x) => (
        <Plant key={x} x={X(x)} y={fy} />
      ))}
      {zones.map((z, i) => (
        <text key={z.dept.id} x={X(ZONES[i]!.cx)} y={levelTop(co.floor) + 22} textAnchor="middle" fontSize={8.5} fontWeight={600} fill={p.face} opacity={0.9} letterSpacing={0.6}>
          {z.dept.name.toUpperCase()}
        </text>
      ))}
    </g>
  );
}

function PenthouseBack({ approvals }: { approvals: number }) {
  const fy = floorY(PENTHOUSE);
  const top = levelTop(PENTHOUSE);
  return (
    <g>
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={X(4 + i * 1.15)} y={top + 6} width={1} height={fy - top - 12} fill="#000" opacity={0.18} />
      ))}
      <rect x={X(4.2)} y={fy - 88} width={3.6 * S} height={24} rx={5} fill="#0b1222" stroke="#f59e0b" strokeWidth={1.5} />
      <text x={X(4.2) + 1.8 * S} y={fy - 72} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fde68a" fontFamily="Space Grotesk, Inter, sans-serif" letterSpacing={1}>
        PRESIDÊNCIA
      </text>
      <rect x={X(14.2)} y={fy - 88} width={2.6 * S} height={40} rx={4} fill="#120e04" stroke="#f59e0b" strokeWidth={1.5} />
      <text x={X(14.2) + 8} y={fy - 75} fontSize={7.5} fontWeight={700} fill="#fde68a">
        APROVAÇÕES
      </text>
      <text x={X(14.2) + 8} y={fy - 56} fontSize={17} fontWeight={700} fill={approvals ? "#f59e0b" : "#22c55e"} fontFamily="Space Grotesk, Inter, sans-serif">
        {approvals}
      </text>
      <text x={X(14.2) + 30} y={fy - 57} fontSize={8} fill="#e5e7eb">
        {approvals === 1 ? "pendente" : approvals === 0 ? "em dia" : "pendentes"}
      </text>
      {[0.6, 17.4].map((x) => (
        <Plant key={x} x={X(x)} y={fy} />
      ))}
    </g>
  );
}

function LobbyBack() {
  const fy = floorY(0);
  const top = levelTop(0);
  return (
    <g>
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x={X(3.4 + i * 1.6)} y={top + 6} width={1.4 * S} height={fy - top - 14} fill="#ffffff" opacity={0.025} />
      ))}
      <rect x={X(4.6)} y={fy - 84} width={2.8 * S} height={30} rx={4} fill="#0b1222" stroke="#2b3549" />
      <circle cx={X(4.6) + 10} cy={fy - 75} r={2.5} fill="#22c55e" />
      <text x={X(4.6) + 17} y={fy - 72} fontSize={8} fill="#e5e7eb">
        WhatsApp · 7
      </text>
      <circle cx={X(4.6) + 10} cy={fy - 63} r={2.5} fill="#22c55e" />
      <text x={X(4.6) + 17} y={fy - 60} fontSize={8} fill="#e5e7eb">
        Voz · ouvindo
      </text>
      <rect x={X(14.6)} y={fy - 78} width={3 * S} height={72} fill="#9cc8ff" opacity={0.12} stroke="#64748b" strokeWidth={2} />
      <line x1={X(16.1)} y1={fy - 78} x2={X(16.1)} y2={fy - 6} stroke="#64748b" strokeWidth={2} />
      <rect x={X(14.6)} y={fy - 92} width={3 * S} height={12} rx={2} fill="#0b1222" />
      <text x={X(16.1)} y={fy - 83} textAnchor="middle" fontSize={7.5} fill="#93c5fd" fontWeight={700} letterSpacing={1}>
        ENTRADA
      </text>
      <Plant x={X(13.8)} y={fy} big />
      <Plant x={X(3.6)} y={fy} />
    </g>
  );
}

function Plant({ x, y, big = false }: { x: number; y: number; big?: boolean }) {
  const s = big ? 1.25 : 1;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-7 0 L-5.5 -12 L5.5 -12 L7 0 Z" fill="#c0693b" />
      <circle cx={0} cy={-20} r={8} fill="#2f7d4a" />
      <circle cx={-5} cy={-26} r={6} fill="#3f9b5a" />
      <circle cx={5} cy={-27} r={5.5} fill="#57b56d" />
    </g>
  );
}

const Facade = memo(function Facade({ level, hovered }: { level: number; hovered: boolean }) {
  const top = levelTop(level);
  const fy = floorY(level);
  const { accent } = levelColors(level);
  const mullions = level === 0 ? [] : [3.2, 6.2, 9.2, 12.2, 15.2];
  return (
    <g>
      <rect x={BX - 14} y={fy} width={BW + 28} height={SLAB} fill="#1c2436" />
      <rect x={BX - 14} y={fy} width={BW + 28} height={2.5} fill={accent} opacity={0.9} />
      <rect x={BX - 14} y={top} width={14} height={LEVEL_H - SLAB} fill="#232c40" />
      <rect x={BX + BW} y={top} width={14} height={LEVEL_H - SLAB} fill="#232c40" />
      <rect x={BX} y={top} width={BW} height={LEVEL_H - SLAB} fill="url(#glassShine)" />
      {mullions.map((m) => (
        <rect key={m} x={X(m) - 1} y={top} width={2} height={LEVEL_H - SLAB} fill="#3a465e" opacity={0.45} />
      ))}
      <rect x={BX} y={top} width={BW} height={3} fill="#3a465e" />
      {hovered && <rect x={BX - 14} y={top - 1} width={BW + 28} height={LEVEL_H + 1} fill="none" stroke={accent} strokeWidth={2.5} rx={3} />}
      {hovered && level !== 0 && (
        <g>
          <rect x={BX + BW - 122} y={top + 8} width={112} height={22} rx={11} fill={accent} />
          <text x={BX + BW - 66} y={top + 23} textAnchor="middle" fontSize={11} fontWeight={700} fill="#0b0f17">
            Entrar no andar
          </text>
        </g>
      )}
    </g>
  );
});

function Roof() {
  const top = levelTop(PENTHOUSE);
  return (
    <g>
      <rect x={BX - 14} y={top - 12} width={BW + 28} height={12} fill="#1c2436" />
      <rect x={BX - 14} y={top - 12} width={BW + 28} height={2.5} fill="#f59e0b" opacity={0.9} />
      <rect x={BX + 20} y={top - 30} width={40} height={18} fill="#283248" />
      <rect x={BX + BW - 90} y={top - 40} width={50} height={28} rx={4} fill="#283248" />
      <line x1={BX + BW - 30} y1={top - 12} x2={BX + BW - 30} y2={top - 78} stroke="#64748b" strokeWidth={2.5} />
      <circle cx={BX + BW - 30} cy={top - 80} r={3.5} fill="#ef4444" className="anim-blink" />
      <g transform={`translate(${BX + BW / 2} ${top - 46})`}>
        <rect x={-132} y={-26} width={264} height={44} rx={10} fill="#0b1222" stroke="#3b82f6" strokeWidth={2} />
        <ellipse cx={0} cy={-4} rx={150} ry={28} fill="#3b82f6" opacity={0.16} filter="url(#soft)" />
        <text x={0} y={7} textAnchor="middle" fontSize={27} fontWeight={700} fill="#dbeafe" fontFamily="Space Grotesk, Inter, sans-serif" letterSpacing={3}>
          OTÁVIO BOT
        </text>
        <rect x={-110} y={18} width={4} height={14} fill="#334155" />
        <rect x={106} y={18} width={4} height={14} fill="#334155" />
      </g>
    </g>
  );
}

function Shaft() {
  const x = X(ELEV.x0);
  const w = (ELEV.x1 - ELEV.x0) * S;
  const y0 = levelTop(PENTHOUSE);
  const y1 = floorY(0);
  return (
    <g className="pointer-events-none">
      <rect x={x} y={y0} width={w} height={y1 - y0} fill="url(#shaft)" />
      <line x1={x + w / 2 - 6} y1={y0} x2={x + w / 2 - 6} y2={y1} stroke="#2b3549" strokeWidth={1} />
      <line x1={x + w / 2 + 6} y1={y0} x2={x + w / 2 + 6} y2={y1} stroke="#2b3549" strokeWidth={1} />
      {[0, 1, 2, 3, 4, 5].map((l) => (
        <g key={l}>
          <rect x={x - 3} y={floorY(l) - 86} width={w + 6} height={3} fill="#64748b" />
          <rect x={x + w / 2 - 9} y={floorY(l) - 96} width={18} height={8} rx={2} fill="#0b1222" />
          <text x={x + w / 2} y={floorY(l) - 89.5} textAnchor="middle" fontSize={6} fill="#93c5fd" fontWeight={700}>
            {l === 0 ? "T" : l === PENTHOUSE ? "C" : `${l}º`}
          </text>
        </g>
      ))}
      <rect x={x - 3} y={y0} width={3} height={y1 - y0} fill="#475569" />
      <rect x={x + w} y={y0} width={3} height={y1 - y0} fill="#475569" />
    </g>
  );
}

function Car({ y, open, children }: { y: number; open: number; children: ReactNode }) {
  const x = X(ELEV.x0) + 4;
  const w = (ELEV.x1 - ELEV.x0) * S - 8;
  const h = 80;
  const half = w / 2;
  return (
    <g className="pointer-events-none">
      <line x1={x + w / 2} y1={levelTop(PENTHOUSE)} x2={x + w / 2} y2={y - h} stroke="#94a3b8" strokeWidth={1.2} />
      <rect x={x} y={y - h} width={w} height={h} rx={3} fill="#fdf6e3" opacity={0.95} />
      <rect x={x} y={y - h} width={w} height={6} rx={2} fill="#fff7d6" />
      <rect x={x + 4} y={y - h + 6} width={w - 8} height={h - 10} fill="#e6ddc6" />
      <g transform={`translate(0 ${y - 4})`}>{children}</g>
      <rect x={x} y={y - h + 6} width={half * (1 - open * 0.9)} height={h - 8} fill="#9fb5d1" opacity={0.28} stroke="#64748b" strokeWidth={1} />
      <rect x={x + w - half * (1 - open * 0.9)} y={y - h + 6} width={half * (1 - open * 0.9)} height={h - 8} fill="#9fb5d1" opacity={0.28} stroke="#64748b" strokeWidth={1} />
      <rect x={x - 1} y={y - 3} width={w + 2} height={4} fill="#475569" />
      <rect x={x - 1} y={y - h - 2} width={w + 2} height={4} fill="#475569" />
    </g>
  );
}

type Placed = { b: Bot; pose: NonNullable<ReturnType<typeof poseAt>>; status: Status };

function LevelFront({
  level,
  bots,
  items,
  hoverBot,
  bubbles,
  onBot,
  setHoverBot,
  t,
  frozen,
}: {
  level: number;
  bots: Bot[];
  items: Placed[];
  hoverBot: string | null;
  bubbles: Map<string, string>;
  onBot: (b: Bot) => void;
  setHoverBot: (id: string | null) => void;
  t: number;
  frozen: boolean;
}) {
  const fy = floorY(level);
  const co = companies.find((c) => c.floor === level);
  const drawables: { z: number; node: ReactNode }[] = [];
  const statusById = new Map(items.map((i) => [i.b.id, i]));

  if (co) {
    for (const g of desksOf(co.id, bots)) {
      for (const d of g.desks) {
        const occ = d.botId ? statusById.get(d.botId) : undefined;
        const seatedHere = occ && occ.pose.mode === "sentado";
        const st = seatedHere ? occ.status : undefined;
        drawables.push({ z: d.z, node: <Desk key={`d${d.x}`} x={X(d.x)} y={fy + depthY(d.z)} s={depthS(d.z)} status={st} t={t} frozen={frozen} /> });
        drawables.push({ z: g.zone.seatZ - 0.2, node: <Chair key={`c${d.x}`} x={X(d.x)} y={fy + depthY(g.zone.seatZ)} s={depthS(g.zone.seatZ) * BOT_K} /> });
      }
    }
    drawables.push({
      z: MEETING.z1,
      node: (
        <g key="glass">
          <rect x={X(MEETING.x0)} y={levelTop(level) + 10} width={(MEETING.x1 - MEETING.x0) * S} height={fy + depthY(MEETING.z1) - levelTop(level) - 10} fill="#bfe3ff" opacity={0.08} stroke="#94a3b8" strokeOpacity={0.5} />
        </g>
      ),
    });
  }
  if (level === PENTHOUSE) {
    const T = BOARD.table;
    const ty = fy + depthY(T.z);
    drawables.push({
      z: T.z,
      node: (
        <g key="table">
          <rect x={X(T.x) - 10} y={ty - 26} width={20} height={26} fill="#2c1d14" />
          <ellipse cx={X(T.x)} cy={ty - 27} rx={BOARD.radius * S} ry={10} fill="#4a3121" />
          <ellipse cx={X(T.x)} cy={ty - 29} rx={BOARD.radius * S - 6} ry={7} fill="#5a3c28" />
          <ellipse cx={X(T.x)} cy={ty - 31} rx={30} ry={8} fill="#f59e0b" opacity={0.35} filter="url(#soft)" />
          <rect x={X(T.x) - 12} y={ty - 34} width={24} height={5} rx={1} fill="#f59e0b" />
        </g>
      ),
    });
    for (const id of ["tavinho", "rafa", "vera", "dante", "fabio", "voce"]) {
      const s = boardSeat(id)!;
      drawables.push({ z: s.z - 0.25, node: <ExecChair key={`ec${id}`} x={X(s.x)} y={fy + depthY(s.z)} s={depthS(s.z)} you={id === "voce"} /> });
    }
  }
  if (level === 0) {
    drawables.push({
      z: LOBBY.counter.z,
      node: (
        <g key="counter">
          <rect x={X(LOBBY.counter.x - 1.6)} y={fy + depthY(LOBBY.counter.z) - 30} width={3.2 * S} height={30} rx={3} fill="#e2e8f0" />
          <rect x={X(LOBBY.counter.x - 1.4)} y={fy + depthY(LOBBY.counter.z) - 24} width={2.8 * S} height={12} rx={2} fill="#0b1222" />
          <text x={X(LOBBY.counter.x)} y={fy + depthY(LOBBY.counter.z) - 15} textAnchor="middle" fontSize={8} fontWeight={700} fill="#93c5fd" letterSpacing={1.5}>
            OTÁVIO BOT
          </text>
          <text x={X(LOBBY.counter.x)} y={fy + depthY(LOBBY.counter.z) - 36} textAnchor="middle" fontSize={8} fill="#cbd5e1">
            recepção
          </text>
        </g>
      ),
    });
    drawables.push({
      z: LOBBY.sofa.z - 0.3,
      node: (
        <g key="sofa">
          <rect x={X(LOBBY.sofa.x - 1.2)} y={fy + depthY(LOBBY.sofa.z) - 26} width={2.4 * S} height={14} rx={4} fill="#334155" />
          <rect x={X(LOBBY.sofa.x - 1.25)} y={fy + depthY(LOBBY.sofa.z) - 14} width={2.5 * S} height={10} rx={3} fill="#3f4d66" />
        </g>
      ),
    });
  }
  for (const it of items) {
    const { pose, b, status } = it;
    const seated = pose.mode === "sentado";
    const walking = pose.mode === "andando";
    const flip = walking ? Math.sin(pose.facing) < 0 : pose.mode === "parado" ? Math.sin(pose.facing) < 0 : false;
    drawables.push({
      z: pose.z,
      node: (
        <g key={b.id} onClick={(e) => (e.stopPropagation(), onBot(b))} onMouseEnter={() => setHoverBot(b.id)} onMouseLeave={() => setHoverBot(null)} className="cursor-pointer">
          <SideBot
            bot={b}
            x={X(pose.x)}
            y={fy + depthY(pose.z) - (seated ? 0 : 0)}
            scale={depthS(pose.z) * BOT_K}
            status={status}
            walk={walking ? pose.stride : 0}
            flip={flip}
            seated={seated}
            talking={bubbles.has(b.id)}
            hovered={hoverBot === b.id}
            t={frozen ? 0 : t}
          />
        </g>
      ),
    });
  }
  drawables.sort((a, b) => a.z - b.z);
  return <g>{drawables.map((d) => d.node)}</g>;
}

function Desk({ x, y, s, status, t, frozen }: { x: number; y: number; s: number; status?: Status; t: number; frozen: boolean }) {
  const w = 44 * s;
  const h = 0.74 * S * s;
  const x0 = x - 12 * s;
  const mx = x + 17 * s;
  const screen = status === "trabalhando" ? "#7fb4ff" : status === "esperando" ? "#fbbf24" : status === "bloqueado" ? "#f87171" : status === "ocioso" ? "#475569" : "#3b5998";
  const lit = !!status && status !== "ocioso";
  const flick = frozen || status !== "trabalhando" ? 1 : 0.8 + 0.2 * Math.sin(t * 9 + x);
  return (
    <g>
      {lit && <ellipse cx={mx - 6 * s} cy={y - h - 10 * s} rx={16 * s} ry={11 * s} fill={screen} opacity={0.3 * flick} filter="url(#soft)" />}
      <rect x={mx - 2 * s} y={y - h - 3 * s} width={4 * s} height={3 * s} fill="#3b4252" />
      <rect x={mx - 10 * s} y={y - h - 19 * s} width={18 * s} height={16 * s} rx={2} fill="#1c2130" />
      <rect x={mx - 8.5 * s} y={y - h - 17.5 * s} width={15 * s} height={13 * s} rx={1} fill={screen} opacity={(lit ? 0.85 : 0.35) * flick} />
      {lit && [0, 1, 2].map((i) => <rect key={i} x={mx - 7 * s} y={y - h - 15.5 * s + i * 4 * s} width={(6 + ((i * 5 + Math.round(x)) % 7)) * s} height={1.4 * s} fill="#0b1020" opacity={0.55} />)}
      <rect x={x0} y={y - h} width={w} height={3.2 * s} rx={1} fill="#c49a6c" />
      <rect x={x0 + 2} y={y - h + 3} width={3 * s} height={h - 3} fill="#3b4252" />
      <rect x={x0 + w - 2 - 3 * s} y={y - h + 3} width={3 * s} height={h - 3} fill="#3b4252" />
      <rect x={x0 + 6 * s} y={y - h - 1.6 * s} width={12 * s} height={1.6 * s} rx={0.6} fill="#2b3142" />
    </g>
  );
}

function Chair({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g>
      <rect x={x - 8 * s} y={y - 34 * s} width={16 * s} height={18 * s} rx={3} fill="#2f3546" />
      <rect x={x - 9 * s} y={y - 17 * s} width={18 * s} height={3.5 * s} rx={1.5} fill="#2f3546" />
      <rect x={x - 1} y={y - 14 * s} width={2} height={11 * s} fill="#3b4252" />
      <rect x={x - 7 * s} y={y - 3} width={14 * s} height={2} fill="#3b4252" />
    </g>
  );
}

function ExecChair({ x, y, s, you }: { x: number; y: number; s: number; you: boolean }) {
  const c = you ? "#1e3a8a" : "#1f1a17";
  return (
    <g>
      <rect x={x - 10 * s} y={y - 48 * s} width={20 * s} height={32 * s} rx={5} fill={c} />
      <rect x={x - 11 * s} y={y - 18 * s} width={22 * s} height={4.5 * s} rx={2} fill={c} />
      <rect x={x - 1.2} y={y - 14 * s} width={2.4} height={11 * s} fill="#3b4252" />
      <rect x={x - 8 * s} y={y - 3} width={16 * s} height={2} fill="#3b4252" />
      {you && (
        <g>
          <circle cx={x} cy={y - 56 * s} r={10} fill="#3b82f6" opacity={0.3} filter="url(#soft)" />
          <circle cx={x} cy={y - 56 * s} r={4} fill="#3b82f6" />
          <text x={x} y={y - 64 * s} textAnchor="middle" fontSize={8} fontWeight={700} fill="#93c5fd">
            você
          </text>
        </g>
      )}
    </g>
  );
}

export function SideBot({
  bot,
  x,
  y,
  scale,
  status,
  walk,
  flip,
  seated,
  talking = false,
  hovered = false,
  t = 0,
}: {
  bot: Bot;
  x: number;
  y: number;
  scale: number;
  status: Status;
  walk: number;
  flip: boolean;
  seated: boolean;
  talking?: boolean;
  hovered?: boolean;
  t?: number;
}) {
  const o = outfitOf(bot);
  const sw = palette[bot.figurinha.color];
  const hip = seated ? -17 : -14;
  const bob = walk ? Math.abs(Math.cos(walk)) * 1.6 : 0;
  const legSwing = walk ? Math.sin(walk) * 26 : 0;
  const lean = seated && status === "ocioso" ? -9 : 0;
  const typing = seated && status === "trabalhando";
  const pants = o.pants ?? "#2a3142";
  const dark = shade(o.color, 0.72);
  const ph = bot.name.charCodeAt(0);
  const armA = typing ? -70 + Math.sin(t * 16 + ph) * 8 : talking ? -60 + Math.sin(t * 6) * 15 : walk ? -legSwing * 0.8 : 6;
  const armB = typing ? -70 + Math.sin(t * 16 + ph + 2) * 8 : walk ? legSwing * 0.8 : -6;
  const shake = status === "bloqueado" && t ? Math.sin(t * 20) * 0.8 : 0;
  return (
    <g transform={`translate(${x + shake} ${y - bob}) scale(${scale})`}>
      <ellipse cx={0} cy={0} rx={10} ry={2.6} fill="#000" opacity={0.3} />
      {hovered && <ellipse cx={0} cy={0} rx={14} ry={4} fill="none" stroke="#fff" strokeWidth={1.5} />}
      <g transform={`scale(${flip ? -1 : 1} 1)`}>
        {seated ? (
          <g>
            <rect x={-6} y={hip - 1} width={13} height={5} rx={2} fill={pants} />
          </g>
        ) : (
          <g>
            <rect x={-5.5} y={hip} width={5} height={14} rx={2} fill={pants} transform={`rotate(${legSwing} -3 ${hip})`} />
            <rect x={0.5} y={hip} width={5} height={14} rx={2} fill={pants} transform={`rotate(${-legSwing} 3 ${hip})`} />
            <rect x={-6.5 + Math.sin((legSwing * Math.PI) / 180) * -14} y={-2.5} width={6} height={2.5} rx={1} fill="#111827" />
            <rect x={0.5 + Math.sin((legSwing * Math.PI) / 180) * 14} y={-2.5} width={6} height={2.5} rx={1} fill="#111827" />
          </g>
        )}
        <g transform={`rotate(${lean} 0 ${hip})`}>
          <rect x={-2.5} y={hip - 16} width={5} height={13} rx={2.5} fill={dark} transform={`rotate(${armB} 0 ${hip - 15})`} />
          <rect x={-8} y={hip - 19} width={16} height={20} rx={5} fill={o.color} />
          {o.top === "moletom" && <path d={`M-6 ${hip - 19} Q0 ${hip - 25} 6 ${hip - 19}`} fill={dark} />}
          {o.top === "moletom" && <rect x={-5} y={hip - 6} width={10} height={4} rx={1.5} fill={dark} />}
          {o.top === "blazer" && <path d={`M-3.5 ${hip - 19} L0 ${hip - 11} L3.5 ${hip - 19} Z`} fill="#f8fafc" />}
          {(o.top === "camisa" || o.top === "polo") && <path d={`M-4 ${hip - 19} L0 ${hip - 15.5} L4 ${hip - 19} Z`} fill={o.top === "camisa" ? "#ffffff" : dark} />}
          {o.tie && <path d={`M-1.3 ${hip - 16} L1.3 ${hip - 16} L1.8 ${hip - 8} L0 ${hip - 6} L-1.8 ${hip - 8} Z`} fill={sw.accent} />}
          {o.top === "camiseta" && <rect x={-8} y={hip - 7} width={16} height={2.5} fill={sw.accent} />}
          <rect x={2.5} y={hip - 13} width={4} height={5} rx={0.8} fill={sw.accent} stroke="#fff" strokeWidth={0.5} />
          <rect x={-2.5} y={hip - 16} width={5} height={13} rx={2.5} fill={o.color} stroke={dark} strokeWidth={0.6} transform={`rotate(${armA} 0 ${hip - 15})`} />
          <g transform={`translate(-13 ${hip - 19 - 19.5}) scale(0.54)`}>
            <FigurinhaShapes f={bot.figurinha} />
          </g>
        </g>
      </g>
      <g transform={`translate(0 ${hip - 46})`}>
        {status === "esperando" && <circle r={6} fill={statusColor.esperando} opacity={0.35} className="anim-orb" />}
        <circle r={3.4} fill={statusColor[status]} stroke="#0b0f17" strokeWidth={1.2} />
        {status === "esperando" && (
          <g transform="translate(7 -7)">
            <rect x={-4} y={-5} width={8} height={10} rx={2.5} fill="#f59e0b" />
            <text y={3} textAnchor="middle" fontSize={8} fontWeight={800} fill="#111827">
              !
            </text>
          </g>
        )}
        {status === "bloqueado" && (
          <g transform="translate(9 -7)">
            <rect x={-9} y={-5} width={18} height={10} rx={2.5} fill="#ef4444" />
            <text y={3} textAnchor="middle" fontSize={7} fontWeight={800} fill="#fff">
              2FA
            </text>
          </g>
        )}
        {status === "ocioso" && (
          <text x={6} y={-4} fontSize={8} fontWeight={700} fill="#94a3b8" fontStyle="italic">
            zz
          </text>
        )}
      </g>
      {hovered && (
        <text y={12} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff" stroke="#0b0f17" strokeWidth={3} paintOrder="stroke">
          {bot.name}
        </text>
      )}
    </g>
  );
}

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}

function Bubble({ x, y, text }: { x: number; y: number; text: string }) {
  const w = Math.min(240, text.length * 5.3 + 18);
  const lines = w >= 240 ? wrap(text, 42) : [text];
  const h = 8 + lines.length * 12;
  const bx = Math.max(BX - 10, Math.min(BX + BW - w + 10, x - w / 2));
  return (
    <g className="pointer-events-none">
      <rect x={bx} y={y - h} width={w} height={h} rx={7} fill="#ffffff" stroke="#0b0f17" strokeOpacity={0.2} />
      <path d={`M${x - 5} ${y - 0.5} L${x} ${y + 6} L${x + 5} ${y - 0.5} Z`} fill="#ffffff" />
      {lines.map((l, i) => (
        <text key={i} x={bx + w / 2} y={y - h + 15 + i * 12} textAnchor="middle" fontSize={10} fontWeight={500} fill="#0f172a">
          {l}
        </text>
      ))}
    </g>
  );
}

function wrap(text: string, n: number) {
  const words = text.split(" ");
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > n) {
      out.push(cur.trim());
      cur = w;
    } else cur += " " + w;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function HoverCard({ x, y, bot, status }: { x: number; y: number; bot: Bot; status: Status }) {
  const w = 200;
  const bx = Math.max(BX, Math.min(BX + BW - w, x - w / 2));
  return (
    <g className="pointer-events-none">
      <rect x={bx} y={y} width={w} height={50} rx={8} fill="#0e131d" stroke="#2b3549" />
      <text x={bx + 10} y={y + 16} fontSize={11} fontWeight={700} fill="#fff">
        {bot.name} · {bot.role}
      </text>
      <circle cx={bx + 13} cy={y + 28} r={3} fill={statusColor[status]} />
      <text x={bx + 20} y={y + 31} fontSize={9.5} fill="#c7cdd8">
        {statusLabel[status]}
      </text>
      <text x={bx + 10} y={y + 44} fontSize={9} fill="#8b95a7">
        {bot.activity.length > 38 ? bot.activity.slice(0, 37) + "…" : bot.activity}
      </text>
    </g>
  );
}

function BladeSign({ level, bots, world, t, hovered, approvals, onClick }: { level: number; bots: Bot[]; world: World; t: number; hovered: boolean; approvals: number; onClick: () => void }) {
  const top = levelTop(level);
  const { accent, co } = levelColors(level);
  const x = 22;
  const w = BX - 14 - x - 10;
  const y = top + 14;
  const here = bots.filter((b) => {
    const h = world.homes.get(b.id);
    return h && h.floor === level;
  });
  const counts: Record<Status, number> = { trabalhando: 0, esperando: 0, bloqueado: 0, ocioso: 0 };
  for (const b of here) counts[statusAt(world, b, t)]++;
  const title = co ? co.name : level === PENTHOUSE ? "Presidência" : "Recepção";
  const sub = co ? co.tagline : level === PENTHOUSE ? "Sala do conselho" : "Entrada e visitantes";
  return (
    <g onClick={onClick} className="cursor-pointer">
      <line x1={x + w} y1={y + 30} x2={BX - 14} y2={y + 30} stroke="#3a465e" strokeWidth={3} />
      <rect x={x} y={y} width={w} height={78} rx={10} fill="#0e1424" stroke={hovered ? accent : "#26304a"} strokeWidth={hovered ? 2 : 1.2} />
      <rect x={x + 9} y={y + 12} width={4} height={36} rx={2} fill={accent} />
      <text x={x + 21} y={y + 19} fontSize={9} fontWeight={600} fill="#8b95a7" letterSpacing={1}>
        {levelName(level).toUpperCase()}
      </text>
      <text x={x + 21} y={y + 37} fontSize={15} fontWeight={700} fill="#fff" fontFamily="Space Grotesk, Inter, sans-serif">
        {title}
      </text>
      <text x={x + 21} y={y + 51} fontSize={9.5} fill="#c7cdd8">
        {sub}
      </text>
      <g transform={`translate(${x + 21} ${y + 66})`}>
        {level === PENTHOUSE ? (
          <g>
            <circle cx={3} cy={-3} r={3} fill={approvals ? "#f59e0b" : "#22c55e"} />
            <text x={10} y={0} fontSize={9} fill={approvals ? "#fbbf24" : "#86efac"}>
              {approvals ? `${approvals} ${approvals === 1 ? "decisão" : "decisões"} na mesa` : "nada pendente"}
            </text>
          </g>
        ) : (
          (Object.keys(counts) as Status[])
            .filter((s) => counts[s] > 0)
            .map((s, i) => (
              <g key={s} transform={`translate(${i * 30} 0)`}>
                <circle cx={3} cy={-3} r={3} fill={statusColor[s]} />
                <text x={9} y={0} fontSize={9.5} fill="#c7cdd8">
                  {counts[s]}
                </text>
              </g>
            ))
        )}
      </g>
    </g>
  );
}
