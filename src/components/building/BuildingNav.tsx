import { Building2, Gavel, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";
import { useStore } from "@/state/store";
import { useDesks } from "./use-desks";

function NavRow({ id, label, Icon, active, count, icons, large, onClick }: {
  id: string; label: LocaleKey; Icon: LucideIcon; active: boolean; count: number; icons: boolean; large: boolean; onClick: () => void;
}) {
  const name = t(label);
  const shown = count > 9 ? "9+" : String(count);
  const badge = count > 0 && <span aria-hidden="true" data-building-nav-count={count}
    className={cn("rounded-full bg-warning font-semibold tabular-nums text-panel", icons ? "absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center px-0.5 text-[10px] leading-4" : "shrink-0 px-1.5 text-[11px]")}>{shown}</span>;
  const aria = count > 0 ? t("building.navCount", { name, count }) : name;
  if (icons) {
    return (
      <button type="button" data-sidebar-nav={id} aria-label={aria} title={name} aria-current={active ? "page" : undefined} onClick={onClick}
        className={cn("relative mx-auto mb-1 flex size-[46px] shrink-0 items-center justify-center rounded-xl text-ink-secondary hover:bg-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus", active && "bg-raised text-ink")}>
        <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
        {badge}
      </button>
    );
  }
  return (
    <button type="button" data-sidebar-nav={id} aria-label={aria} aria-current={active ? "page" : undefined} onClick={onClick}
      className={cn("flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none hover:bg-raised/60 focus-visible:ring-2 focus-visible:ring-accent/60", active && "bg-raised/70")}>
      <span className={cn("grid shrink-0 place-items-center rounded-full", active ? "bg-ink/[0.16] text-ink" : "bg-raised text-ink-secondary", large ? "size-9" : "size-8")}>
        <Icon size={large ? 18 : 16} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className={cn("min-w-0 flex-1 truncate text-ink", large ? "text-[14px] font-medium leading-5" : "text-[15px] font-semibold leading-5")}>{name}</span>
      {badge}
    </button>
  );
}

/** The Building and its Board room, at the top of the sidebar on every plan. */
export function SidebarBuildingRows({ icons, large, onOpened }: { icons: boolean; large: boolean; onOpened?: () => void }) {
  const { state, dispatch } = useStore();
  const { pending } = useDesks();
  const go = (type: "showBuilding" | "showBoardRoom") => { dispatch({ type }); onOpened?.(); };
  const rows = (
    <>
      <NavRow id="building" label="building.nav" Icon={Building2} active={state.activeView === "building"} count={0} icons={icons} large={large} onClick={() => go("showBuilding")} />
      <NavRow id="board-room" label="board.title" Icon={Gavel} active={state.activeView === "board-room"} count={pending} icons={icons} large={large} onClick={() => go("showBoardRoom")} />
    </>
  );
  return icons ? rows : <nav aria-label={t("building.nav")} className="px-3 pb-1">{rows}</nav>;
}
