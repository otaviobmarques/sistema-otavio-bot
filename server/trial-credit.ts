import type { GatewayRefusal, TrialCreditRefusal } from "../shared/trial-credit.ts";

export { TRIAL_CREDIT_REFUSED, type TrialCreditRefusal } from "../shared/trial-credit.ts";
export type TrialCreditEnd = "used_up" | "ended";
export const trialCreditEnds = (refusal: TrialCreditRefusal): refusal is TrialCreditEnd => refusal === "used_up" || refusal === "ended";

export const TRIAL_CREDIT_OWN_AI = "Your own AI is connected on My Cloud, so bots use it instead of the trial Claude credit.";
export const TRIAL_KEY_HELD = "Saved on My Cloud. Your bots use this key once the trial's Claude credit runs out.";

const RELAY_CODES = "trial_credit_used_up|trial_credit_ended|trial_credit_too_low|invalid_api_key";
const RELAY_CODE = new RegExp(`"code"\\s*:\\s*"(${RELAY_CODES})"|\\((${RELAY_CODES})\\)$`);

/** Only the relay's own codes end or pause the credit; a 401/402/403 without one (a proxy's page) is an ordinary failed call. */
export function trialCreditRefusal(status: number, body = ""): TrialCreditRefusal | null {
  if (status === 429) return "paused";
  const match = RELAY_CODE.exec(body);
  const code = match?.[1] ?? match?.[2];
  if (status === 402 && code === "trial_credit_used_up") return "used_up";
  if ((status === 402 && code === "trial_credit_ended") || (status === 401 && code === "invalid_api_key")) return "ended";
  if (status === 400 && code === "trial_credit_too_low") return "too_low";
  return null;
}

const HTTP_FAILURE = /^upstream HTTP (\d{3})(?::\s?([\s\S]*))?$/;
export function trialCreditFailure(message: string): TrialCreditRefusal | null {
  const match = HTTP_FAILURE.exec(message);
  return match ? trialCreditRefusal(Number(match[1]), match[2] ?? "") : null;
}

export { GATEWAY_REFUSED, type GatewayRefusal } from "../shared/trial-credit.ts";

const GATEWAY_CODES: Record<string, GatewayRefusal> = {
  credits_used_up: "credits_used_up", plan_suspended: "plan_suspended", model_not_in_plan: "model_not_in_plan", model_unavailable: "model_not_in_plan",
  daily_cap_reached: "plan_limit", monthly_cap_reached: "plan_limit", request_over_plan_limit: "plan_limit", invalid_token: "unavailable",
};
const GATEWAY_CODE_NAMES = Object.keys(GATEWAY_CODES).join("|");
const GATEWAY_CODE = new RegExp(`"(?:code|type)"\\s*:\\s*"(${GATEWAY_CODE_NAMES})"|\\((${GATEWAY_CODE_NAMES})\\)$`);

/** The ArkoBot gateway's refusal in an engine's error, by the code in the gateway's JSON body (`{ code, message }`):
 * quoted whole (Claude Code, Codex) or as "message (code)" (the OpenAI-compatible driver). */
export function gatewayRefusal(message: string): GatewayRefusal | null {
  const match = GATEWAY_CODE.exec(message.trim());
  const code = match?.[1] ?? match?.[2];
  return code ? GATEWAY_CODES[code]! : null;
}
