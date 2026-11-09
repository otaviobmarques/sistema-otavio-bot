// Each company's monthly budget over the usage ledger, and the approvals its rules ask for. A company's spend is what its
// bots spent this month in its departments, the ledger's dollars turned into reais at the company's rate.
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { companyPaused, companySpendOf, type Company, type CompanyApprovalCardField, type CompanySpend } from "../shared/companies.ts";
import { rulesHolding } from "../shared/company-rules.ts";
import type { ConnectorCall } from "../shared/outbound.ts";
import { writeFileAtomic } from "./atomic.ts";
import type { DecisionRow } from "./decision-log.ts";
import { buildNotification, buildSpendNotification, type Notification } from "./notify.ts";
import { serverLine } from "./server-lines.ts";
import { monthToDateSlices, type SpendSlice } from "./spend.ts";
import type { BotRecord, Store } from "./store.ts";

export const COMPANY_BUDGET_TOOL = "company_budget";
const ALERTS_FILE = "company-alerts.json";

type CompanyApproval = NonNullable<CompanyApprovalCardField["companyApproval"]>;

export interface CompanyBudgetDeps {
  dataDir: string;
  companies(): Company[];
  /** Lets the company spend past its budget until the month ends; false when it no longer exists. */
  release(companyId: string, month: string): boolean;
  /** The bot's department now; undefined for General or a bot that is gone. */
  sectionOf(botId: string): string | undefined;
  store(): Pick<Store, "appendMessage" | "messagesFor" | "patchMessage" | "bot">;
  /** The language a line in this conversation is written in. */
  language(threadId: string): string | undefined;
  /** A budget warning, for the owner and admins. */
  alert(notification: Notification): void;
  notify(notification: Notification | null): void;
  decide(row: Omit<DecisionRow, "at">): void;
  now?: () => Date;
}

/** Turns the company's budget refused, with the same code as the workspace cap so every caller stops as it does there. */
export class CompanyBudgetRefusal extends Error {
  readonly status = 409;
  readonly code = "spend_cap";
}

interface Marks { month: string; budgetBrl: number; warn?: true; cap?: true }

function localized<T>(language: string | undefined, make: (locale: string) => T): T {
  try {
    return make(language || "pt-BR");
  } catch {
    return make("pt-BR");
  }
}

const money = (amount: number, language: string | undefined): string =>
  localized(language, (locale) => new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(amount));

