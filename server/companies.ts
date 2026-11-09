import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  COMPANY_BUDGET_MAX_BRL,
  COMPANY_COLOR,
  COMPANY_DEFAULT_COLOR,
  COMPANY_MAX,
  COMPANY_MISSION_MAX,
  COMPANY_NAME_MAX,
  COMPANY_RULE_MAX,
  COMPANY_RULE_THRESHOLD_MAX,
  COMPANY_RULE_TRIGGERS,
  COMPANY_SECTOR_MAX,
  DEFAULT_BULK_SEND_THRESHOLD,
  USD_TO_BRL_MAX,
  type Company,
  type CompanyRule,
} from "../shared/companies.ts";
import { changeCompanies, readCompanies, type CompanyRecord } from "./section-context.ts";
import { userError, type UserError, type UserErrorKey } from "./user-errors.ts";

const plainLine = (max: number) => z.string().trim().max(max).refine((text) => ![...text].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127));
const departmentIds = z.array(z.string().trim().min(1).max(60)).max(200);

/** A rule as the editor sends it: a new one has no id yet, and only a bulk send has a threshold. */
const ruleInput = z.object({
  id: z.string().regex(/^[\w-]{1,64}$/).optional(),
  trigger: z.enum(COMPANY_RULE_TRIGGERS),
  threshold: z.number().int().min(0).max(COMPANY_RULE_THRESHOLD_MAX).optional(),
}).strict().transform((rule): CompanyRule => ({
  id: rule.id ?? `rule_${randomUUID().replaceAll("-", "").slice(0, 12)}`,
  trigger: rule.trigger,
  ...(rule.trigger === "bulk-send" ? { threshold: rule.threshold ?? DEFAULT_BULK_SEND_THRESHOLD } : {}),
}));

const companyFields = {
  name: plainLine(COMPANY_NAME_MAX).pipe(z.string().min(1)),
  sector: plainLine(COMPANY_SECTOR_MAX),
  mission: plainLine(COMPANY_MISSION_MAX),
  color: z.string().regex(COMPANY_COLOR).transform((color) => color.toUpperCase()),
  monthlyBudgetBrl: z.number().finite().min(0).max(COMPANY_BUDGET_MAX_BRL).nullable(),
  usdToBrl: z.number().finite().positive().max(USD_TO_BRL_MAX).nullable(),
  rules: z.array(ruleInput).max(COMPANY_RULE_MAX),
  departmentIds,
};

export const companyCreateSchema = z.object({
  ...companyFields,
  sector: companyFields.sector.default(""),
  mission: companyFields.mission.default(""),
  color: companyFields.color.default(COMPANY_DEFAULT_COLOR),
  monthlyBudgetBrl: companyFields.monthlyBudgetBrl.default(null),
  usdToBrl: companyFields.usdToBrl.default(null),
  rules: companyFields.rules.default([]),
  departmentIds: departmentIds.default([]),
}).strict();

export const companyPatchSchema = z.object(companyFields).partial().strict();

export const companyOrderSchema = z.object({ companyIds: z.array(z.string()).max(COMPANY_MAX) }).strict();

export const departmentMoveSchema = z.object({ department: z.string().trim().min(1).max(60), companyId: z.string().nullable() }).strict();

export type CompanyOutcome = { ok: true; companies: Company[]; company?: Company } | { ok: false; status: number; refusal: UserError };

const refused = (status: number, key: UserErrorKey): CompanyOutcome => ({ ok: false, status, refusal: userError(key) });

export const wireCompanies = (records: readonly CompanyRecord[]): Company[] => records.map((record, order) => ({ ...record, order }));

export function listCompanies(): Company[] {
  return wireCompanies(readCompanies());
}

/** Gives `departments` to `ownerId`, taking them from whichever company held them. */
function withDepartments(companies: CompanyRecord[], ownerId: string, departments: readonly string[]): CompanyRecord[] {
  const moving = new Set(departments);
  return companies.map((company) => company.id === ownerId
    ? { ...company, departmentIds: [...new Set(departments)] }
    : { ...company, departmentIds: company.departmentIds.filter((department) => !moving.has(department)) });
}

