// The free trial's Claude credit refusing a turn, in the plain English words
// the server stores in the failed turn's row: the phones read those words
// whole, and the app words them again in the reader's language.

/** Used up or no longer on this Cloud (both for good, until another token
 * comes), paused for now, or too little left for this one request. */
export type TrialCreditRefusal = "used_up" | "ended" | "paused" | "too_low";

export const TRIAL_CREDIT_REFUSED: Record<TrialCreditRefusal, string> = {
  used_up: "Your trial Claude credit is used up. To keep your bots working, sign in with your own Claude or ChatGPT account, or add an API key.",
  ended: "Trial Claude credit isn't available on My Cloud anymore. Sign in with your own Claude or ChatGPT account, or add an API key.",
  paused: "Trial Claude credit is paused for now. Try again later, or sign in with your own Claude or ChatGPT account, or add an API key.",
  too_low: "Your trial Claude credit has too little left for this chat. Start a new chat, or sign in with your own Claude or ChatGPT account, or add an API key.",
};

/** Which refusal a failed turn's cause is, or null for any other failure. */
export function trialCreditKind(cause: string): TrialCreditRefusal | null {
  return (Object.keys(TRIAL_CREDIT_REFUSED) as TrialCreditRefusal[]).find(kind => TRIAL_CREDIT_REFUSED[kind] === cause.trim()) ?? null;
}

/** The ArkoBot AI gateway refusing a turn the plan's credits would pay for:
 * credits used up, the plan suspended or unpaid, a model outside the plan,
 * one of the plan's limits reached, or the gateway no longer serving this
 * instance. Stored and read like the trial credit's words above. */
export type GatewayRefusal = "credits_used_up" | "plan_suspended" | "model_not_in_plan" | "plan_limit" | "unavailable";

export const GATEWAY_REFUSED: Record<GatewayRefusal, string> = {
  credits_used_up: "The AI credits included in your plan are used up. Buy more credits, wait for the plan to renew, or connect your own AI account.",
  plan_suspended: "The AI included in your plan is paused because the plan is suspended or has a pending payment. Settle the plan, or connect your own AI account.",
  model_not_in_plan: "This model isn't included in your plan. Choose one of your plan's models, or connect your own AI account.",
  plan_limit: "Your plan's AI limit for now is reached. Try again later, or connect your own AI account.",
  unavailable: "The AI included in your plan isn't available on this server anymore. Connect your own AI account to keep your bots working.",
};

export type CreditRefusal = TrialCreditRefusal | GatewayRefusal;

/** A trial credit or gateway refusal, by the words a failed turn stored. */
export function creditRefusalKind(cause: string): CreditRefusal | null {
  const text = cause.trim();
  return trialCreditKind(text) ?? (Object.keys(GATEWAY_REFUSED) as GatewayRefusal[]).find(kind => GATEWAY_REFUSED[kind] === text) ?? null;
}
