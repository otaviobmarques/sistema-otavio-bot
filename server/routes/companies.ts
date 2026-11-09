import { companiesSeenWith, type Company } from "../../shared/companies.ts";
import {
  companyCreateSchema,
  companyOrderSchema,
  companyPatchSchema,
  createCompany,
  deleteCompany,
  departmentMoveSchema,
  listCompanies,
  moveDepartment,
  orderCompanies,
  updateCompany,
  type CompanyOutcome,
} from "../companies.ts";
import type { RequestAuth } from "../request-auth.ts";
import { userError } from "../user-errors.ts";
import { PASS, type RouteHandler } from "./table.ts";

export const COMPANIES_PATH = "/api/companies";
const COMPANY = /^\/api\/companies\/(co_[0-9a-f]{16})$/;

export interface CompanyRouteDeps {
  /** The departments this viewer sees; a company shows them only those. */
  visibleSections(auth: RequestAuth): readonly string[];
  /** Tells every open page the companies changed. */
  changed(companies: Company[]): void;
}

/** GET /api/companies lists the companies, top floor first. POST creates one; PATCH and DELETE /api/companies/<id> change
 * or remove one (its departments stay, in no company); PUT /api/companies/order reorders the floors and PUT
 * /api/companies/departments moves one department into a company or out of all of them. */
export function createCompanyRoutes(deps: CompanyRouteDeps): RouteHandler {
  return async ({ req, res, path, method, auth, json, readBody }) => {
    if (path !== COMPANIES_PATH && !path.startsWith(`${COMPANIES_PATH}/`)) return PASS;
    const answer = (outcome: CompanyOutcome, status = 200) => {
      if (!outcome.ok) return json(res, outcome.status, outcome.refusal);
      deps.changed(outcome.companies);
      return json(res, status, { companies: outcome.companies, ...(outcome.company ? { company: outcome.company } : {}) });
    };
    const body = async () => {
      try {
        return await readBody(req);
      } catch {
        return undefined;
      }
    };
    const invalid = () => json(res, 400, userError("serverError.company.invalid"));

    if (path === COMPANIES_PATH) {
      if (method === "GET") return json(res, 200, { companies: companiesSeenWith(listCompanies(), deps.visibleSections(auth)) });
      if (method !== "POST") return json(res, 405, { error: "method not allowed" });
      const parsed = companyCreateSchema.safeParse(await body());
      return parsed.success ? answer(createCompany(parsed.data), 201) : invalid();
    }
    if (path === `${COMPANIES_PATH}/order`) {
      if (method !== "PUT") return json(res, 405, { error: "method not allowed" });
      const parsed = companyOrderSchema.safeParse(await body());
      return parsed.success ? answer(orderCompanies(parsed.data.companyIds)) : invalid();
    }
    if (path === `${COMPANIES_PATH}/departments`) {
      if (method !== "PUT") return json(res, 405, { error: "method not allowed" });
      const parsed = departmentMoveSchema.safeParse(await body());
      return parsed.success ? answer(moveDepartment(parsed.data.department, parsed.data.companyId)) : invalid();
    }
    const id = COMPANY.exec(path)?.[1];
    if (!id) return json(res, 404, userError("serverError.company.notFound"));
    if (method === "DELETE") return answer(deleteCompany(id));
    if (method !== "PATCH") return json(res, 405, { error: "method not allowed" });
    const parsed = companyPatchSchema.safeParse(await body());
    return parsed.success ? answer(updateCompany(id, parsed.data)) : invalid();
  };
}
