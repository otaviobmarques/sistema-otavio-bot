import { Bot as BotIcon, Plus, ShieldCheck, X } from "lucide-react";
import {
  COMPANY_RULE_CHECK,
  COMPANY_RULE_MAX,
  COMPANY_RULE_TRIGGERS,
  DEFAULT_BULK_SEND_THRESHOLD,
  type CompanyRule,
  type CompanyRuleTrigger,
} from "../../../shared/companies";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";
import { inputCls } from "../bot-settings/field";
import { Select } from "../Select";

/** A rule as the editor holds it: `key` tells rows apart before the server gives a new one its id. */
export interface RuleDraft {
  key: string;
  id?: string;
  trigger: CompanyRuleTrigger;
  threshold: string;
}

export const RULE_LABEL: Record<CompanyRuleTrigger, LocaleKey> = {
  "bulk-send": "companies.rule.bulkSend",
  publish: "companies.rule.publish",
  payment: "companies.rule.payment",
  deploy: "companies.rule.deploy",
};

let drafted = 0;
export const ruleDraftsOf = (rules: readonly CompanyRule[]): RuleDraft[] =>
  rules.map((rule) => ({ key: rule.id, id: rule.id, trigger: rule.trigger, threshold: String(rule.threshold ?? DEFAULT_BULK_SEND_THRESHOLD) }));

/** A whole number of zero or more; undefined when the field holds anything else. */
export function thresholdFromField(text: string): number | undefined {
  const trimmed = text.trim();
  return /^\d{1,7}$/.test(trimmed) ? Number(trimmed) : undefined;
}

/** The rules as the server takes them, or undefined while a threshold is not a number. */
export function rulesFromDrafts(drafts: readonly RuleDraft[]): Array<Omit<CompanyRule, "id"> & { id?: string }> | undefined {
  const rules: Array<Omit<CompanyRule, "id"> & { id?: string }> = [];
  for (const draft of drafts) {
    const threshold = draft.trigger === "bulk-send" ? thresholdFromField(draft.threshold) : undefined;
    if (draft.trigger === "bulk-send" && threshold === undefined) return undefined;
    rules.push({ ...(draft.id ? { id: draft.id } : {}), trigger: draft.trigger, ...(threshold !== undefined ? { threshold } : {}) });
  }
  return rules;
}

function CheckBadge({ trigger }: { trigger: CompanyRuleTrigger }) {
  const app = COMPANY_RULE_CHECK[trigger] === "app";
  return (
    <span data-rule-check={COMPANY_RULE_CHECK[trigger]} title={t(app ? "companies.ruleAppHint" : "companies.ruleBotHint")}
      className={cn("flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]", app ? "border-success/60 text-success" : "border-hairline text-ink-secondary")}>
      {app ? <ShieldCheck size={12} aria-hidden="true" /> : <BotIcon size={12} aria-hidden="true" />}
      {t(app ? "companies.ruleApp" : "companies.ruleBot")}
    </span>
  );
}

export function CompanyRulesEditor({ rules, disabled, onChange }: { rules: RuleDraft[]; disabled: boolean; onChange: (rules: RuleDraft[]) => void }) {
  const change = (key: string, patch: Partial<RuleDraft>) => onChange(rules.map((rule) => (rule.key === key ? { ...rule, ...patch } : rule)));
  const used = new Set(rules.map((rule) => rule.trigger));
  const add = () => {
    const trigger = COMPANY_RULE_TRIGGERS.find((one) => !used.has(one)) ?? "bulk-send";
    onChange([...rules, { key: `draft-${++drafted}`, trigger, threshold: String(DEFAULT_BULK_SEND_THRESHOLD) }]);
  };
  return (
    <fieldset disabled={disabled} data-company-rules-editor="">
      <legend className="mb-0.5 text-[13px] text-ink-secondary">{t("companies.rules")}</legend>
      <p className="mb-2 text-[12px] text-ink-tertiary">{t("companies.rulesIntro")}</p>
      {rules.length === 0 && <p className="mb-2 text-[13px] text-ink-tertiary">{t("companies.rulesNone")}</p>}
      <ul className="space-y-2">
        {rules.map((rule) => (
          <li key={rule.key} data-company-rule={rule.trigger} className="rounded-lg bg-inset px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-ink-tertiary">{t("companies.ruleTrigger")}</span>
              <Select value={rule.trigger} aria-label={t("companies.ruleTrigger")} onChange={(event) => change(rule.key, { trigger: event.target.value as CompanyRuleTrigger })}
                className="min-w-0 flex-1">
                {COMPANY_RULE_TRIGGERS.map((trigger) => <option key={trigger} value={trigger}>{t(RULE_LABEL[trigger])}</option>)}
              </Select>
              <button type="button" onClick={() => onChange(rules.filter((one) => one.key !== rule.key))} aria-label={t("companies.ruleRemove")} title={t("companies.ruleRemove")}
                className="rounded p-1 text-ink-tertiary hover:bg-raised hover:text-ink"><X size={14} /></button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
              {rule.trigger === "bulk-send" && <>
                <span className="text-ink-secondary">{t("companies.ruleMoreThan")}</span>
                <input value={rule.threshold} inputMode="numeric" aria-label={t("companies.ruleContacts")} aria-invalid={thresholdFromField(rule.threshold) === undefined}
                  onChange={(event) => change(rule.key, { threshold: event.target.value })} className={cn(inputCls, "w-20 py-1 tabular-nums")} />
                <span className="text-ink-secondary">{t("companies.ruleContacts")}</span>
              </>}
              <span className="font-medium text-ink">{t("companies.ruleAction")}</span>
              <span className="ml-auto"><CheckBadge trigger={rule.trigger} /></span>
            </div>
          </li>
        ))}
      </ul>
      {rules.length > 0 && <div data-company-rules-legend="" className="mt-2 space-y-1 text-[12px] leading-[17px] text-ink-tertiary">
        <p className="flex items-start gap-1.5"><ShieldCheck size={12} aria-hidden="true" className="mt-[3px] shrink-0 text-success" />{t("companies.rulesLegendApp")}</p>
        <p className="flex items-start gap-1.5"><BotIcon size={12} aria-hidden="true" className="mt-[3px] shrink-0" />{t("companies.rulesLegendBot")}</p>
      </div>}
      {rules.length < COMPANY_RULE_MAX && <button type="button" data-company-rule-add="" onClick={add}
        className="mt-2 flex items-center gap-1.5 rounded-lg border border-dashed border-hairline px-2.5 py-1.5 text-[13px] text-accent hover:bg-raised/60">
        <Plus size={14} />{t("companies.ruleAdd")}
      </button>}
    </fieldset>
  );
}
