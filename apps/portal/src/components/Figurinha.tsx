import type { Figurinha as Fig, HeadShape, Status } from "../data/mock";
import { palette, statusColor } from "../lib/colors";

const INK = "#111827";

interface HeadBox {
  top: number;
  eyeY: number;
  left: number;
  right: number;
}

const headBox: Record<HeadShape, HeadBox> = {
  arredondada: { top: 15, eyeY: 24.5, left: 12, right: 36 },
  quadrada: { top: 15, eyeY: 24, left: 12, right: 36 },
  redonda: { top: 13, eyeY: 24.5, left: 12, right: 36 },
  alta: { top: 11, eyeY: 23.5, left: 14, right: 34 },
  larga: { top: 17, eyeY: 25, left: 9, right: 39 },
};

export function FigurinhaShapes({ f }: { f: Fig }) {
  const c = palette[f.color];
  const box = headBox[f.head];
  const ey = box.eyeY;
  const mouthY = ey + 6;
  const ex1 = 19.5;
  const ex2 = 28.5;

  const head = (() => {
    switch (f.head) {
      case "arredondada":
        return <rect x={12} y={15} width={24} height={21} rx={8} fill={c.face} />;
      case "quadrada":
        return <rect x={12} y={15} width={24} height={20} rx={3.5} fill={c.face} />;
      case "redonda":
        return <circle cx={24} cy={25} r={12} fill={c.face} />;
      case "alta":
        return <rect x={14} y={11} width={20} height={26} rx={10} fill={c.face} />;
      case "larga":
        return <rect x={9} y={17} width={30} height={17} rx={5} fill={c.face} />;
    }
  })();

  const eyes = (() => {
    switch (f.eyes) {
      case "brilhantes":
        return (
          <g>
            <circle cx={ex1} cy={ey} r={2.6} fill={INK} />
            <circle cx={ex2} cy={ey} r={2.6} fill={INK} />
            <circle cx={ex1 + 0.9} cy={ey - 0.9} r={0.9} fill="#fff" />
            <circle cx={ex2 + 0.9} cy={ey - 0.9} r={0.9} fill="#fff" />
          </g>
        );
      case "pontos":
        return (
          <g fill={INK}>
            <circle cx={ex1} cy={ey} r={2} />
            <circle cx={ex2} cy={ey} r={2} />
          </g>
        );
      case "visor":
        return (
          <g>
            <rect x={box.left + 2.5} y={ey - 3.2} width={box.right - box.left - 5} height={6.4} rx={3.2} fill={INK} />
            <rect x={ex1 - 2.6} y={ey - 1.3} width={5.2} height={2.6} rx={1.3} fill={c.face} />
            <rect x={ex2 - 2.6} y={ey - 1.3} width={5.2} height={2.6} rx={1.3} fill={c.face} />
          </g>
        );
      case "oculos":
        return (
          <g>
            <line x1={ex1 + 3.4} y1={ey} x2={ex2 - 3.4} y2={ey} stroke={INK} strokeWidth={1.4} />
            <circle cx={ex1} cy={ey} r={3.4} fill="#f8fafc" stroke={INK} strokeWidth={1.4} />
            <circle cx={ex2} cy={ey} r={3.4} fill="#f8fafc" stroke={INK} strokeWidth={1.4} />
            <circle cx={ex1} cy={ey} r={1.4} fill={INK} />
            <circle cx={ex2} cy={ey} r={1.4} fill={INK} />
          </g>
        );
      case "felizes":
        return (
          <g fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round">
            <path d={`M${ex1 - 2.3} ${ey + 0.8} Q${ex1} ${ey - 2.2} ${ex1 + 2.3} ${ey + 0.8}`} />
            <path d={`M${ex2 - 2.3} ${ey + 0.8} Q${ex2} ${ey - 2.2} ${ex2 + 2.3} ${ey + 0.8}`} />
          </g>
        );
      case "codigo":
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
      case "grafico":
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
            <circle cx={ex1} cy={ey + 4.2} r={1.3} fill={INK} />
            <circle cx={ex2} cy={ey + 4.2} r={1.3} fill={INK} />
          </g>
        );
    }
  })();

  const mouth = (() => {
    const my = f.eyes === "grafico" ? mouthY + 1.5 : mouthY;
    switch (f.mouth) {
      case "sorriso":
        return <path d={`M20.5 ${my - 0.5} Q24 ${my + 3} 27.5 ${my - 0.5}`} fill="none" stroke={INK} strokeWidth={1.7} strokeLinecap="round" />;
      case "reto":
        return <line x1={21.5} y1={my} x2={26.5} y2={my} stroke={INK} strokeWidth={1.7} strokeLinecap="round" />;
      case "bravo":
        return <path d={`M20.5 ${my + 1.5} Q24 ${my - 1.5} 27.5 ${my + 1.5}`} fill="none" stroke={INK} strokeWidth={1.7} strokeLinecap="round" />;
      case "aberto":
        return <ellipse cx={24} cy={my} rx={2.4} ry={1.8} fill={INK} />;
    }
  })();

  const accessory = (() => {
    const top = box.top;
    switch (f.accessory) {
      case "nenhum":
        return null;
      case "lapis":
        return (
          <g transform={`rotate(-40 37 ${ey + 3})`}>
            <rect x={34} y={ey + 1.6} width={7} height={2.8} rx={0.6} fill="#f59e0b" />
            <path d={`M34 ${ey + 1.6} L31.6 ${ey + 3} L34 ${ey + 4.4} Z`} fill="#fde68a" />
          </g>
        );
      case "antena":
        return (
          <g>
            <line x1={24} y1={top} x2={24} y2={top - 5} stroke={c.face} strokeWidth={1.8} />
            <circle cx={24} cy={top - 6} r={2.2} fill={c.face} />
          </g>
        );
      case "fone":
        return (
          <g>
            <path d={`M${box.left - 0.5} ${ey} Q${box.left - 0.5} ${top - 3} 24 ${top - 3} Q${box.right + 0.5} ${top - 3} ${box.right + 0.5} ${ey}`} fill="none" stroke={c.accent} strokeWidth={2.4} />
            <rect x={box.left - 2.5} y={ey - 2.5} width={4} height={6.5} rx={1.6} fill={c.accent} />
            <rect x={box.right - 1.5} y={ey - 2.5} width={4} height={6.5} rx={1.6} fill={c.accent} />
            <path d={`M${box.right} ${ey + 4} Q${box.right} ${ey + 8} 28 ${ey + 8}`} fill="none" stroke={c.accent} strokeWidth={1.4} />
          </g>
        );
      case "gorro":
        return <rect x={box.left + 3} y={top - 4} width={box.right - box.left - 6} height={6} rx={2.5} fill={c.accent} />;
      case "bone":
        return (
          <g>
            <path d={`M${box.left + 1} ${top + 5} Q24 ${top - 6} ${box.right - 1} ${top + 5} Z`} fill={c.accent} />
            <rect x={23} y={top + 2.5} width={15} height={2.6} rx={1.3} fill={c.accent} />
          </g>
        );
      case "estrela":
        return (
          <path
            d="M37 9 L38.2 11.6 L41 12 L38.9 13.9 L39.5 16.7 L37 15.3 L34.5 16.7 L35.1 13.9 L33 12 L35.8 11.6 Z"
            fill="#facc15"
          />
        );
      case "chifres":
        return (
          <g stroke={INK} strokeWidth={1.8} strokeLinecap="round">
            <line x1={17} y1={top + 2} x2={14} y2={top - 3} />
            <line x1={31} y1={top + 2} x2={34} y2={top - 3} />
          </g>
        );
      case "topete":
        return (
          <path d={`M20.5 ${top - 1} L24 ${top - 4.5} L27.5 ${top - 1}`} fill="none" stroke={c.face} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        );
      case "parafuso":
        return <rect x={21} y={top - 4.5} width={6} height={5} rx={1.2} fill={c.accent} />;
    }
  })();

  return (
    <g>
      {head}
      {eyes}
      {mouth}
      {accessory}
    </g>
  );
}

