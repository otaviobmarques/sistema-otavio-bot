import type { CompanyApprovalCardField, CompanyRule, CompanyRuleTrigger } from "../../shared/companies";
import { t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";

const RULE_SHORT: Record<CompanyRuleTrigger, LocaleKey> = {
  "bulk-send": "companies.ruleShort.bulkSend",
  publish: "companies.ruleShort.publish",
  payment: "companies.ruleShort.payment",
  deploy: "companies.ruleShort.deploy",
};

/** A rule in a few words, as an approval card names it. */
export const ruleShortLabel = (rule: Pick<CompanyRule, "trigger" | "threshold">): string => t(RULE_SHORT[rule.trigger], { count: rule.threshold ?? 0 });

/** Which company asks, and by which of its rules or its budget; null on a card no company put there. */
export function companyApprovalLine(card: CompanyApprovalCardField | undefined): string | null {
  const approval = card?.companyApproval;
  if (!approval) return null;
  if (approval.kind === "budget") return t("approval.company.budget", { company: approval.company });
  return t("approval.company.rule", { company: approval.company, rules: approval.rules.map(ruleShortLabel).join(", ") });
}
