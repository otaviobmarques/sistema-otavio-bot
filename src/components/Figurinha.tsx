import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { figurinhaPalette, mouthForState, motionForState, type FigurinhaPalette } from "@/lib/figurinha";
import type { MausColor, MausState } from "@/lib/mascot";
import type { FigurinhaHead, FigurinhaLook, FigurinhaMouth } from "../../shared/figurinha";

const INK = "#111827";

interface HeadBox {
  top: number;
  eyeY: number;
  left: number;
  right: number;
}

const HEAD_BOX: Record<FigurinhaHead, HeadBox> = {
  rounded: { top: 15, eyeY: 24.5, left: 12, right: 36 },
  square: { top: 15, eyeY: 24, left: 12, right: 36 },
  round: { top: 13, eyeY: 24.5, left: 12, right: 36 },
  tall: { top: 11, eyeY: 23.5, left: 14, right: 34 },
  wide: { top: 17, eyeY: 25, left: 9, right: 39 },
};

const EX1 = 19.5;
const EX2 = 28.5;

function Head({ head, face }: { head: FigurinhaHead; face: string }) {
  switch (head) {
    case "rounded":
      return <rect x={12} y={15} width={24} height={21} rx={8} fill={face} />;
    case "square":
      return <rect x={12} y={15} width={24} height={20} rx={3.5} fill={face} />;
    case "round":
      return <circle cx={24} cy={25} r={12} fill={face} />;
    case "tall":
      return <rect x={14} y={11} width={20} height={26} rx={10} fill={face} />;
    case "wide":
      return <rect x={9} y={17} width={30} height={17} rx={5} fill={face} />;
  }
}

function Eyes({ look, box, c, closed }: { look: FigurinhaLook; box: HeadBox; c: FigurinhaPalette; closed: boolean }) {
  const ey = box.eyeY;
  if (closed) {
    return (
      <g fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round">
        <path d={`M${EX1 - 2.3} ${ey} L${EX1 + 2.3} ${ey}`} />
        <path d={`M${EX2 - 2.3} ${ey} L${EX2 + 2.3} ${ey}`} />
      </g>
    );
  }
  switch (look.eyes) {
    case "bright":
      return (
        <g>
          <circle cx={EX1} cy={ey} r={2.6} fill={INK} />
          <circle cx={EX2} cy={ey} r={2.6} fill={INK} />
          <circle cx={EX1 + 0.9} cy={ey - 0.9} r={0.9} fill="#fff" />
          <circle cx={EX2 + 0.9} cy={ey - 0.9} r={0.9} fill="#fff" />
        </g>
      );
    case "dots":
      return (
        <g fill={INK}>
          <circle cx={EX1} cy={ey} r={2} />
          <circle cx={EX2} cy={ey} r={2} />
        </g>
      );
    case "visor":
      return (
        <g>
          <rect x={box.left + 2.5} y={ey - 3.2} width={box.right - box.left - 5} height={6.4} rx={3.2} fill={INK} />
          <rect x={EX1 - 2.6} y={ey - 1.3} width={5.2} height={2.6} rx={1.3} fill={c.face} />
          <rect x={EX2 - 2.6} y={ey - 1.3} width={5.2} height={2.6} rx={1.3} fill={c.face} />
        </g>
      );
    case "glasses":
      return (
        <g>
          <line x1={EX1 + 3.4} y1={ey} x2={EX2 - 3.4} y2={ey} stroke={INK} strokeWidth={1.4} />
          <circle cx={EX1} cy={ey} r={3.4} fill="#f8fafc" stroke={INK} strokeWidth={1.4} />
          <circle cx={EX2} cy={ey} r={3.4} fill="#f8fafc" stroke={INK} strokeWidth={1.4} />
          <circle cx={EX1} cy={ey} r={1.4} fill={INK} />
          <circle cx={EX2} cy={ey} r={1.4} fill={INK} />
        </g>
      );
    case "happy":
      return (
        <g fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round">
          <path d={`M${EX1 - 2.3} ${ey + 0.8} Q${EX1} ${ey - 2.2} ${EX1 + 2.3} ${ey + 0.8}`} />
          <path d={`M${EX2 - 2.3} ${ey + 0.8} Q${EX2} ${ey - 2.2} ${EX2 + 2.3} ${ey + 0.8}`} />
        </g>
      );
    case "code":
      return (
        <g>
          <rect x={box.left + 3} y={ey - 4} width={box.right - box.left - 6} height={8} rx={2} fill={INK} />
          <g fill="none" stroke={c.face} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
            <path d={`M19 ${ey - 2} L16.5 ${ey} L19 ${ey + 2}`} />
            <path d={`M29 ${ey - 2} L31.5 ${ey} L29 ${ey + 2}`} />
            <path d={`M25.2 ${ey - 2.4} L22.8 ${ey + 2.4}`} />
          </g>
        </g>
      );
    case "chart":
      return (
        <g>
          <rect x={box.left + 2.5} y={ey - 5} width={box.right - box.left - 5} height={7} rx={1.6} fill={INK} />
          <polyline
            points={`${box.left + 4.5},${ey} 19,${ey - 2.5} 23,${ey - 0.8} 27,${ey - 3.6} ${box.right - 4.5},${ey - 2}`}
            fill="none"
            stroke="#22c55e"
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
          <circle cx={EX1} cy={ey + 4.2} r={1.3} fill={INK} />
          <circle cx={EX2} cy={ey + 4.2} r={1.3} fill={INK} />
        </g>
      );
  }
}

