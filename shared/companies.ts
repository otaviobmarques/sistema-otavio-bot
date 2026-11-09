/** One of the owner's companies: a floor of the Building whose rooms are departments. */
export interface Company {
  id: string;
  name: string;
  /** What the company does, shown beside its name ("Agência de Marketing"). */
  sector: string;
  /** One sentence the company's bots work towards. */
  mission: string;
  /** `#rrggbb`: the floor's stripe and the company's dot. */
  color: string;
  /** What the company may spend on AI in a month, in Brazilian reais; null when it has no budget. */
  monthlyBudgetBrl: number | null;
  /** The floor's place in the Building, 0 for the top floor under the board room. */
  order: number;
  /** Its departments, by name: a department's name is its id in this workspace. A department is in one company at most. */
  departmentIds: string[];
}

/** What the person sends to create a company; every field but the name may be left out. */
export interface CompanyInput {
  name: string;
  sector?: string;
  mission?: string;
  color?: string;
  monthlyBudgetBrl?: number | null;
  departmentIds?: string[];
}

/** The whole list, sent to every open page when a company changes. A page also reloads it on any `sections` frame,
 * because renaming or deleting a department changes the companies that hold it. */
export interface CompaniesFrame {
  kind: "companies";
  companies: Company[];
}

export const COMPANY_NAME_MAX = 60;
export const COMPANY_SECTOR_MAX = 80;
export const COMPANY_MISSION_MAX = 280;
export const COMPANY_MAX = 40;
export const COMPANY_BUDGET_MAX_BRL = 100_000_000;
export const COMPANY_COLOR = /^#[0-9a-f]{6}$/i;
export const COMPANY_DEFAULT_COLOR = "#7B61FF";

/** The companies as a person who sees only `departments` sees them: departments they can't see are left out, and so is
 * a company left with none of its departments. */
export function companiesSeenWith(companies: readonly Company[], departments: readonly string[]): Company[] {
  const seen = new Set(departments);
  return companies.flatMap((company) => {
    const departmentIds = company.departmentIds.filter((id) => seen.has(id));
    if (departmentIds.length === company.departmentIds.length) return [company];
    return departmentIds.length ? [{ ...company, departmentIds }] : [];
  });
}
