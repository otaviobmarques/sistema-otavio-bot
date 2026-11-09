import type { ReactNode } from "react";
import { Gavel, Inbox } from "lucide-react";
import type { Company } from "../../../shared/companies";
import { cn } from "@/lib/cn";
import { engineDisplayName } from "@/lib/engine-name";
import { intlLocale, t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";
import type { Bot, InstanceInfo } from "@/state/store";
import { budgetLabel, floorNumber, type BuildingFloor } from "./building-floors";
import type { BuildingRoom, DeskStatus } from "./building-view";
import { DeskTile, StatusDot } from "./Desk";
import type { Desks } from "./use-desks";

export const counted = (count: number, one: LocaleKey, many: LocaleKey) => (count === 1 ? t(one) : t(many, { count }));

function enginesOf(bots: readonly Bot[], instances: readonly InstanceInfo[]): string {
  const names = bots.flatMap((bot) => {
    const instance = instances.find((one) => one.instanceId === bot.modelSelection?.instanceId);
    return instance ? [engineDisplayName(instance)] : [];
  });
  return [...new Set(names)].join(" · ");
}

function Room({ room, status, instances, onOpen }: {
  room: BuildingRoom<Bot>;
  status: ReadonlyMap<string, DeskStatus>;
  instances: readonly InstanceInfo[];
  onOpen: (bot: Bot) => void;
}) {
  const name = room.department ?? t("building.generalRoom");
  const engines = enginesOf(room.bots, instances);
  return (
    <section data-building-room={room.department ?? ""} aria-label={name} className="flex min-w-0 flex-col rounded-2xl border border-hairline/70 bg-card px-4 py-3.5">
      <h3 title={name} className="line-clamp-2 break-words text-[14px] font-medium leading-5 text-ink">{name}</h3>
      <div className="mt-3 flex min-h-[74px] flex-wrap gap-1.5">
        {room.bots.map((bot) => <DeskTile key={bot.id} bot={bot} status={status.get(bot.id) ?? "idle"} onOpen={() => onOpen(bot)} />)}
        {room.bots.length === 0 && <span className="self-center text-[12px] text-ink-tertiary">{t("building.emptyRoom")}</span>}
      </div>
      {engines && <div title={engines} className="mt-2 truncate text-[12px] text-ink-tertiary">{engines}</div>}
    </section>
  );
}

/** A floor's row: what it is on the left, its rooms on the right, and a stripe in the company's colour when it has one. */
function FloorRow({ id, label, color, side, children }: { id: string; label: string; color?: string; side: ReactNode; children: ReactNode }) {
  return (
    <div data-building-floor={id} aria-label={label} role="group"
      className="relative grid gap-4 border-b border-hairline/70 px-5 py-5 last:border-b-0 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-6">
      {color && <span aria-hidden="true" data-floor-stripe={color} className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: color }} />}
      <div className="min-w-0 pt-1">{side}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const LEVEL = "text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-tertiary";

export function PenthouseFloor({ desks, onOpen }: { desks: Desks; onOpen: () => void }) {
  const waiting = desks.pending > 0;
  return (
    <FloorRow id="penthouse" label={t("building.penthouse")} side={<>
      <div className={LEVEL}>{t("building.penthouse")}</div>
      <h2 className="mt-0.5 flex items-center gap-2 text-[17px] font-semibold text-ink"><StatusDot status={waiting ? "waiting" : "idle"} />{t("building.presidency")}</h2>
      <div className="mt-1 text-[12px] text-ink-secondary">{t("building.presidencyLine")}</div>
    </>}>
      <button type="button" data-building-board={desks.pending} onClick={onOpen}
        className={cn("flex w-full min-w-0 flex-col items-start rounded-2xl border px-4 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-focus",
          waiting ? "border-warning bg-warning/[0.05] hover:bg-warning/[0.09]" : "border-hairline/70 bg-card hover:bg-raised/60")}>
        <span className={cn("flex items-center gap-2 text-[14px] font-medium", waiting ? "text-warning" : "text-ink")}>
          <Gavel size={15} aria-hidden="true" />{t("building.boardTile")}
        </span>
        <span className="mt-3 flex flex-wrap gap-2">
          {desks.items.length > 0 && <span className="flex items-center gap-2 rounded-full border border-warning px-2.5 py-1 text-[12px] text-ink-secondary">
            <StatusDot status="waiting" />{counted(desks.items.length, "building.asksCountOne", "building.asksCount")}
          </span>}
          {desks.blocked.length > 0 && <span className="flex items-center gap-2 rounded-full border border-hairline px-2.5 py-1 text-[12px] text-ink-secondary">
            <StatusDot status="blocked" />{counted(desks.blocked.length, "building.blockedCountOne", "building.blockedCount")}
          </span>}
          {desks.pending === 0 && <span className="text-[12px] text-ink-secondary">{t("board.empty")}</span>}
        </span>
      </button>
    </FloorRow>
  );
}

function CompanySide({ company, level, bots }: { company: Company; level: number; bots: number }) {
  return (
    <>
      <div className={LEVEL}>{t("building.floorNumber", { number: level })}</div>
      <h2 title={company.name} className="mt-0.5 flex min-w-0 items-center gap-2 text-[17px] font-semibold text-ink">
        <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: company.color }} />
        <span className="truncate">{company.name}</span>
      </h2>
      {company.sector && <div className="mt-0.5 text-[13px] text-ink-secondary">{company.sector}</div>}
      {company.mission && <p title={company.mission} className="mt-1.5 line-clamp-3 text-[12px] leading-[18px] text-ink-tertiary">{company.mission}</p>}
      <div data-company-budget={company.monthlyBudgetBrl ?? ""} className="mt-1.5 text-[12px] text-ink-secondary">
        {counted(bots, "building.botCountOne", "building.botCount")}
        {company.monthlyBudgetBrl !== null && <> · {t("building.budgetMonthly", { amount: budgetLabel(company.monthlyBudgetBrl, intlLocale()) })}</>}
      </div>
    </>
  );
}

