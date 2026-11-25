import { X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import type { Tone } from "./format.ts";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function Mark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1024 1024" className={className} aria-hidden="true">
      <rect width="1024" height="1024" rx="224" fill="#050817" />
      <path d="M512 150 L812 770 L512 640 L212 770 Z" fill="none" stroke="#00E8F8" strokeWidth="44" strokeLinejoin="round" />
      <rect x="398" y="400" width="228" height="148" rx="56" fill="#00E8F8" />
      <circle cx="465" cy="474" r="26" fill="#050817" />
      <circle cx="559" cy="474" r="26" fill="#050817" />
    </svg>
  );
}

export function Wordmark({ className = "text-xl" }: { className?: string }) {
  return (
    <span className={cx("font-display font-extrabold tracking-tight", className)}>
      <span className="text-white">arko</span>
      <span className="text-cyan-brand">bot</span>
    </span>
  );
}

type Variant = "primary" | "secondary" | "danger" | "ghost" | "accent";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-navy-950 text-white hover:bg-navy-800 shadow-sm",
  accent: "bg-cyan-brand text-navy-950 hover:brightness-95 shadow-sm",
  secondary: "bg-white text-ink border border-line hover:bg-slate-50 shadow-sm",
  danger: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
  ghost: "text-slate-600 hover:bg-slate-100",
};

export function Button({ variant = "primary", size = "md", className, busy, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md";
  busy?: boolean;
}) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
        VARIANTS[variant],
        className,
      )}
    >
      {busy ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <span className={cx("inline-block animate-spin rounded-full border-2 border-current border-t-transparent", className)} />;
}

const inputClass = "rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-slate-400 focus:border-cyan-ink focus:outline-none focus:ring-2 focus:ring-cyan-brand/30 disabled:bg-slate-50";

/** Default width and height unless the caller sets its own (two Tailwind widths on one element resolve by stylesheet order, not by class order). */
function sized(extra: string | undefined, height: string): string {
  const tokens = (extra ?? "").split(/\s+/);
  return cx(inputClass, !tokens.some((t) => t.startsWith("w-")) && "w-full", !tokens.some((t) => t.startsWith("h-")) && height, extra);
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={sized(props.className, "h-10")} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(sized(props.className, "h-10"), "pr-8")} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(sized(props.className, ""), "min-h-20 py-2")} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Checkbox({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (value: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#0786a0]" />
      <span>
        <span className="font-medium text-ink">{label}</span>
        {hint ? <span className="block text-xs text-slate-500">{hint}</span> : null}
      </span>
    </label>
  );
}

export function Card({ title, actions, children, className, padded = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cx("rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)}>
      {title || actions ? (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      ) : null}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

const TONES: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  cyan: "bg-cyan-soft text-cyan-ink ring-cyan-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function Badge({ tone = "slate", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone])}>{children}</span>;
}

export function StatusBadge({ map, value }: { map: Record<string, [string, Tone]>; value: string | null | undefined }) {
  if (!value) return <span className="text-slate-400">—</span>;
  const [label, tone] = map[value] ?? [value, "slate" as Tone];
  return <Badge tone={tone}>{label}</Badge>;
}

export function Stat({ label, value, hint, icon, tone }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: "default" | "alert" }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        {icon ? <span className={cx("grid h-8 w-8 place-items-center rounded-lg", tone === "alert" ? "bg-red-50 text-red-600" : "bg-cyan-soft text-cyan-ink")}>{icon}</span> : null}
      </div>
      <div className={cx("mt-3 font-display text-3xl font-bold tabular", tone === "alert" ? "text-red-600" : "text-ink")}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-slate-500">
            {head.map((cell, i) => <th key={i} className="whitespace-nowrap px-5 py-3 font-semibold">{cell}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
      {!hasRows && empty ? <div className="px-5 py-10 text-center text-sm text-slate-500">{empty}</div> : null}
    </div>
  );
}

export const td = "px-5 py-3 align-middle";

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon ? <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-cyan-soft text-cyan-ink">{icon}</div> : null}
      <div className="font-semibold text-ink">{title}</div>
      {children ? <div className="mt-1 max-w-md text-sm text-slate-500">{children}</div> : null}
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</div>;
}

export function Loading() {
  return (
    <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
      <Spinner /> Carregando…
    </div>
  );
}

export function Modal({ title, open, onClose, children, footer, wide }: {
  title: string; open: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/50 p-4 backdrop-blur-[2px] sm:p-10" onMouseDown={onClose}>
      <div className={cx("w-full rounded-2xl bg-white shadow-2xl", wide ? "max-w-3xl" : "max-w-lg")} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </header>
        <div className="space-y-4 px-6 py-5">{children}</div>
        {footer ? <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (value: T) => void; items: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="mb-5 flex flex-wrap gap-1 rounded-xl border border-line bg-white p-1 shadow-sm">
      {items.map((item) => (
        <button
          key={item.value}
          onClick={() => onChange(item.value)}
          className={cx("rounded-lg px-3.5 py-1.5 text-sm font-medium transition",
            value === item.value ? "bg-navy-950 text-white" : "text-slate-600 hover:bg-slate-100")}
        >
          {item.label}
          {item.count !== undefined ? <span className={cx("ml-1.5 rounded-full px-1.5 text-xs", value === item.value ? "bg-white/15" : "bg-slate-100")}>{item.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

type ToastItem = { id: number; message: string; tone: "ok" | "error" };
const ToastContext = createContext<(message: string, tone?: "ok" | "error") => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((message: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((list) => [...list, { id, message, tone }]);
    setTimeout(() => setItems((list) => list.filter((item) => item.id !== id)), 4500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2">
        {items.map((item) => (
          <div key={item.id} className={cx("rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg", item.tone === "ok" ? "bg-navy-950" : "bg-red-600")}>
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

export function Mono({ children }: { children: ReactNode }) {
  return <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">{children}</code>;
}

export function KeyValue({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-2.5 text-sm">
      {items.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-slate-500">{key}</dt>
          <dd className="font-medium text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