/** "2026-11" as "novembro de 2026". */
const monthName = (month: string, language: string | undefined): string =>
  localized(language, (locale) => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-15T00:00:00Z`)));

/** The department a slice of spend belongs to: where its rows were booked, else the bot's department now. */
export function companySpending(companies: readonly Company[], slices: readonly SpendSlice[], sectionOf: (botId: string) => string | undefined, month: string): CompanySpend[] {
  const usd = new Map<string, number>();
  for (const slice of slices) {
    const department = slice.section ?? sectionOf(slice.botId);
    const company = department ? companies.find((one) => one.departmentIds.includes(department)) : undefined;
    if (company) usd.set(company.id, (usd.get(company.id) ?? 0) + slice.costUsd);
  }
  return companies.map((company) => companySpendOf(company, usd.get(company.id) ?? 0, month));
}

/** Which once-a-month notice this spend calls for, given the marks already taken; a cap notice covers the warning. */
export function budgetAlert(spend: CompanySpend, marks: Marks | undefined): "warn" | "cap" | null {
  if (spend.budgetBrl === null || (spend.level !== "warn" && spend.level !== "exceeded")) return null;
  const current = marks && marks.month === spend.month && marks.budgetBrl === spend.budgetBrl ? marks : undefined;
  if (spend.level === "exceeded") return current?.cap ? null : "cap";
  return current?.warn || current?.cap ? null : "warn";
}

export function createCompanyBudgets(deps: CompanyBudgetDeps) {
  const now = deps.now ?? (() => new Date());
  const month = () => now().toISOString().slice(0, 7);
  const alertsPath = join(deps.dataDir, "usage", ALERTS_FILE);
  let marks: Record<string, Marks> | null = null;
  const openCards = new Map<string, { threadId: string; messageId: string }>();

  const readMarks = (): Record<string, Marks> => {
    if (marks) return marks;
    try {
      const value: unknown = JSON.parse(readFileSync(alertsPath, "utf8"));
      marks = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Marks> : {};
    } catch {
      marks = {};
    }
    return marks;
  };
  const saveMarks = () => {
    try {
      mkdirSync(join(deps.dataDir, "usage"), { recursive: true, mode: 0o700 });
      writeFileAtomic(alertsPath, JSON.stringify(marks), { mode: 0o600 });
    } catch (error) {
      console.warn(`company budgets: could not save ${alertsPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const companyOfSection = (section: string | undefined) => section ? deps.companies().find((company) => company.departmentIds.includes(section)) : undefined;

  function spending(): CompanySpend[] {
    return companySpending(deps.companies(), monthToDateSlices(deps.dataDir, now()), deps.sectionOf, month());
  }

  const spendOf = (company: Company) => spending().find((one) => one.companyId === company.id)!;

  function budgetWords(company: Company, spend: CompanySpend, language: string | undefined) {
    return { company: company.name, spent: money(spend.spentBrl, language), budget: money(spend.budgetBrl ?? 0, language), percent: spend.percent, month: monthName(spend.month, language) };
  }

  /** One open release card per company: a paused turn elsewhere points at the same decision. */
  function askRelease(company: Company, spend: CompanySpend, bot: Pick<BotRecord, "id" | "name" | "color">, threadId: string): void {
    const store = deps.store();
    const open = openCards.get(company.id);
    if (open && store.messagesFor(open.threadId).some((line) => line.id === open.messageId && line.card && !line.card.answered && !line.card.dismissed)) return;
    const language = deps.language(threadId);
    const words = budgetWords(company, spend, language);
    const requestId = `company-budget-${randomUUID()}`;
    const companyApproval: CompanyApproval = { kind: "budget", companyId: company.id, company: company.name, month: spend.month };
    const title = serverLine(language, "server.company.budgetCardTitle", words);
    const message = store.appendMessage(threadId, {
      role: "bot", kind: "options", from: { botId: bot.id, name: bot.name, color: bot.color },
      card: {
        title, subtitle: serverLine(language, "server.company.budgetCardBody", words),
        options: [serverLine(language, "server.company.budgetRelease"), serverLine(language, "server.company.budgetKeep")],
        requestId, tool: COMPANY_BUDGET_TOOL, companyApproval,
      },
    });
    openCards.set(company.id, { threadId, messageId: message.id });
    deps.decide({ threadId, requestId, botId: bot.id, botName: bot.name, tool: COMPANY_BUDGET_TOOL, summary: title, decision: "card-shown", source: "company-budget", rule: `company:${company.id}:budget` });
    deps.notify(buildNotification("approval", { id: bot.id, name: bot.name }, threadId, title));
  }

  /** Why this bot may not start a turn in this conversation: its company's budget is spent and the month not released.
   * Asks the owner to release it, once per company while the card is open. */
  function refusal(botId: string, threadId: string): CompanyBudgetRefusal | null {
    const company = companyOfSection(deps.sectionOf(botId));
    if (!company || company.monthlyBudgetBrl === null) return null;
    const spend = spendOf(company);
    if (!companyPaused(spend)) return null;
    const bot = deps.store().bot(botId);
    if (bot) askRelease(company, spend, bot, threadId);
    return new CompanyBudgetRefusal(serverLine(deps.language(threadId), "server.company.budgetPaused", budgetWords(company, spend, deps.language(threadId))));
  }

  return {
    spending,
    refusal,

    /** Throws `refusal`'s answer. */
    assert(botId: string, threadId: string): void {
      const refused = refusal(botId, threadId);
      if (refused) throw refused;
    },

    /** After a turn is booked: the owner hears once a month when its company passes the warning share and once when the
     * budget is spent. */
    booked(row: { botId: string; botName: string; threadId: string; section?: string; costUsd: number | null }): void {
      if (!row.costUsd) return;
      const company = companyOfSection(row.section ?? deps.sectionOf(row.botId));
      if (!company) return;
      const spend = spendOf(company);
      const saved = readMarks();
      const alert = budgetAlert(spend, saved[company.id]);
      if (!alert) return;
      const kept = saved[company.id];
      const base: Marks = kept && kept.month === spend.month && kept.budgetBrl === spend.budgetBrl ? kept : { month: spend.month, budgetBrl: spend.budgetBrl! };
      saved[company.id] = { ...base, warn: true, ...(alert === "cap" ? { cap: true as const } : {}) };
      saveMarks();
      const language = deps.language(row.threadId);
      const words = budgetWords(company, spend, language);
      deps.alert(buildSpendNotification({ id: row.botId, name: row.botName }, row.threadId, alert === "cap"
        ? { title: serverLine(language, "server.company.budgetCapTitle", words), body: serverLine(language, "server.company.budgetCapBody", words) }
        : { title: serverLine(language, "server.company.budgetWarnTitle", words), body: serverLine(language, "server.company.budgetWarnBody", words) }));
    },

    /** The company rules a send through a connected app waits on, for its approval card; null when none holds it. */
    ruleHold(botId: string, calls: readonly ConnectorCall[], opaque: boolean): CompanyApproval | null {
      const company = companyOfSection(deps.sectionOf(botId));
      const rules = company ? rulesHolding(company.rules, calls, opaque) : [];
      return company && rules.length ? { kind: "rule", companyId: company.id, company: company.name, rules } : null;
    },

    /** A person's answer to a release card; null when the request is not one. */
    resolve(threadId: string, requestId: string, behavior: string): { ok: true; outcome: string; alreadySettled?: true } | null {
      const store = deps.store();
      const message = store.messagesFor(threadId).find((line) => line.card?.requestId === requestId && line.card.companyApproval?.kind === "budget");
      const card = message?.card;
      const approval = card?.companyApproval;
      if (!message || !card || approval?.kind !== "budget") return null;
      if (card.answered) return { ok: true, outcome: card.answered === "allow" ? "allowed-once" : "rejected", alreadySettled: true };
      const allowed = behavior === "allow";
      const released = allowed && deps.release(approval.companyId, approval.month);
      const answered = !allowed ? "deny" : released ? "allow" : "unavailable";
      store.patchMessage(threadId, message.id, { card: { ...card, answered, ...(answered === "unavailable" ? { dismissed: true } : {}) } });
      const botId = message.from?.botId;
      deps.decide({ threadId, requestId, botId, botName: botId ? store.bot(botId)?.name : undefined, tool: COMPANY_BUDGET_TOOL, summary: card.title,
        decision: released ? "user-approved" : "user-denied", source: "user", rule: `company:${approval.companyId}:budget` });
      return { ok: true, outcome: answered === "allow" ? "allowed-once" : answered === "deny" ? "rejected" : "unavailable" };
    },
  };
}

export type CompanyBudgets = ReturnType<typeof createCompanyBudgets>;