export function CompanyFloor({ floor, index, floorCount, status, instances, onOpen }: {
  floor: BuildingFloor<Bot>;
  index: number;
  floorCount: number;
  status: ReadonlyMap<string, DeskStatus>;
  instances: readonly InstanceInfo[];
  onOpen: (bot: Bot) => void;
}) {
  const bots = floor.rooms.reduce((sum, room) => sum + room.bots.length, 0);
  const company = floor.company;
  const label = company?.name ?? t("building.noCompany");
  return (
    <FloorRow id={company?.id ?? "none"} label={label} color={company?.color} side={company
      ? <CompanySide company={company} level={floorNumber(index, floorCount)} bots={bots} />
      : <>
        <div className={LEVEL}>{t("building.noCompanyLevel")}</div>
        <h2 className="mt-0.5 text-[17px] font-semibold text-ink">{t("building.noCompany")}</h2>
        <div className="mt-1 text-[12px] text-ink-secondary">{counted(bots, "building.botCountOne", "building.botCount")}</div>
      </>}>
      <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3.5">
        {floor.rooms.map((room) => <Room key={room.department ?? ""} room={room} status={status} instances={instances} onOpen={onOpen} />)}
        {floor.rooms.length === 0 && <p className="text-[13px] text-ink-tertiary">{t(company ? "building.noDepartments" : "building.noBots")}</p>}
      </div>
    </FloorRow>
  );
}

export function GroundFloor({ onInbox }: { onInbox?: () => void }) {
  return (
    <FloorRow id="ground" label={t("building.groundFloor")} side={<>
      <div className={LEVEL}>{t("building.groundFloor")}</div>
      <h2 className="mt-0.5 text-[17px] font-semibold text-ink">{t("building.reception")}</h2>
      <div className="mt-1 text-[12px] text-ink-secondary">{t("building.receptionLine")}</div>
    </>}>
      <div className="flex min-w-0 flex-col items-start gap-3 rounded-2xl border border-hairline/70 bg-card px-4 py-4">
        <span className="text-[14px] font-medium text-ink">{t("building.receptionTile")}</span>
        {onInbox && <button type="button" data-building-reception="" onClick={onInbox}
          className="flex items-center gap-2 rounded-full border border-hairline px-3 py-1 text-[12px] text-ink-secondary outline-none hover:bg-raised/60 focus-visible:ring-2 focus-visible:ring-focus">
          <Inbox size={13} aria-hidden="true" />{t("building.receptionOpen")}
        </button>}
      </div>
    </FloorRow>
  );
}