interface FigurinhaProps {
  f: Fig;
  size?: number;
  status?: Status;
  /** borda colorida no quadro quando o bot precisa de você */
  highlight?: boolean;
  title?: string;
  className?: string;
}

export function Figurinha({ f, size = 48, status, highlight, title, className = "" }: FigurinhaProps) {
  const c = palette[f.color];
  const dot = Math.max(8, Math.round(size * (size > 64 ? 0.22 : 0.3)));
  const border = status && highlight && (status === "bloqueado" || status === "esperando") ? statusColor[status] : undefined;
  return (
    <span className={`relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }} title={title}>
      <svg
        viewBox="0 0 48 48"
        width={size}
        height={size}
        role="img"
        aria-label={title ?? "figurinha"}
        style={{ borderRadius: size * 0.24, outline: border ? `2px solid ${border}` : undefined, outlineOffset: 1 }}
      >
        <rect width={48} height={48} rx={11} fill={c.bg} />
        <FigurinhaShapes f={f} />
      </svg>
      {status && (
        <span
          className="absolute rounded-full"
          style={{
            width: dot,
            height: dot,
            right: -dot * 0.25,
            bottom: -dot * 0.25,
            background: statusColor[status],
            boxShadow: `0 0 0 ${size >= 40 ? 3 : 2}px var(--color-ink-900)`,
          }}
        />
      )}
    </span>
  );
}

export function Personagem({ f, size = 40 }: { f: Fig; size?: number }) {
  const c = palette[f.color];
  return (
    <svg viewBox="0 0 48 66" width={size} height={(size * 66) / 48} aria-hidden>
      <rect x={15} y={37} width={18} height={17} rx={6} fill={c.face} opacity={0.85} />
      <rect x={17.5} y={52} width={5} height={10} rx={2.5} fill={c.accent} />
      <rect x={25.5} y={52} width={5} height={10} rx={2.5} fill={c.accent} />
      <FigurinhaShapes f={f} />
    </svg>
  );
}
