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
  /** What the company may spend on AI in a month, in Brazilian reais; null when it has no budget. Its bots stop starting
   * turns once the month's spend reaches it, until the owner raises it or releases the month. */
  monthlyBudgetBrl: number | null;
  /** Reais per US dollar for turning the usage ledger's dollars into this budget; null for `DEFAULT_USD_TO_BRL`. */
  usdToBrl: number | null;
  /** The month (`YYYY-MM`, UTC) the owner let this company keep spending past its budget; null when none. */
  budgetReleasedMonth: string | null;
  /** What its bots ask the owner before doing. */
  rules: CompanyRule[];
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
  usdToBrl?: number | null;
  /** The whole list; a new rule comes without an id and gets one. */
  rules?: Array<Omit<CompanyRule, "id"> & { id?: string }>;
  departmentIds?: string[];
}

/** What a rule watches for. `bulk-send`: a send through a connected app to more than `threshold` people; `publish`: a
 * post, publication or share through one; `payment`: a payment, charge, purchase, refund or transfer through one;
 * `deploy`: a change to production or a deploy. */
export const COMPANY_RULE_TRIGGERS = ["bulk-send", "publish", "payment", "deploy"] as const;
export type CompanyRuleTrigger = typeof COMPANY_RULE_TRIGGERS[number];

/** One approval rule: before what `trigger` names, a bot of the company asks the owner. */
export interface CompanyRule {
  id: string;
  trigger: CompanyRuleTrigger;
  /** `bulk-send` only: how many recipients a send may reach without asking. */
  threshold?: number;
}

/** Who enforces a rule. "app": the app holds the action on an approval card before it runs (actions through connected
 * apps). "bot": nothing in the app sees the action, so the rule reaches the bot as an instruction only. */
export const COMPANY_RULE_CHECK: Readonly<Record<CompanyRuleTrigger, "app" | "bot">> = {
  "bulk-send": "app",
  publish: "app",
  payment: "app",
  deploy: "bot",
};

export const COMPANY_RULE_MAX = 20;
export const COMPANY_RULE_THRESHOLD_MAX = 1_000_000;
export const DEFAULT_BULK_SEND_THRESHOLD = 50;

/** On an approval card a company's rule or budget put there: which company, and why. */
export interface CompanyApprovalCardField {
  companyApproval?:
    | { kind: "rule"; companyId: string; company: string; rules: CompanyRule[] }
    | { kind: "budget"; companyId: string; company: string; month: string };
}

export const DEFAULT_USD_TO_BRL = 5.5;
export const USD_TO_BRL_MAX = 1_000;
/** The share of the budget at which the owner is warned, once a month. */
export const COMPANY_BUDGET_WARN_PERCENT = 80;

/** "none": no budget; "ok": under the warning share; "warn": at or over it; "exceeded": the budget is spent. */
export type CompanyBudgetLevel = "none" | "ok" | "warn" | "exceeded";

/** A company's spend this month, as GET /api/companies/spend lists it. */
export interface CompanySpend {
  companyId: string;
  /** `YYYY-MM`, UTC, as the usage ledger keeps months. */
  month: string;
  spentUsd: number;
  spentBrl: number;
  budgetBrl: number | null;
  usdToBrl: number;
  /** Whole percent of the budget spent, at most 999; 0 without a budget. */
  percent: number;
  level: CompanyBudgetLevel;
  /** The budget is spent and the owner released the month: its bots carry on anyway. */
  released: boolean;
}

export const usdToBrlOf = (company: Pick<Company, "usdToBrl">): number => company.usdToBrl ?? DEFAULT_USD_TO_BRL;

/** A budget of zero is spent by the first paid turn. */
export function companySpendOf(company: Pick<Company, "id" | "monthlyBudgetBrl" | "usdToBrl" | "budgetReleasedMonth">, spentUsd: number, month: string): CompanySpend {
  const usdToBrl = usdToBrlOf(company);
  const spent = Math.max(0, spentUsd);
  const spentBrl = spent * usdToBrl;
  const budgetBrl = company.monthlyBudgetBrl;
  const base = { companyId: company.id, month, spentUsd: spent, spentBrl, budgetBrl, usdToBrl };
  if (budgetBrl === null) return { ...base, percent: 0, level: "none", released: false };
  const exceeded = budgetBrl > 0 ? spentBrl >= budgetBrl : spentBrl > 0;
  const percent = budgetBrl > 0 ? Math.min(999, Math.floor((spentBrl / budgetBrl) * 100)) : exceeded ? 999 : 0;
  const level: CompanyBudgetLevel = exceeded ? "exceeded" : percent >= COMPANY_BUDGET_WARN_PERCENT ? "warn" : "ok";
  return { ...base, percent, level, released: exceeded && company.budgetReleasedMonth === month };
}

/** Its bots start no new turn: the budget is spent and the owner has not released the month. */
export const companyPaused = (spend: Pick<CompanySpend, "level" | "released">): boolean => spend.level === "exceeded" && !spend.released;

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
