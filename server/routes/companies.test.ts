import { readFileSync, rmSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { beforeEach, describe, expect, it } from "vitest";

import type { Company } from "../../shared/companies.ts";
import { frameForMember } from "../bot-visibility.ts";
import { requiredScope } from "../request-auth.ts";
import { changeEmptySection, ensureSections, readSections, SECTION_CONTEXTS_FILE } from "../section-context.ts";
import { createCompanyRoutes } from "./companies.ts";
import { PASS } from "./table.ts";

const RED = { name: "RedBox", sector: "Agência de Marketing", mission: "Campanhas com CPA menor.", color: "#ff2d33", monthlyBudgetBrl: 500 };

function world(visible: readonly string[] | null = null) {
  const told: Company[][] = [];
  const routes = createCompanyRoutes({
    visibleSections: () => visible ?? readSections(),
    changed: (companies) => { told.push(companies); },
  });
  const call = async (method: string, path: string, body?: unknown) => {
    let status = 0, answer: Record<string, unknown> | undefined;
    const json = (_res: unknown, code: number, value: unknown) => { status = code; answer = value as Record<string, unknown>; };
    const out = await routes({
      req: {} as never, res: {} as ServerResponse, url: new URL(`http://x${path}`), path, method, auth: {} as never,
      json: json as never, readBody: (async () => body) as never,
    });
    return { out, status, answer: answer as { companies: Company[]; company?: Company; errorKey?: string } };
  };
  return { call, told };
}

beforeEach(() => {
  rmSync(SECTION_CONTEXTS_FILE, { force: true });
  ensureSections(["Tráfego pago", "Criação", "Edição"]);
});

describe("companies over HTTP", () => {
  it("are read by anyone signed in here and changed only by an admin, as departments are", () => {
    expect(requiredScope("GET", "/api/companies")).toBe("client");
    for (const [method, path] of [["POST", "/api/companies"], ["PATCH", "/api/companies/co_0123456789abcdef"], ["DELETE", "/api/companies/co_0123456789abcdef"],
      ["PUT", "/api/companies/order"], ["PUT", "/api/companies/departments"]] as const) {
      expect(requiredScope(method, path), `${method} ${path}`).toBe("admin");
    }
    expect(requiredScope("POST", "/api/sidebar-sections")).toBe("admin");
  });

  it("creates a company with its departments, saved beside them, and tells every page", async () => {
    const { call, told } = world();
    const created = await call("POST", "/api/companies", { ...RED, departmentIds: ["Tráfego pago", "Criação"] });
    expect(created.status).toBe(201);
    expect(created.answer.company).toMatchObject({ name: "RedBox", color: "#FF2D33", monthlyBudgetBrl: 500, order: 0, departmentIds: ["Tráfego pago", "Criação"] });
    expect(created.answer.company!.id).toMatch(/^co_[0-9a-f]{16}$/);
    const saved = JSON.parse(readFileSync(SECTION_CONTEXTS_FILE, "utf8"));
    expect(saved.sections).toEqual(["Tráfego pago", "Criação", "Edição"]);
    expect(saved.companies).toEqual([{ id: created.answer.company!.id, name: "RedBox", sector: "Agência de Marketing", mission: "Campanhas com CPA menor.",
      color: "#FF2D33", monthlyBudgetBrl: 500, departmentIds: ["Tráfego pago", "Criação"] }]);
    expect(told).toEqual([created.answer.companies]);
    expect((await call("GET", "/api/companies")).answer.companies).toEqual(created.answer.companies);
  });

  it("keeps each department in one company: moving it takes it from the other", async () => {
    const { call } = world();
    const red = (await call("POST", "/api/companies", { ...RED, departmentIds: ["Tráfego pago", "Criação"] })).answer.company!;
    const vertice = (await call("POST", "/api/companies", { name: "Vertice", color: "#00E5A0", departmentIds: ["Edição", "Criação"] })).answer.company!;
    expect(vertice).toMatchObject({ sector: "", mission: "", monthlyBudgetBrl: null, order: 1, departmentIds: ["Edição", "Criação"] });
    let companies = (await call("GET", "/api/companies")).answer.companies;
    expect(companies.find((one) => one.id === red.id)!.departmentIds).toEqual(["Tráfego pago"]);

    companies = (await call("PUT", "/api/companies/departments", { department: "Tráfego pago", companyId: vertice.id })).answer.companies;
    expect(companies.map((one) => one.departmentIds)).toEqual([[], ["Edição", "Criação", "Tráfego pago"]]);
    companies = (await call("PUT", "/api/companies/departments", { department: "Criação", companyId: null })).answer.companies;
    expect(companies.map((one) => one.departmentIds)).toEqual([[], ["Edição", "Tráfego pago"]]);
    expect((await call("PUT", "/api/companies/departments", { department: "Nowhere", companyId: vertice.id })).answer.errorKey).toBe("serverError.company.departmentMissing");
  });

  it("edits, reorders and deletes; a deleted company's departments stay, in no company", async () => {
    const { call } = world();
    const red = (await call("POST", "/api/companies", { ...RED, departmentIds: ["Criação"] })).answer.company!;
    const food = (await call("POST", "/api/companies", { name: "FoodX", color: "#FF8A1F" })).answer.company!;
    const edited = await call("PATCH", `/api/companies/${red.id}`, { mission: "Peças novas toda semana.", monthlyBudgetBrl: null });
    expect(edited.answer.company).toMatchObject({ name: "RedBox", mission: "Peças novas toda semana.", monthlyBudgetBrl: null, departmentIds: ["Criação"] });
    const ordered = await call("PUT", "/api/companies/order", { companyIds: [food.id, red.id] });
    expect(ordered.answer.companies.map((one) => [one.name, one.order])).toEqual([["FoodX", 0], ["RedBox", 1]]);
    expect((await call("PUT", "/api/companies/order", { companyIds: [food.id] })).answer.errorKey).toBe("serverError.company.orderChanged");
    expect((await call("DELETE", `/api/companies/${red.id}`)).answer.companies.map((one) => one.name)).toEqual(["FoodX"]);
    expect(readSections()).toContain("Criação");
    expect((await call("DELETE", `/api/companies/${red.id}`)).status).toBe(404);
  });

  it("refuses a bad company in plain words and leaves the saved ones alone", async () => {
    const { call, told } = world();
    await call("POST", "/api/companies", RED);
    for (const body of [{ ...RED, name: "redbox" }, { name: "  " }, { name: "X", color: "red" }, { name: "X", monthlyBudgetBrl: -1 },
      { name: "X", departmentIds: ["Nowhere"] }, { name: "X", owner: "me" }, undefined]) {
      const refused = await call("POST", "/api/companies", body);
      expect(refused.status, JSON.stringify(body)).toBeGreaterThanOrEqual(400);
      expect(refused.answer.errorKey).toMatch(/^serverError\.company\./);
    }
    expect((await call("GET", "/api/companies")).answer.companies.map((one) => one.name)).toEqual(["RedBox"]);
    expect(told).toHaveLength(1);
    expect((await call("PATCH", "/api/companies/nope", { name: "Y" })).status).toBe(404);
    expect((await call("GET", "/api/elsewhere")).out).toBe(PASS);
  });

  it("follows a department's rename and drops a deleted one", async () => {
    const { call } = world();
    await call("POST", "/api/companies", { ...RED, departmentIds: ["Tráfego pago", "Criação"] });
    changeEmptySection("Criação", "Design");
    changeEmptySection("Tráfego pago", null);
    expect((await call("GET", "/api/companies")).answer.companies[0]!.departmentIds).toEqual(["Design"]);
  });

  it("shows a member only the departments they see, and no company left with none", async () => {
    const { call } = world(["Edição"]);
    await call("POST", "/api/companies", { ...RED, departmentIds: ["Tráfego pago"] });
    await call("POST", "/api/companies", { name: "Vertice", departmentIds: ["Edição", "Criação"] });
    await call("POST", "/api/companies", { name: "Domma" });
    const shown = (await call("GET", "/api/companies")).answer.companies;
    expect(shown.map((one) => [one.name, one.departmentIds])).toEqual([["Vertice", ["Edição"]], ["Domma", []]]);

    const all = world().call;
    const companies = (await all("GET", "/api/companies")).answer.companies;
    const visible = { sections: (names: readonly string[]) => names.filter((name) => name === "Edição") };
    const frame = frameForMember({ kind: "companies", companies }, { visible } as never, {} as never) as { companies: Company[] };
    expect(frame.companies.map((one) => one.name)).toEqual(["Vertice", "Domma"]);
  });
});
