import { CircleCheck, CircleX } from "lucide-react";
import { approvals as allApprovals } from "../data/mock";
import { usePortal } from "../state/store";
import { Dot, Rich } from "./ui";

export function ApprovalInline({ approvalId, compact = false }: { approvalId: string; compact?: boolean }) {
  const { state, decide } = usePortal();
  const pending = state.approvals.find((a) => a.id === approvalId);
  const ap = pending ?? allApprovals.find((a) => a.id === approvalId);
  if (!ap) return null;
  const decided = state.decided[approvalId];
  const chat = ap.chat ?? { rule: ap.tag, text: ap.text, preview: "" };

  if (!pending && decided) {
    const ok = decided.outcome === "aprovado";
    return (
      <div className={`rounded-xl border px-4 py-3 text-sm ${ok ? "border-ok/50 bg-ok/[0.06]" : "border-block/50 bg-block/[0.06]"}`}>
        <div className="flex items-center gap-2 font-medium text-white">
          {ok ? <CircleCheck size={16} className="text-ok" /> : <CircleX size={16} className="text-block" />}
          {ok ? `Você aprovou: ${decided.label}` : "Você recusou este pedido"}
        </div>
        <div className="mt-1 text-muted">
          <Rich text={chat.text} />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-wait bg-wait/[0.03] px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[14.5px] font-semibold text-wait">
          <Dot color="#f59e0b" /> Preciso da sua aprovação
        </span>
        {!compact && <span className="text-[12.5px] text-muted">{chat.rule}</span>}
      </div>
      <p className="mt-2 text-[14.5px] leading-relaxed text-soft">
        <Rich text={chat.text} />
      </p>
      {chat.preview && (
        <div className="mt-3 rounded-lg bg-ink-900/80 px-4 py-3 text-[13px] leading-relaxed text-soft">
          <p className={compact ? "line-clamp-2" : ""}>{chat.preview}</p>
        </div>
      )}
      <div className={compact ? "mt-3 grid grid-cols-2 gap-2" : "mt-4 flex flex-wrap gap-2"}>
        {ap.options.map((o, i) => (
          <button
            key={o.label}
            onClick={() => decide(ap.id, i)}
            className={`btn ${compact ? "py-3" : ""} ${o.tone === "primary" ? "btn-ok" : ""} ${o.tone === "danger" ? "btn-danger" : ""}`}
          >
            {compact ? (o.shortLabel ?? o.chatLabel ?? o.label) : (o.chatLabel ?? o.label)}
          </button>
        ))}
      </div>
    </div>
  );
}
