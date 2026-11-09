import { COMPANY_RULE_CHECK, type Company, type CompanyRule, type CompanyRuleTrigger } from "./companies.ts";
import { actionTokens, type ConnectorCall } from "./outbound.ts";

/** What an outbound connected-app call does, for the rules that watch it. */
export type OutboundKind = "send" | "publish" | "payment";

const PAYMENT_VERBS = new Set(["PAY", "PAYOUT", "CHARGE", "REFUND", "TRANSFER", "BUY", "PURCHASE"]);
const PAYMENT_NOUNS = new Set(["PAYMENT", "INVOICE", "CHECKOUT", "ORDER"]);
const PUBLISH_VERBS = new Set(["PUBLISH", "TWEET", "RETWEET", "BROADCAST", "SHARE"]);
const MESSAGE_NOUNS = new Set(["MESSAGE", "MESSAGES", "COMMENT", "REPLY", "DM", "CHAT", "EMAIL", "MAIL"]);
/** The proxy and raw-API tools run code or any endpoint: nothing tells what they do. */
const OPAQUE = /^(?:COMPOSIO_PROXY_EXECUTE|mcp__.+__invoke_api_endpoint)$/;

export function outboundKind(slug: string): OutboundKind {
  const tokens = actionTokens(slug);
  if (tokens.some((token) => PAYMENT_VERBS.has(token)) || (tokens.some((token) => PAYMENT_NOUNS.has(token)) && tokens.includes("CREATE"))) return "payment";
  if (tokens.some((token) => PUBLISH_VERBS.has(token))) return "publish";
  if (tokens.includes("POST") && !tokens.some((token) => MESSAGE_NOUNS.has(token))) return "publish";
  return "send";
}

const RECIPIENT_KEY = /^(?:to|cc|bcc|recipients?|recipient_?(?:emails?|ids?|list)|extra_?recipients|emails?|email_?addresses|phone_?numbers?|numbers?|to_?numbers?|attendees|invitees|guests|participants|users|user_?ids|members|contacts|channels|chat_?ids)$/i;
const MAX_DEPTH = 5;

function addressesIn(value: unknown): number {
  if (typeof value === "string") return value.split(/[,;\n]/).filter((part) => part.trim()).length;
  if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + (typeof item === "string" ? addressesIn(item) : 1), 0);
  return value === null || value === undefined || value === "" ? 0 : 1;
}

function recipientsIn(value: unknown, depth = 0): number {
  if (depth > MAX_DEPTH || !value || typeof value !== "object") return 0;
  if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + recipientsIn(item, depth + 1), 0);
  let count = 0;
  for (const [key, inner] of Object.entries(value)) count += RECIPIENT_KEY.test(key) ? addressesIn(inner) : recipientsIn(inner, depth + 1);
  return count;
}

/** How many people the sends in `calls` reach, counted from the addresses in their arguments; a send naming none reaches
 * one. Infinity when the calls are opaque code, whose recipients nothing can count. */
export function recipientsReached(calls: readonly ConnectorCall[], opaque: boolean): number {
  if (opaque || calls.some((call) => OPAQUE.test(call.slug))) return Number.POSITIVE_INFINITY;
  return calls.filter((call) => outboundKind(call.slug) === "send").reduce((sum, call) => sum + Math.max(1, recipientsIn(call.arguments)), 0);
}

/** The company's rules the app holds these outbound calls for. Opaque code may do anything, so every app-checked rule
 * holds it. */
export function rulesHolding(rules: readonly CompanyRule[], calls: readonly ConnectorCall[], opaque: boolean): CompanyRule[] {
  const unreadable = opaque || calls.some((call) => OPAQUE.test(call.slug));
  const kinds = new Set<string>(calls.map((call) => outboundKind(call.slug)));
  return rules.filter((rule) => {
    if (COMPANY_RULE_CHECK[rule.trigger] !== "app") return false;
    if (unreadable) return true;
    if (rule.trigger === "bulk-send") return recipientsReached(calls, false) > (rule.threshold ?? 0);
    return kinds.has(rule.trigger);
  });
}

const RULE_WORDS: Record<CompanyRuleTrigger, (rule: CompanyRule) => string> = {
  "bulk-send": (rule) => `Send a message, email, text or invite that reaches more than ${rule.threshold ?? 0} people in total`,
  publish: () => "Publish, post or share anything publicly, or deliver work to anyone outside the company (a client, a site, a social network)",
  payment: () => "Pay, charge, buy, refund or transfer money",
  deploy: () => "Change anything in production or deploy (servers, sites, apps, databases, DNS)",
};

/** The rules as the company's bots read them, at the end of their standing instructions; empty without rules. */
export function companyRulesPrompt(company: Pick<Company, "name" | "rules"> | undefined): string {
  if (!company?.rules.length) return "";
  const lines = company.rules.map((rule) => `- ${RULE_WORDS[rule.trigger](rule)}.${COMPANY_RULE_CHECK[rule.trigger] === "app" ? " Through connected apps the app also holds it for the owner's approval." : ""}`);
  return `\n\nApproval rules the owner set for the company ${JSON.stringify(company.name)}, which every bot of the company follows. ` +
    "Before you do any of the following, by any means (connected apps, your own tools, commands or a browser), ask the owner for approval in this conversation and wait for a clear yes. " +
    "If they say no, or have not answered, do not do it and say what is waiting on them.\n" + lines.join("\n");
}