function Mouth({ mouth, y }: { mouth: FigurinhaMouth; y: number }) {
  switch (mouth) {
    case "smile":
      return <path d={`M20.5 ${y - 0.5} Q24 ${y + 3} 27.5 ${y - 0.5}`} fill="none" stroke={INK} strokeWidth={1.7} strokeLinecap="round" />;
    case "flat":
      return <line x1={21.5} y1={y} x2={26.5} y2={y} stroke={INK} strokeWidth={1.7} strokeLinecap="round" />;
    case "frown":
      return <path d={`M20.5 ${y + 1.5} Q24 ${y - 1.5} 27.5 ${y + 1.5}`} fill="none" stroke={INK} strokeWidth={1.7} strokeLinecap="round" />;
    case "open":
      return <ellipse cx={24} cy={y} rx={2.4} ry={1.8} fill={INK} />;
  }
}

function Accessory({ look, box, c }: { look: FigurinhaLook; box: HeadBox; c: FigurinhaPalette }): ReactNode {
  const { top, eyeY: ey } = box;
  switch (look.accessory) {
    case "none":
      return null;
    case "pencil":
      return (
        <g transform={`rotate(-40 37 ${ey + 3})`}>
          <rect x={34} y={ey + 1.6} width={7} height={2.8} rx={0.6} fill="#f59e0b" />
          <path d={`M34 ${ey + 1.6} L31.6 ${ey + 3} L34 ${ey + 4.4} Z`} fill="#fde68a" />
        </g>
      );
    case "antenna":
      return (
        <g>
          <line x1={24} y1={top} x2={24} y2={top - 5} stroke={c.face} strokeWidth={1.8} />
          <circle cx={24} cy={top - 6} r={2.2} fill={c.face} />
        </g>
      );
    case "headset":
      return (
        <g>
          <path d={`M${box.left - 0.5} ${ey} Q${box.left - 0.5} ${top - 3} 24 ${top - 3} Q${box.right + 0.5} ${top - 3} ${box.right + 0.5} ${ey}`} fill="none" stroke={c.accent} strokeWidth={2.4} />
          <rect x={box.left - 2.5} y={ey - 2.5} width={4} height={6.5} rx={1.6} fill={c.accent} />
          <rect x={box.right - 1.5} y={ey - 2.5} width={4} height={6.5} rx={1.6} fill={c.accent} />
          <path d={`M${box.right} ${ey + 4} Q${box.right} ${ey + 8} 28 ${ey + 8}`} fill="none" stroke={c.accent} strokeWidth={1.4} />
        </g>
      );
    case "beanie":
      return <rect x={box.left + 3} y={top - 4} width={box.right - box.left - 6} height={6} rx={2.5} fill={c.accent} />;
    case "cap":
      return (
        <g>
          <path d={`M${box.left + 1} ${top + 5} Q24 ${top - 6} ${box.right - 1} ${top + 5} Z`} fill={c.accent} />
          <rect x={23} y={top + 2.5} width={15} height={2.6} rx={1.3} fill={c.accent} />
        </g>
      );
    case "star":
      return <path d="M37 9 L38.2 11.6 L41 12 L38.9 13.9 L39.5 16.7 L37 15.3 L34.5 16.7 L35.1 13.9 L33 12 L35.8 11.6 Z" fill="#facc15" />;
    case "horns":
      return (
        <g stroke={INK} strokeWidth={1.8} strokeLinecap="round">
          <line x1={17} y1={top + 2} x2={14} y2={top - 3} />
          <line x1={31} y1={top + 2} x2={34} y2={top - 3} />
        </g>
      );
    case "tuft":
      return <path d={`M20.5 ${top - 1} L24 ${top - 4.5} L27.5 ${top - 1}`} fill="none" stroke={c.face} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />;
    case "bolt":
      return <rect x={21} y={top - 4.5} width={6} height={5} rx={1.2} fill={c.accent} />;
  }
}

/** The character itself, in the 48-unit square, without its tile. */
export function FigurinhaShapes({ look, palette, mouth = "smile", closedEyes = false }: {
  look: FigurinhaLook;
  palette: FigurinhaPalette;
  mouth?: FigurinhaMouth;
  closedEyes?: boolean;
}) {
  const box = HEAD_BOX[look.head];
  const mouthY = box.eyeY + 6 + (look.eyes === "chart" ? 1.5 : 0);
  return (
    <g>
      <Head head={look.head} face={palette.face} />
      <Eyes look={look} box={box} c={palette} closed={closedEyes} />
      <Mouth mouth={mouth} y={mouthY} />
      <Accessory look={look} box={box} c={palette} />
    </g>
  );
}

export interface FigurinhaProps {
  look: FigurinhaLook;
  color: MausColor;
  size?: number;
  state?: MausState;
  animated?: boolean;
  label?: string | null;
  className?: string;
}

export function Figurinha({ look, color, size = 44, state = "idle", animated = true, label, className }: FigurinhaProps) {
  const palette = figurinhaPalette(color);
  const motion = animated ? motionForState(state) : null;
  return (
    <svg
      viewBox="0 0 48 48"
      width={`${size}px`}
      height={`${size}px`}
      role={label ? "img" : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label ?? undefined}
      data-figurinha={`${look.head}.${look.eyes}.${look.accessory}`}
      data-figurinha-state={state}
      className={cn("block shrink-0", className)}
    >
      {label && <title>{label}</title>}
      <rect width={48} height={48} rx={11} fill={palette.bg} />
      <g className={cn("figurinha-body", motion && `figurinha-${motion}`)}>
        <FigurinhaShapes look={look} palette={palette} mouth={mouthForState(state)} closedEyes={state === "sleeping" || state === "powering-down"} />
      </g>
    </svg>
  );
}
