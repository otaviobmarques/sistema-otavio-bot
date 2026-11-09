import { describe, expect, it } from "vitest";

import { COMPANY_RULE_CHECK, companyPaused, companySpendOf, DEFAULT_USD_TO_BRL, type CompanyRule } from "./companies.ts";
import { companyRulesPrompt, outboundKind, recipientsReached, rulesHolding } from "./company-rules.ts";

const company = (monthlyBudgetBrl: number | null, extra: { usdToBrl?: number | null; budgetReleasedMonth?: string | null } = {}) =>
  ({ id: "co_1", monthlyBudgetBrl, usdToBrl: extra.usdToBrl ?? null, budgetReleasedMonth: extra.budgetReleasedMonth ?? null });

describe("a company's spend against its budget", () => {
  it("turns the ledger's dollars into reais at the company's rate, or 5,50 when it has none", () => {
    expect(DEFAULT_USD_TO_BRL).toBe(5.5);
    expect(companySpendOf(company(100), 10, "2026-11")).toMatchObject({ spentUsd: 10, spentBrl: 55, usdToBrl: 5.5, percent: 55, level: "ok" });
    expect(companySpendOf(company(100, { usdToBrl: 5 }), 10, "2026-11")).toMatchObject({ spentBrl: 50, usdToBrl: 5, percent: 50 });
    expect(companySpendOf(company(100), -3, "2026-11")).toMatchObject({ spentUsd: 0, spentBrl: 0, percent: 0 });
  });

  it("warns from 80% and is spent at 100%, not a cent before", () => {
    const at = (usd: number) => companySpendOf(company(110), usd, "2026-11");
    expect(at(15.99)).toMatchObject({ percent: 79, level: "ok" });
    expect(at(16)).toMatchObject({ percent: 80, level: "warn" });
    expect(at(19.99)).toMatchObject({ percent: 99, level: "warn" });
    expect(at(20)).toMatchObject({ percent: 100, level: "exceeded" });
    expect(at(30)).toMatchObject({ percent: 150, level: "exceeded" });
    expect(at(1_000)).toMatchObject({ percent: 999, level: "exceeded" });
    expect(companyPaused(at(19.99))).toBe(false);
    expect(companyPaused(at(20))).toBe(true);
  });

  it("has no level without a budget, and a budget of zero is spent by the first paid turn", () => {
    expect(companySpendOf(company(null), 50, "2026-11")).toMatchObject({ level: "none", percent: 0, budgetBrl: null, released: false });
    expect(companySpendOf(company(0), 0, "2026-11")).toMatchObject({ level: "ok", percent: 0 });
    expect(companySpendOf(company(0), 0.01, "2026-11")).toMatchObject({ level: "exceeded", percent: 999 });
  });

  it("lets a released month run on, and only that month", () => {
    const released = companySpendOf(company(10, { budgetReleasedMonth: "2026-11" }), 5, "2026-11");
    expect(released).toMatchObject({ level: "exceeded", released: true });
    expect(companyPaused(released)).toBe(false);
    expect(companyPaused(companySpendOf(company(10, { budgetReleasedMonth: "2026-10" }), 5, "2026-11"))).toBe(true);
    expect(companySpendOf(company(10, { budgetReleasedMonth: "2026-11" }), 1, "2026-11").released).toBe(false);
  });
});

