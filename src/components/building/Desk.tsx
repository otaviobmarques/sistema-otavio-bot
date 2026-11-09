import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import type { Bot } from "@/state/store";
import { BotAvatar } from "../Avatar";
import { DESK_STATUS_LABEL, DESK_STATUSES, type DeskStatus } from "./building-view";

export const STATUS_DOT: Record<DeskStatus, string> = {
  working: "bg-success",
  waiting: "bg-warning",
  blocked: "bg-danger",
  idle: "bg-ink-tertiary",
};

const STATUS_RING: Record<DeskStatus, string> = {
  working: "ring-success/70",
  waiting: "ring-warning",
  blocked: "ring-danger",
  idle: "ring-hairline",
};

export function StatusDot({ status, className }: { status: DeskStatus; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-2 shrink-0 rounded-full", STATUS_DOT[status], className)} />;
}

/** A bot at its desk: its own face in a rounded tile, ringed and dotted in its status's colour. */
export function DeskFace({ bot, status, size = 40 }: { bot: Bot; status: DeskStatus; size?: number }) {
  return (
    <span data-desk-status={status} className={cn("relative grid shrink-0 place-items-center rounded-xl bg-raised ring-2", STATUS_RING[status])}
      style={{ width: size + 10, height: size + 10 }}>
      <BotAvatar bot={bot} size={size} state="happy" motion="none" motionKey={0} animated={false} />
      <span aria-hidden="true" className={cn("absolute -bottom-1 -right-1 size-3.5 rounded-full border-2 border-card", STATUS_DOT[status], status === "working" && "motion-safe:animate-pulse")} />
    </span>
  );
}

export function DeskTile({ bot, status, onOpen }: { bot: Bot; status: DeskStatus; onOpen: () => void }) {
  const label = t("building.botStatus", { name: bot.name, status: t(DESK_STATUS_LABEL[status]) });
  return (
    <button type="button" data-desk={bot.id} onClick={onOpen} aria-label={label} title={label}
      className="flex w-[68px] flex-col items-center gap-1.5 rounded-xl p-1 text-center outline-none hover:bg-raised/60 focus-visible:ring-2 focus-visible:ring-focus">
      <DeskFace bot={bot} status={status} />
      <span className="w-full truncate text-[12px] font-medium text-ink">{bot.name}</span>
    </button>
  );
}

export function StatusLegend({ className }: { className?: string }) {
  return (
    <ul aria-label={t("building.legend")} className={cn("space-y-1.5 text-[13px] text-ink-secondary", className)}>
      {DESK_STATUSES.map((status) => (
        <li key={status} className="flex items-center gap-2.5"><StatusDot status={status} />{t(DESK_STATUS_LABEL[status])}</li>
      ))}
    </ul>
  );
}
