import { describe, expect, it } from "vitest";
import type { Company } from "../../../../shared/companies";
import type { Bot } from "@/state/store";
import { buildingFloors } from "../building-floors";
import { buildingRooms, type DeskStatus } from "../building-view";
import { liveLayout, outfitFor, seatingKey } from "./live-model";
import { computeHomes, desksOf, zonesFor } from "./sim";

const bot = (id: string, extra: Partial<Bot> = {}): Bot => ({
  id, name: id[0]!.toUpperCase() + id.slice(1), threadId: `${id}-main`, title: "Designer", description: "", notifications: true, color: "blue",
  unread: false, messages: [], modelSelection: { instanceId: "claude", model: "sonnet" }, ...extra,
} as Bot);

const company = (id: string, name: string, order: number, departmentIds: string[], color = "#e11d48"): Company => ({
  id, name, sector: `${name} sector`, mission: "", color, monthlyBudgetBrl: null, usdToBrl: null, budgetReleasedMonth: null, rules: [], order, departmentIds,
});

const names = { presidency: "Presidency", boardRoom: "Board room", reception: "Reception", receptionLine: "Requests come in", noCompany: "No company", general: "General" };

function layoutOf(bots: Bot[], companies: Company[], departments: string[], status: Record<string, DeskStatus> = {}, lines: Record<string, string> = {}) {
  const floors = buildingFloors(buildingRooms(bots, departments), companies);
  return liveLayout(floors, { status: new Map(Object.entries(status)), lines: new Map(Object.entries(lines)), names });
}

describe("the live Building's layout", () => {
  const companies = [company("co_red", "RedBox", 0, ["Criação", "Mídia"]), company("co_food", "FoodX", 1, ["Comercial"], "#f97316")];
  const bots = [
    bot("duda", { section: "Criação" }), bot("rui", { section: "Mídia" }), bot("bia", { section: "Comercial" }),
    bot("tavinho", { chiefOfStaff: true }), bot("solto"),
  ];

  it("stacks the ground floor, the companies in the owner's order with the first on top, and the penthouse", () => {
    const layout = layoutOf(bots, companies, ["Criação", "Mídia", "Comercial"]);
    expect(layout.levels.map((level) => [level.level, level.kind, level.name])).toEqual([
      [0, "office", "No company"], [1, "office", "FoodX"], [2, "office", "RedBox"], [3, "penthouse", "Presidency"],
    ]);
    expect(layout.penthouse).toBe(3);
    expect(layout.levels[2]).toMatchObject({ accent: "#e11d48", rooms: ["Criação", "Mídia"], companyId: "co_red", sub: "RedBox sector" });
    expect(layout.levels[2]!.face).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("seats each bot in its room on its company's floor, and a Chief of Staff in no company at the board", () => {
    const layout = layoutOf(bots, companies, ["Criação", "Mídia", "Comercial"]);
    const where = Object.fromEntries(layout.bots.map((b) => [b.id, [b.level, b.room]]));
    expect(where).toEqual({ duda: [2, 0], rui: [2, 1], bia: [1, 0], solto: [0, 0], tavinho: [3, -1] });
  });

  it("keeps the reception on the ground floor when every bot has a company", () => {
    const layout = layoutOf(bots.slice(0, 3), companies, ["Criação", "Mídia", "Comercial"]);
    expect(layout.levels[0]).toMatchObject({ kind: "lobby", name: "Reception", rooms: [] });
  });

  it("carries each bot's desk status, balloon line and figurinha", () => {
    const layout = layoutOf(bots, companies, ["Criação", "Mídia", "Comercial"], { duda: "working", rui: "waiting", bia: "blocked" }, { duda: "Running a command" });
    const byId = new Map(layout.bots.map((b) => [b.id, b]));
    expect(byId.get("duda")).toMatchObject({ status: "working", line: "Running a command", role: "Designer" });
    expect(byId.get("rui")!.status).toBe("waiting");
    expect(byId.get("bia")!.status).toBe("blocked");
    expect(byId.get("solto")).toMatchObject({ status: "idle", line: null });
    expect(byId.get("duda")!.look).toEqual(expect.objectContaining({ head: expect.any(String), eyes: expect.any(String), accessory: expect.any(String) }));
    expect(byId.get("duda")!.palette.accent).toMatch(/^#/);
  });

  it("dresses a bot the same way every time", () => {
    expect(outfitFor("duda")).toEqual(outfitFor("duda"));
  });

  it("changes the seating key only when someone moves, not when a status changes", () => {
    const a = layoutOf(bots, companies, ["Criação", "Mídia", "Comercial"]);
    const b = layoutOf(bots, companies, ["Criação", "Mídia", "Comercial"], { duda: "working" });
    const moved = layoutOf([bot("duda", { section: "Mídia" }), ...bots.slice(1)], companies, ["Criação", "Mídia", "Comercial"]);
    expect(seatingKey(a)).toBe(seatingKey(b));
    expect(seatingKey(a)).not.toBe(seatingKey(moved));
  });
});

describe("where bots sit", () => {
  const companies = [company("co_red", "RedBox", 0, ["A", "B", "C", "D", "E"])];
  const crowd = ["A", "A", "B", "C", "D", "E"].map((section, index) => bot(`b${index}`, { section }));
  const layout = layoutOf([...crowd, bot("chief", { chiefOfStaff: true })], companies, ["A", "B", "C", "D", "E"]);

  it("puts each room's bots at their own desks, side by side, facing their screens", () => {
    const homes = computeHomes(layout);
    const zones = zonesFor(5);
    expect(homes.get("b0")).toMatchObject({ level: 1, zone: 0, z: zones[0]!.seatZ, facing: 0 });
    expect(homes.get("b0")!.x).toBeLessThan(homes.get("b1")!.x);
    expect(homes.get("b4")).toMatchObject({ zone: 3, z: zones[3]!.seatZ });
    const desks = desksOf(layout, 1);
    expect(desks.map((group) => group.desks.map((desk) => desk.botId))).toEqual([["b0", "b1"], ["b2"], ["b3"], ["b4"], ["b5"]]);
  });

  it("gives rooms past the third a row of their own, inside the floor", () => {
    const zones = zonesFor(5);
    expect(zones.slice(3).every((zone) => zone.x0 >= 3.6 && zone.x1 <= 12 && zone.deskZ < 11)).toBe(true);
    expect(zones[3]!.x1).toBeLessThanOrEqual(zones[4]!.x0);
  });

  it("seats the board round the penthouse table, facing it", () => {
    const home = computeHomes(layout).get("chief")!;
    expect(home).toMatchObject({ level: 2, zone: -1 });
    expect(Math.hypot(home.x - 10.2, home.z - 5.0)).toBeCloseTo(2.6, 1);
  });
});
