// Sending one @devs report to the ArkoBot team's endpoint (the operator Central, apps/admin) and reading its answer: 201
// {id}; 400 or 413 {error}; 429 {error, retryAfter} (seconds, also Retry-After). And asking that endpoint what became of
// the reports this app sent (POST <endpoint>/status). A Cloud home may sign its question with the bootstrap secret it
// shares with an Admin named in OMB_BUG_REPORT_URL.
import { createHash, createHmac, randomBytes } from "node:crypto";
import { z } from "zod";

import { DEVS_REPORT_LIMITS, withoutContact, type DevsReportPayload } from "./devs-report.ts";

/** The ArkoBot Central's public intake (apps/admin, POST /webhooks/bug-reports). */
export const ARKOBOT_BUG_REPORT_URL = "https://admin.arkobot.com.br/webhooks/bug-reports";
const SEND_TIMEOUT_MS = 20_000;
const ANSWER_MAX_BYTES = 16 * 1024;

export type SendOutcome =
  /** `saved`: kept on this computer (devs-report-local.ts), not sent anywhere. */
  | { ok: true; id: string; saved?: true }
  /** Worth sending again later: offline, a server error, or the endpoint's hourly limit. */
  | { ok: false; retry: true; why: "offline" | "server" | "limited"; retryAfterMs?: number }
  /** The endpoint refused this report; sending it again would be refused again. */
  | { ok: false; retry: false; why: "refused"; detail: string };

/** OMB_BUG_REPORT_URL when it is an https address, or http on this machine's loopback (for fixtures); null otherwise. */
export function explicitBugReportEndpoint(env: NodeJS.ProcessEnv): string | null {
  const explicit = env.OMB_BUG_REPORT_URL?.trim();
  if (!explicit) return null;
  try {
    const url = new URL(explicit);
    const loopback = url.protocol === "http:" && ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname);
    return (url.protocol === "https:" || loopback) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

/** OMB_BUG_REPORT_URL (see explicitBugReportEndpoint), else the ArkoBot Central. */
export function bugReportEndpoint(env: NodeJS.ProcessEnv): string {
  return explicitBugReportEndpoint(env) ?? ARKOBOT_BUG_REPORT_URL;
}

async function boundedJson(response: Response): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > ANSWER_MAX_BYTES) { await reader.cancel().catch(() => {}); return {}; }
      chunks.push(value);
    }
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

const sentence = (value: unknown) => (typeof value === "string" ? value.replace(/\p{Cc}+/gu, " ").trim().slice(0, 200) : "");

