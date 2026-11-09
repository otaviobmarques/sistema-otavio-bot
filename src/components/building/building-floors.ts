import type { Company, CompanySpend } from "../../../shared/companies";
import type { BuildingRoom } from "./building-view";

/** A floor of the Building: one company with its departments as rooms, or the floor of rooms in no company. */
export interface BuildingFloor<T> {
  /** null for the floor of departments in no company, General among them. */
  company: Company | null;
  rooms: BuildingRoom<T>[];
}

/** One floor per company, top floor first, each with its departments in the company's order, then the rooms no company
 * holds. That last floor is left out when it would be empty, unless there are no companies at all. */
export function buildingFloors<T>(rooms: readonly BuildingRoom<T>[], companies: readonly Company[] | null): BuildingFloor<T>[] {
  const byDepartment = new Map(rooms.flatMap((room) => (room.department === null ? [] : [[room.department, room] as const])));
  const placed = new Set<BuildingRoom<T>>();
  const floors: BuildingFloor<T>[] = [...(companies ?? [])].sort((a, b) => a.order - b.order).map((company) => ({
    company,
    rooms: company.departmentIds.flatMap((department) => {
      const room = byDepartment.get(department);
      if (!room || placed.has(room)) return [];
      placed.add(room);
      return [room];
    }),
  }));
  const rest = rooms.filter((room) => !placed.has(room));
  if (rest.length > 0 || floors.length === 0) floors.push({ company: null, rooms: rest });
  return floors;
}

/** Floors are numbered from the ground up, as in a lift: the lowest company floor is the 1st. */
export const floorNumber = (index: number, floorCount: number): number => floorCount - index;

export function budgetLabel(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(amount);
}

/** Spend shows its cents: a turn costs a few of them. */
export function moneyLabel(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

/** How a floor's budget meter reads: released is a spent budget the owner let run on. */
export type BudgetTone = "ok" | "warn" | "paused" | "released";

export function budgetTone(spend: Pick<CompanySpend, "level" | "released">): BudgetTone {
  if (spend.level === "exceeded") return spend.released ? "released" : "paused";
  return spend.level === "warn" ? "warn" : "ok";
}