describe("a company's approval rules", () => {
  const rule = (trigger: CompanyRule["trigger"], threshold?: number): CompanyRule => ({ id: `rule_${trigger}`, trigger, ...(threshold !== undefined ? { threshold } : {}) });
  const rules = [rule("bulk-send", 3), rule("publish"), rule("payment"), rule("deploy")];

  it("tells a send from a publication and a payment by the tool's action", () => {
    expect(outboundKind("GMAIL_SEND_EMAIL")).toBe("send");
    expect(outboundKind("SLACK_CHAT_POST_MESSAGE")).toBe("send");
    expect(outboundKind("GMAIL_REPLY_TO_THREAD")).toBe("send");
    expect(outboundKind("LINKEDIN_CREATE_LINKED_IN_POST")).toBe("publish");
    expect(outboundKind("TWITTER_CREATION_OF_A_POST")).toBe("publish");
    expect(outboundKind("mcp__own_apps__INSTAGRAM_PUBLISH_MEDIA")).toBe("publish");
    expect(outboundKind("STRIPE_CREATE_PAYMENT_INTENT")).toBe("payment");
    expect(outboundKind("STRIPE_CREATE_REFUND")).toBe("payment");
    expect(outboundKind("PAYPAL_TRANSFER_FUNDS")).toBe("payment");
  });

  it("counts the people a send reaches from the addresses in its arguments", () => {
    expect(recipientsReached([{ slug: "GMAIL_SEND_EMAIL", arguments: { recipient_email: "a@x.test", cc: ["b@x.test", "c@x.test"], bcc: "d@x.test, e@x.test" } }], false)).toBe(5);
    expect(recipientsReached([{ slug: "GMAIL_SEND_EMAIL", arguments: { to: "a@x.test", body: "Hello, b@x.test" } }], false)).toBe(1);
    expect(recipientsReached([{ slug: "SLACK_SEND_MESSAGE", arguments: { channel: "general", text: "hi" } }], false)).toBe(1);
    expect(recipientsReached([{ slug: "GMAIL_SEND_EMAIL", arguments: { message: { to: [{ email: "a@x.test" }, { email: "b@x.test" }] } } }], false)).toBe(2);
    expect(recipientsReached([{ slug: "GMAIL_SEND_EMAIL" }, { slug: "GMAIL_SEND_EMAIL" }, { slug: "LINKEDIN_CREATE_LINKED_IN_POST", arguments: { to: ["a", "b", "c"] } }], false)).toBe(2);
    expect(recipientsReached([{ slug: "COMPOSIO_PROXY_EXECUTE" }], false)).toBe(Number.POSITIVE_INFINITY);
    expect(recipientsReached([{ slug: "GMAIL_SEND_EMAIL" }], true)).toBe(Number.POSITIVE_INFINITY);
  });

  it("holds a send only past the threshold, and a post or a payment whenever its rule is set", () => {
    const four = { slug: "GMAIL_SEND_EMAIL", arguments: { to: ["a@x.test", "b@x.test", "c@x.test", "d@x.test"] } };
    const three = { slug: "GMAIL_SEND_EMAIL", arguments: { to: ["a@x.test", "b@x.test", "c@x.test"] } };
    expect(rulesHolding(rules, [four], false).map((one) => one.trigger)).toEqual(["bulk-send"]);
    expect(rulesHolding(rules, [three], false)).toEqual([]);
    expect(rulesHolding(rules, [three, { slug: "GMAIL_SEND_EMAIL", arguments: { to: "z@x.test" } }], false).map((one) => one.trigger)).toEqual(["bulk-send"]);
    expect(rulesHolding(rules, [{ slug: "LINKEDIN_CREATE_LINKED_IN_POST" }], false).map((one) => one.trigger)).toEqual(["publish"]);
    expect(rulesHolding(rules, [{ slug: "STRIPE_CREATE_PAYMENT_INTENT" }], false).map((one) => one.trigger)).toEqual(["payment"]);
    expect(rulesHolding([rule("deploy")], [four], false)).toEqual([]);
    expect(rulesHolding([], [four], false)).toEqual([]);
  });

  it("holds opaque code for every rule the app checks, since nothing can read what it does", () => {
    expect(rulesHolding(rules, [{ slug: "COMPOSIO_PROXY_EXECUTE" }], true).map((one) => one.trigger)).toEqual(["bulk-send", "publish", "payment"]);
  });

  it("says which rules the app checks and which only reach the bot", () => {
    expect(COMPANY_RULE_CHECK).toEqual({ "bulk-send": "app", publish: "app", payment: "app", deploy: "bot" });
  });

  it("tells the company's bots every rule, naming the ones the app also holds", () => {
    expect(companyRulesPrompt(undefined)).toBe("");
    expect(companyRulesPrompt({ name: "RedBox", rules: [] })).toBe("");
    const prompt = companyRulesPrompt({ name: "RedBox", rules: [rule("bulk-send", 50), rule("deploy")] });
    expect(prompt).toContain('company "RedBox"');
    expect(prompt).toContain("ask the owner for approval");
    expect(prompt).toContain("- Send a message, email, text or invite that reaches more than 50 people in total. Through connected apps the app also holds it");
    expect(prompt).toMatch(/- Change anything in production or deploy \([^)]*\)\.$/);
  });
});
