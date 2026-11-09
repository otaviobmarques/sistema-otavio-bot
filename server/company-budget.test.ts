import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Company } from "../shared/companies.ts";
import type { Notification } from "../shared/notification.ts";
import { budgetAlert, companySpending, createCompanyBudgets, COMPANY_BUDGET_TOOL } from "./company-budget.ts";
import { monthToDateSlices, noteSpend, resetSpendCacheForTests } from "./spend.ts";
import "./server-line-packs.ts";
import { removeTempDir } from "./testing/cleanup.ts";
import { appendUsage, flushUsageLedger } from "./usage-ledger.ts";

const NOW = new Date("2026-11-20T12:00:00Z");
const red = (patch: Partial<Company> = {}): Company => ({
  id: "co_red", name: "RedBox", sector: "", mission: "", color: "#FF2D33", monthlyBudgetBrl: 110, usdToBrl: null, budgetReleasedMonth: null,
  rules: [], order: 0, departmentIds: ["Tráfego pago", "Criação"], ...patch,
});
const vertice: Company = { ...red(), id: "co_vertice", name: "Vertice", monthlyBudgetBrl: 1000, departmentIds: ["Edição"] };

describe("spend by company", () => {
  it("sums what each company's bots spent in its departments, falling back to the bot's department now", () => {
    const sections: Record<string, string> = { ana: "Criação", bia: "Edição" };
    const slices = [
      { botId: "ana", section: "Tráfego pago", costUsd: 4 },
      { botId: "ana", section: undefined, costUsd: 1 },
      { botId: "bia", section: "Criação", costUsd: 2 },
      { botId: "bia", section: undefined, costUsd: 3 },
      { botId: "solo", section: undefined, costUsd: 50 },
    ];
    const spend = companySpending([red(), vertice], slices, (botId) => sections[botId], "2026-11");
    expect(spend.map((one) => [one.companyId, one.spentUsd, one.spentBrl])).toEqual([["co_red", 7, 38.5], ["co_vertice", 3, 16.5]]);
  });

  it("warns once at 80% and once more at 100%, again for a new month or a new budget", () => {
    const at = (usd: number, budget = 110, month = "2026-11") => companySpending([red({ monthlyBudgetBrl: budget })], [{ botId: "a", section: "Criação", costUsd: usd }], () => undefined, month)[0]!;
    expect(budgetAlert(at(10), undefined)).toBeNull();
    expect(budgetAlert(at(16), undefined)).toBe("warn");
    expect(budgetAlert(at(17), { month: "2026-11", budgetBrl: 110, warn: true })).toBeNull();
    expect(budgetAlert(at(20), { month: "2026-11", budgetBrl: 110, warn: true })).toBe("cap");
    expect(budgetAlert(at(25), { month: "2026-11", budgetBrl: 110, warn: true, cap: true })).toBeNull();
    expect(budgetAlert(at(16, 110, "2026-12"), { month: "2026-11", budgetBrl: 110, warn: true, cap: true })).toBe("warn");
    expect(budgetAlert(at(20, 120), { month: "2026-11", budgetBrl: 110, warn: true })).toBe("warn");
    expect(budgetAlert(at(20, 200), { month: "2026-11", budgetBrl: 110, warn: true, cap: true })).toBeNull();
  });
});

