import { describe, expect, it } from "vitest";

import type { Company } from "../../../shared/companies";
import { budgetFromField, rateFromField } from "./CompaniesDialog";
import { ruleDraftsOf, rulesFromDrafts, type RuleDraft } from "./CompanyRulesEditor";
import { budgetLabel, budgetTone, buildingFloors, floorNumber, moneyLabel } from "./building-floors";
import type { BuildingRoom } from "./building-view";

const room = (department: string | null): BuildingRoom<string> => ({ department, bots: [department ?? "general"] });
const company = (id: string, order: number, departmentIds: string[]): Company => ({
  id, name: id, sector: "", mission: "", color: "#7B61FF", monthlyBudgetBrl: null, usdToBrl: null, budgetReleasedMonth: null, rules: [], order, departmentIds,
});

describe("the Building's floors", () => {
  const rooms = [room("Tráfego"), room("Criação"), room("Edição"), room("Suporte"), room(null)];

  it("puts each company's departments on its floor, in the company's order and the floors' order", () => {
    const floors = buildingFloors(rooms, [company("vertice", 1, ["Edição"]), company("redbox", 0, ["Criação", "Tráfego", "Gone"])]);
    expect(floors.map((floor) => [floor.company?.id ?? null, floor.rooms.map((one) => one.department)])).toEqual([
      ["redbox", ["Criação", "Tráfego"]],
      ["vertice", ["Edição"]],
      [null, ["Suporte", null]],
    ]);
  });

  it("leaves out an empty No company floor, and keeps it as the only floor when there are no companies", () => {
    expect(buildingFloors([room("Edição")], [company("vertice", 0, ["Edição"])]).map((floor) => floor.company?.id ?? null)).toEqual(["vertice"]);
    expect(buildingFloors(rooms, null)).toEqual([{ company: null, rooms }]);
    expect(buildingFloors([], [])).toEqual([{ company: null, rooms: [] }]);
  });

  it("numbers floors from the ground up and writes budgets in reais", () => {
    expect([0, 1, 2, 3].map((index) => floorNumber(index, 4))).toEqual([4, 3, 2, 1]);
    expect(budgetLabel(1500, "pt-BR").replace(/\s/g, " ")).toBe("R$ 1.500");
  });

  it("reads the budget field: empty is none, a comma is a decimal point, anything else is refused", () => {
    expect(budgetFromField("")).toBeNull();
    expect(budgetFromField(" 1 500,50 ")).toBe(1500.5);
    expect(budgetFromField("-3")).toBeUndefined();
    expect(budgetFromField("abc")).toBeUndefined();
  });

  it("writes spend with its cents and reads a floor's meter from its level", () => {
    expect(moneyLabel(12.345, "pt-BR").replace(/\s/g, " ")).toBe("R$ 12,35");
    expect(budgetTone({ level: "ok", released: false })).toBe("ok");
    expect(budgetTone({ level: "none", released: false })).toBe("ok");
    expect(budgetTone({ level: "warn", released: false })).toBe("warn");
    expect(budgetTone({ level: "exceeded", released: false })).toBe("paused");
    expect(budgetTone({ level: "exceeded", released: true })).toBe("released");
  });

  it("reads the dollar rate: empty is the default, zero or words are refused", () => {
    expect(rateFromField("")).toBeNull();
    expect(rateFromField("5,25")).toBe(5.25);
    expect(rateFromField("0")).toBeUndefined();
    expect(rateFromField("x")).toBeUndefined();
  });

  it("sends the rules the editor holds, a threshold only on a bulk send, and nothing while one is not a number", () => {
    const drafts: RuleDraft[] = [
      { key: "r1", id: "r1", trigger: "bulk-send", threshold: " 30 " },
      { key: "draft-1", trigger: "deploy", threshold: "50" },
    ];
    expect(rulesFromDrafts(drafts)).toEqual([{ id: "r1", trigger: "bulk-send", threshold: 30 }, { trigger: "deploy" }]);
    expect(rulesFromDrafts([{ ...drafts[0]!, threshold: "muitos" }])).toBeUndefined();
    expect(ruleDraftsOf([{ id: "r9", trigger: "publish" }])).toEqual([{ key: "r9", id: "r9", trigger: "publish", threshold: "50" }]);
  });
});
