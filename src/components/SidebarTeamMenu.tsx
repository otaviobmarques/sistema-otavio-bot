import { useState } from "react";
import { Building2, Check, CheckCheck, Loader2, Network, Share2, SlidersHorizontal, SquarePen, Trash2, UserRound, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { departmentUnread, markDepartmentRead } from "@/lib/folder-read";
import { t } from "@/lib/i18n";
import { companyOf, moveDepartmentToCompany, useCompanies } from "@/state/companies";
import { api, useStore } from "@/state/store";
import { MENU_ITEM } from "./menu-recipe";

export { showWhoReportsToWhom } from "./TeamOrgChart";

/** A department's menu, from its line's ⋯ or a right-click on its name. */
/** Reads every conversation of the department's bots and its group chats; shown only while something there is unread. */
function MarkDepartmentRead({ name, className, onDone }: { name: string; className: string; onDone: () => void }) {
  const { state, dispatch } = useStore();
  const [reading, setReading] = useState(false);
  const unread = departmentUnread(name, state.bots, state.groups);
  if (!reading && unread.bots.length === 0 && unread.groups.length === 0) return null;
  const read = async () => {
    setReading(true);
    try {
      await markDepartmentRead(unread, (path, init) => api(path, init), (bot) => dispatch({ type: "botPatched", bot }), (group) => dispatch({ type: "groupPatched", group }));
      onDone();
    } catch (error) {
      dispatch({ type: "error", message: error instanceof Error ? `${t("sidebar.bot.markAllReadFailed")} ${error.message}` : t("sidebar.bot.markAllReadFailed") });
    } finally {
      setReading(false);
    }
  };
  return <button type="button" role="menuitem" data-team-mark-read className={className} disabled={reading} onClick={() => void read()}>
    {reading ? <Loader2 size={16} className="animate-spin" /> : <CheckCheck size={16} />}{reading ? t("team.markingAllRead") : t("team.markAllRead")}
  </button>;
}

/** Which company holds the department: opens into one choice per company, and none. */
function DepartmentCompany({ name, className, onDone }: { name: string; className: string; onDone: () => void }) {
  const { dispatch } = useStore();
  const companies = useCompanies();
  const [open, setOpen] = useState(false);
  if (!companies?.length) return null;
  const holder = companyOf(companies, name);
  const choose = (companyId: string | null) => {
    onDone();
    if (companyId === (holder?.id ?? null)) return;
    void moveDepartmentToCompany(name, companyId).catch((error: unknown) => dispatch({ type: "error", message: error instanceof Error ? error.message : String(error) }));
  };
  const choice = (id: string | null, label: string, color?: string) => (
    <button key={id ?? ""} type="button" role="menuitemradio" aria-checked={(holder?.id ?? null) === id} data-team-company={id ?? ""} className={cn(className, "pl-9")} onClick={() => choose(id)}>
      {color ? <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} /> : <span aria-hidden="true" className="size-2.5 shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {(holder?.id ?? null) === id && <Check size={14} aria-hidden="true" />}
    </button>
  );
  return <>
    <button type="button" role="menuitem" aria-expanded={open} data-team-company-menu="" className={className} onClick={() => setOpen(!open)}>
      <Building2 size={16} /><span className="min-w-0 flex-1 truncate">{t("companies.departmentMenu", { name: holder?.name ?? t("building.noCompany") })}</span>
    </button>
    {open && <>{companies.map((company) => choice(company.id, company.name, company.color))}{choice(null, t("building.noCompany"))}</>}
  </>;
}

export function TeamMenuItems({ onAddBots, onRename, onShare, onDelete, onSetForAll, onSetOwner, onSeeReports, department, onRead }: {
  /** The department this menu is for: with it, the menu offers Mark all as read. */
  department?: string;
  onRead?: () => void;
  onAddBots: () => void;
  onRename: () => void;
  onShare: () => void;
  onDelete: () => void;
  onSetForAll?: () => void;
  onSetOwner?: () => void;
  onSeeReports?: () => void;
}) {
  const item = cn(MENU_ITEM, "hover:bg-menu-hover [&>svg]:text-ink-secondary");
  return (
    <>
      <button type="button" role="menuitem" autoFocus className={item} onClick={onAddBots}><Users size={16} />{t("team.addBots")}</button>
      {department !== undefined && <MarkDepartmentRead name={department} className={cn(item, "disabled:opacity-60")} onDone={onRead ?? (() => {})} />}
      {department && <DepartmentCompany name={department} className={item} onDone={onRead ?? (() => {})} />}
      {onSetOwner && <button type="button" role="menuitem" className={item} onClick={onSetOwner}><UserRound size={16} />{t("lookedAfter.setForAll")}</button>}
      {onSeeReports && <button type="button" role="menuitem" className={item} onClick={onSeeReports}><Network size={16} />{t("lookedAfter.seeWho")}</button>}
      {onSetForAll && <button type="button" role="menuitem" className={item} onClick={onSetForAll}><SlidersHorizontal size={16} />{t("teamSettings.menu")}</button>}
      <button type="button" role="menuitem" className={item} onClick={onRename}><SquarePen size={16} />{t("team.rename")}</button>
      <button type="button" role="menuitem" className={item} onClick={onShare}><Share2 size={16} />{t("team.share")}</button>
      <button type="button" role="menuitem" className={cn(item, "text-danger [&>svg]:text-danger")} onClick={onDelete}><Trash2 size={16} />{t("team.delete")}</button>
    </>
  );
}