describe("a company's budget and rules at work", () => {
  let dataDir: string;
  let companies: Company[];
  let alerts: Notification[];
  let notices: Array<Notification | null>;
  let decisions: Array<Record<string, unknown>>;
  const messages = new Map<string, Array<Record<string, any>>>();
  const store = {
    appendMessage: (threadId: string, message: Record<string, unknown>) => {
      const line = { ...message, id: `m${(messages.get(threadId)?.length ?? 0) + 1}`, at: Date.now() };
      messages.set(threadId, [...messages.get(threadId) ?? [], line]);
      return line;
    },
    messagesFor: (threadId: string) => messages.get(threadId) ?? [],
    patchMessage: (threadId: string, id: string, patch: Record<string, unknown>) => {
      messages.set(threadId, (messages.get(threadId) ?? []).map((line) => line.id === id ? { ...line, ...patch } : line));
      return true;
    },
    bot: (id: string) => ({ id, name: id === "ana" ? "Ana" : "Bia", color: "#123456" }),
  };
  const sections: Record<string, string> = { ana: "Criação", bia: "Edição" };
  const budgets = () => createCompanyBudgets({
    dataDir, companies: () => companies, sectionOf: (botId) => sections[botId], store: () => store as never, language: () => "pt-br",
    alert: (notification) => { alerts.push(notification); }, notify: (notification) => { notices.push(notification); },
    decide: (row) => { decisions.push(row); }, now: () => NOW,
    release: (id, month) => {
      companies = companies.map((company) => company.id === id ? { ...company, budgetReleasedMonth: month } : company);
      return companies.some((company) => company.id === id);
    },
  });
  let booked = 0;
  const spent = async (botId: string, costUsd: number, section?: string) => {
    const row = { at: new Date(NOW.getTime() - 60_000 + ++booked).toISOString(), botId, botName: botId, threadId: `${botId}-thread`, instanceId: "claude", driverKind: "claudeAgent", model: "m",
      input: 1, output: 1, costUsd, trigger: { kind: "owner" as const }, ...(section ? { section } : {}) };
    noteSpend(dataDir, row, appendUsage(dataDir, row));
    return row;
  };

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "omb-company-budget-"));
    resetSpendCacheForTests();
    companies = [red(), vertice];
    alerts = []; notices = []; decisions = [];
    messages.clear();
  });
  afterEach(async () => { await flushUsageLedger(dataDir); await removeTempDir(dataDir); });

  it("reads this month's ledger by bot and department, counting a turn whose row has not landed", async () => {
    await spent("ana", 1, "Criação");
    await flushUsageLedger(dataDir);
    await spent("ana", 2, "Criação");
    await spent("bia", 0.5);
    expect(monthToDateSlices(dataDir, NOW).map((slice) => [slice.botId, slice.section, slice.costUsd]))
      .toEqual([["ana", "Criação", 3], ["bia", undefined, 0.5]]);
  });

  it("warns the owner at 80% and pauses the company's bots at 100% with a release card, once per company", async () => {
    const companyBudgets = budgets();
    companyBudgets.booked(await spent("ana", 10, "Criação"));
    expect(alerts).toEqual([]);
    companyBudgets.booked(await spent("ana", 7, "Criação"));
    expect(alerts.map((one) => one.title)).toEqual(["A RedBox já usou 85% da verba de IA"]);
    expect(alerts[0]!.body.replace(/\s/g, " ")).toContain("R$ 93,50 de R$ 110,00");
    expect(companyBudgets.refusal("ana", "ana-thread")).toBeNull();

    companyBudgets.booked(await spent("ana", 3, "Criação"));
    expect(alerts.map((one) => one.title)).toEqual(["A RedBox já usou 85% da verba de IA", "A RedBox chegou à verba de IA do mês"]);
    companyBudgets.booked(await spent("ana", 1, "Criação"));
    expect(alerts).toHaveLength(2);

    const refused = companyBudgets.refusal("ana", "ana-thread");
    expect(refused).toMatchObject({ status: 409, code: "spend_cap" });
    expect(refused!.message.replace(/\s/g, " ")).toBe("Os bots da RedBox estão pausados: a verba de IA deste mês acabou (R$ 115,50 de R$ 110,00). Libere o mês na Caixa de entrada ou na Sala do conselho, ou aumente a verba no Prédio.");
    expect(() => companyBudgets.assert("ana", "ana-thread")).toThrow(refused!.message);
    expect(companyBudgets.refusal("bia", "bia-thread")).toBeNull();

    const cards = store.messagesFor("ana-thread");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ role: "bot", kind: "options", from: { botId: "ana", name: "Ana" }, card: {
      title: "Liberar a RedBox para continuar gastando neste mês?", tool: COMPANY_BUDGET_TOOL,
      options: ["Liberar até o fim do mês", "Manter pausado"], companyApproval: { kind: "budget", companyId: "co_red", company: "RedBox", month: "2026-11" },
    } });
    expect(notices.filter(Boolean)).toHaveLength(1);
    expect(decisions).toEqual([expect.objectContaining({ decision: "card-shown", source: "company-budget", rule: "company:co_red:budget" })]);
  });

  it("lets the company spend on once the owner releases the month, and keeps it paused when they decline", async () => {
    const companyBudgets = budgets();
    await spent("ana", 30, "Criação");
    expect(companyBudgets.refusal("ana", "ana-thread")).not.toBeNull();
    const card = store.messagesFor("ana-thread")[0]!.card;
    expect(companyBudgets.resolve("ana-thread", "elsewhere", "allow")).toBeNull();
    expect(companyBudgets.resolve("ana-thread", card.requestId, "deny")).toEqual({ ok: true, outcome: "rejected" });
    expect(companyBudgets.refusal("ana", "ana-thread")).not.toBeNull();
    const second = store.messagesFor("ana-thread").at(-1)!.card;
    expect(second.requestId).not.toBe(card.requestId);
    expect(companyBudgets.resolve("ana-thread", second.requestId, "allow")).toEqual({ ok: true, outcome: "allowed-once" });
    expect(companyBudgets.resolve("ana-thread", second.requestId, "allow")).toEqual({ ok: true, outcome: "allowed-once", alreadySettled: true });
    expect(companies[0]!.budgetReleasedMonth).toBe("2026-11");
    expect(companyBudgets.refusal("ana", "ana-thread")).toBeNull();
    expect(companyBudgets.spending()[0]).toMatchObject({ level: "exceeded", released: true });
  });

  it("names the company's rules a send waits on, and nothing for a bot in no company", () => {
    companies = [red({ rules: [{ id: "r1", trigger: "bulk-send", threshold: 1 }, { id: "r2", trigger: "deploy" }] })];
    const companyBudgets = budgets();
    const two = [{ slug: "GMAIL_SEND_EMAIL", arguments: { to: ["a@x.test", "b@x.test"] } }];
    expect(companyBudgets.ruleHold("ana", two, false)).toEqual({ kind: "rule", companyId: "co_red", company: "RedBox", rules: [{ id: "r1", trigger: "bulk-send", threshold: 1 }] });
    expect(companyBudgets.ruleHold("ana", [{ slug: "GMAIL_SEND_EMAIL", arguments: { to: "a@x.test" } }], false)).toBeNull();
    expect(companyBudgets.ruleHold("bia", two, false)).toBeNull();
    expect(companyBudgets.ruleHold("solo", two, false)).toBeNull();
  });
});
