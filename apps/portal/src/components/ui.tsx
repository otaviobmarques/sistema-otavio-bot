import { useEffect, useState, type ReactNode } from "react";
import type { Bot, Status } from "../data/mock";
import { statusColor } from "../lib/colors";
import { usePortal } from "../state/store";

/** Renderiza **negrito**, *itálico*, `código` e [link] dentro de um texto. */
export function Rich({ text, onLink }: { text: string; onLink?: (label: string) => void }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\])/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**")) return <strong key={i} className="font-semibold text-white">{p.slice(2, -2)}</strong>;
        if (p.startsWith("`")) return <code key={i} className="font-mono text-[0.92em] text-soft">{p.slice(1, -1)}</code>;
        if (p.startsWith("*")) return <em key={i}>{p.slice(1, -1)}</em>;
        if (p.startsWith("[")) {
          const label = p.slice(1, -1);
          return (
            <button key={i} type="button" className="text-tavinho-soft hover:underline" onClick={() => onLink?.(label)}>
              {label}
            </button>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

export function StatusDot({ status, size = 8, className = "" }: { status: Status; size?: number; className?: string }) {
  return <span className={`inline-block shrink-0 rounded-full ${className}`} style={{ width: size, height: size, background: statusColor[status] }} />;
}

export function Dot({ color, size = 8, className = "" }: { color: string; size?: number; className?: string }) {
  return <span className={`inline-block shrink-0 rounded-full ${className}`} style={{ width: size, height: size, background: color }} />;
}

export function InitialsTile({ bot, size = 46, onClick }: { bot: Pick<Bot, "initials" | "status" | "name" | "role">; size?: number; onClick?: () => void }) {
  const alert = bot.status === "bloqueado" || bot.status === "esperando";
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={`${bot.name} · ${bot.role}`}
      className="relative inline-flex shrink-0 items-center justify-center rounded-lg bg-ink-750 font-semibold text-white transition hover:brightness-125"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.3,
        border: `1px solid ${alert ? statusColor[bot.status] : "var(--color-line-strong)"}`,
      }}
    >
      {bot.initials}
      <span
        className="absolute rounded-full"
        style={{ width: size * 0.26, height: size * 0.26, right: -3, bottom: -3, background: statusColor[bot.status], boxShadow: "0 0 0 2px var(--color-ink-800)" }}
      />
    </Tag>
  );
}

export function Bar({ value, max, className = "", color = "var(--color-tavinho)" }: { value: number; max: number; className?: string; color?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-ink-700 ${className}`}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Pill({ tone, children, className = "" }: { tone: "ok" | "wait" | "block" | "idle" | "info"; children: ReactNode; className?: string }) {
  const map = {
    ok: "border-ok/40 text-soft",
    wait: "border-wait text-wait",
    block: "border-block/70 text-block",
    idle: "border-line-strong text-muted",
    info: "border-tavinho/60 text-tavinho-soft",
  } as const;
  const dot = { ok: "#22c55e", wait: "#f59e0b", block: "#ef4444", idle: "#6b7280", info: "#3b82f6" }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${map[tone]} ${className}`}>
      <Dot color={dot} size={7} />
      {children}
    </span>
  );
}

export function useIsMobile(): boolean {
  const query = "(max-width: 639px)";
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMobile(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return mobile;
}

export function Toasts() {
  const { state, dismissToast } = usePortal();
  useEffect(() => {
    if (state.toasts.length === 0) return;
    const first = state.toasts[0];
    if (!first) return;
    const t = setTimeout(() => dismissToast(first.id), 3200);
    return () => clearTimeout(t);
  }, [state.toasts, dismissToast]);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6">
      {state.toasts.slice(-3).map((t) => (
        <div key={t.id} className="anim-toast pointer-events-auto rounded-lg border border-line-strong bg-ink-750 px-4 py-2.5 text-sm text-white shadow-xl shadow-black/40">
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="eyebrow font-sans">{children}</h2>
      {right}
    </div>
  );
}