async function post(endpoint: string, payload: DevsReportPayload, fetcher: typeof fetch): Promise<{ status: number; body: Record<string, unknown>; headers: Headers } | null> {
  const body = JSON.stringify(payload);
  if (Buffer.byteLength(body, "utf8") > DEVS_REPORT_LIMITS.body) return { status: 413, body: { error: "The report is larger than 600 KB." }, headers: new Headers() };
  try {
    const response = await fetcher(endpoint, {
      method: "POST", redirect: "error", cache: "no-store",
      headers: { accept: "application/json", "content-type": "application/json" },
      body, signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    return { status: response.status, body: await boundedJson(response), headers: response.headers };
  } catch {
    return null;
  }
}

export const devsReportSender = (endpoint: string, fetcher: typeof fetch = fetch) => (payload: DevsReportPayload) => sendDevsReport(endpoint, payload, fetcher);

export async function sendDevsReport(endpoint: string, payload: DevsReportPayload, fetcher: typeof fetch = fetch): Promise<SendOutcome> {
  let answer = await post(endpoint, payload, fetcher);
  // An address the endpoint will not take must not cost the person their report.
  if (answer?.status === 400 && /contact/i.test(sentence(answer.body.error)) && (payload.contactEmail || payload.contact)) {
    answer = await post(endpoint, withoutContact(payload), fetcher);
  }
  if (!answer) return { ok: false, retry: true, why: "offline" };
  const { status, body, headers } = answer;
  if (status >= 200 && status < 300) {
    const id = typeof body.id === "string" ? body.id.trim() : "";
    return /^[A-Za-z0-9_-]{1,64}$/.test(id) ? { ok: true, id } : { ok: false, retry: true, why: "server" };
  }
  if (status === 429) {
    const seconds = Number(body.retryAfter ?? headers.get("retry-after"));
    return { ok: false, retry: true, why: "limited", ...(Number.isFinite(seconds) && seconds > 0 ? { retryAfterMs: Math.ceil(seconds) * 1000 } : {}) };
  }
  if (status === 400 || status === 405 || status === 413) return { ok: false, retry: false, why: "refused", detail: sentence(body.error) || `status ${status}` };
  return { ok: false, retry: true, why: "server" };
}

/** What the app asks about the reports it sent (apps/admin src/reports/intake.ts). */
export const BUG_REPORT_STATUS_MAX_IDS = 50;
export interface ReportStatusQuestion { installId: string; ids: string[] }
/** Each report's status (`unknown`: the team has no such report from this app) and its fix's release; `notify`: this app may
 * tell its person about a fix now (false for a Cloud whose plan has ended). */
export interface ReportStatusAnswer { reports: Array<{ id: string; status: "received" | "fixed" | "unknown"; fixedIn: string | null }>; notify: boolean }
const statusAnswerSchema = z.object({
  reports: z.array(z.object({ id: z.string().max(64), status: z.enum(["received", "fixed", "unknown"]),
    fixedIn: z.string().regex(/^\d{1,6}\.\d{1,6}\.\d{1,6}$/).nullable() })).max(BUG_REPORT_STATUS_MAX_IDS),
  notify: z.boolean(),
});
/** A Cloud home's credential for its question: its machine and the bootstrap secret it shares with the Admin. */
export interface ReportStatusHome { machineId: string; bootstrapSecret: string }

/** An Admin that checks home signatures must use this signing string, so no other signed request can be replayed here
 * or the other way. */
export function bugReportsHomeSignature(secret: string, machineId: string, timestamp: string, nonce: string, body: string): string {
  const bodyHash = createHash("sha256").update(body).digest("base64url");
  return createHmac("sha256", secret).update(`omb-bug-reports-v1\n${machineId}\n${timestamp}\n${nonce}\n${bodyHash}`).digest("base64url");
}

/** The question's address: the report endpoint's own path, then /status. */
export function bugReportStatusEndpoint(reportEndpoint: string): string {
  const url = new URL(reportEndpoint);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/status`;
  url.search = "";
  return url.href;
}

/** One question; null when there is no usable answer (offline, an Admin from before this route, a refusal): asked again later. */
export async function askReportStatus(endpoint: string, question: ReportStatusQuestion, home: ReportStatusHome | null, fetcher: typeof fetch = fetch,
  now = Date.now): Promise<ReportStatusAnswer | null> {
  const body = JSON.stringify({ installId: question.installId, ids: question.ids.slice(0, BUG_REPORT_STATUS_MAX_IDS) });
  const timestamp = String(Math.floor(now() / 1000)), nonce = randomBytes(18).toString("base64url");
  const signed: Record<string, string> = home ? { "x-omb-cloud-machine": home.machineId, "x-omb-cloud-timestamp": timestamp, "x-omb-cloud-nonce": nonce,
    "x-omb-cloud-signature": `v1=${bugReportsHomeSignature(home.bootstrapSecret, home.machineId, timestamp, nonce, body)}` } : {};
  try {
    const response = await fetcher(endpoint, { method: "POST", redirect: "error", cache: "no-store", body, signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      headers: { accept: "application/json", "content-type": "application/json", ...signed } });
    if (response.status !== 200) { await response.body?.cancel().catch(() => {}); return null; }
    const parsed = statusAnswerSchema.safeParse(await boundedJson(response));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const devsStatusAsker = (reportEndpoint: string, home: ReportStatusHome | null, fetcher: typeof fetch = fetch) =>
  (question: ReportStatusQuestion) => askReportStatus(bugReportStatusEndpoint(reportEndpoint), question, home, fetcher);