const sameName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;

/** Runs one change against the saved companies; a refusal leaves the file untouched. */
function change(apply: (companies: CompanyRecord[], sections: readonly string[]) => CompanyRecord[] | UserErrorKey, focus?: string): CompanyOutcome {
  const outcome: { refusal?: UserErrorKey } = {};
  const saved = changeCompanies((companies, sections) => {
    const next = apply(companies, sections);
    if (typeof next !== "string") return next;
    outcome.refusal = next;
    return companies;
  });
  const { refusal } = outcome;
  if (refusal) return refused(refusal === "serverError.company.notFound" ? 404 : 409, refusal);
  const companies = wireCompanies(saved);
  const company = focus ? companies.find((one) => one.id === focus) : undefined;
  return { ok: true, companies, ...(company ? { company } : {}) };
}

const unknownDepartment = (departments: readonly string[], sections: readonly string[]) => departments.some((department) => !sections.includes(department));

export function createCompany(input: z.infer<typeof companyCreateSchema>): CompanyOutcome {
  const id = `co_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  return change((companies, sections) => {
    if (companies.length >= COMPANY_MAX) return "serverError.company.tooMany";
    if (companies.some((company) => sameName(company.name, input.name))) return "serverError.company.duplicate";
    if (unknownDepartment(input.departmentIds, sections)) return "serverError.company.departmentMissing";
    const { departmentIds: departments, ...fields } = input;
    return withDepartments([...companies, { id, ...fields, budgetReleasedMonth: null, departmentIds: [] }], id, departments);
  }, id);
}

export function updateCompany(id: string, patch: z.infer<typeof companyPatchSchema>): CompanyOutcome {
  return change((companies, sections) => {
    const current = companies.find((company) => company.id === id);
    if (!current) return "serverError.company.notFound";
    if (patch.name !== undefined && companies.some((company) => company.id !== id && sameName(company.name, patch.name!))) return "serverError.company.duplicate";
    if (patch.departmentIds && unknownDepartment(patch.departmentIds, sections)) return "serverError.company.departmentMissing";
    const { departmentIds: departments, ...fields } = patch;
    const next = companies.map((company) => company.id === id ? { ...company, ...fields } : company);
    return departments ? withDepartments(next, id, departments) : next;
  }, id);
}

/** Its departments stay, in no company. */
export function deleteCompany(id: string): CompanyOutcome {
  return change((companies) => companies.some((company) => company.id === id)
    ? companies.filter((company) => company.id !== id)
    : "serverError.company.notFound");
}

/** `companyIds` must name every company once: the floors from the top down. */
export function orderCompanies(companyIds: readonly string[]): CompanyOutcome {
  return change((companies) => {
    const byId = new Map(companies.map((company) => [company.id, company]));
    if (companyIds.length !== companies.length || new Set(companyIds).size !== companyIds.length || companyIds.some((id) => !byId.has(id))) {
      return "serverError.company.orderChanged";
    }
    return companyIds.map((id) => byId.get(id)!);
  });
}

/** Moves a department into a company, or out of every company with `companyId` null. */
export function moveDepartment(department: string, companyId: string | null): CompanyOutcome {
  return change((companies, sections) => {
    if (!sections.includes(department)) return "serverError.company.departmentMissing";
    if (companyId === null) return companies.map((company) => ({ ...company, departmentIds: company.departmentIds.filter((one) => one !== department) }));
    const target = companies.find((company) => company.id === companyId);
    if (!target) return "serverError.company.notFound";
    return withDepartments(companies, companyId, [...target.departmentIds.filter((one) => one !== department), department]);
  }, companyId ?? undefined);
}

/** Lets the company's bots keep spending past its budget until `month` (`YYYY-MM`) ends. */
export function releaseCompanyBudget(id: string, month: string): CompanyOutcome {
  return change((companies) => companies.some((company) => company.id === id)
    ? companies.map((company) => company.id === id ? { ...company, budgetReleasedMonth: month } : company)
    : "serverError.company.notFound", id);
}
