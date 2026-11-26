// Where @devs reports go. By default they are posted to the ArkoBot Central and their status asked there. A valid
// OMB_BUG_REPORT_URL sends them to that address instead. Any other OMB_BUG_REPORT_URL ("off", "local", a refused address)
// saves each report as <data dir>/bug-reports/<id>.json and contacts no host, not even to ask about status.
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { writeFileAtomic } from "./atomic.ts";
import type { DevsReportPayload } from "./devs-report.ts";
import {
  ARKOBOT_BUG_REPORT_URL, devsReportSender, devsStatusAsker, explicitBugReportEndpoint,
  type ReportStatusAnswer, type ReportStatusHome, type ReportStatusQuestion, type SendOutcome,
} from "./devs-report-send.ts";

export const BUG_REPORTS_DIR = "bug-reports";

export interface DevsReportRoute {
  send(payload: DevsReportPayload): Promise<SendOutcome>;
  askStatus(question: ReportStatusQuestion): Promise<ReportStatusAnswer | null>;
}

/** A sortable, file-name-safe id that also passes the sender's report id check: 20261109T153012-1a2b3c4d. */
export const localReportId = (at: number) =>
  `${new Date(at).toISOString().replace(/[-:]/g, "").slice(0, 15)}-${randomBytes(4).toString("hex")}`;

export function saveDevsReportLocally(dataDir: string, payload: DevsReportPayload, now: () => number = Date.now): SendOutcome {
  const at = now(), id = localReportId(at), dir = join(dataDir, BUG_REPORTS_DIR);
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileAtomic(join(dir, `${id}.json`), `${JSON.stringify({ id, savedAt: new Date(at).toISOString(), ...payload }, null, 2)}\n`, { mode: 0o600 });
  } catch (error) {
    console.warn(`devs reports: could not save a bug report in ${dir}: ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false, retry: true, why: "server" };
  }
  return { ok: true, id, saved: true };
}

/** Nobody but this computer holds a saved report, so nobody can say what became of it. */
export const unknownReportStatus = async ({ ids }: ReportStatusQuestion): Promise<ReportStatusAnswer> =>
  ({ reports: ids.map((id) => ({ id, status: "unknown", fixedIn: null })), notify: false });

export function devsReportRoute(env: NodeJS.ProcessEnv, dataDir: string, home: ReportStatusHome | null,
  fetcher: typeof fetch = fetch, now: () => number = Date.now): DevsReportRoute {
  const endpoint = explicitBugReportEndpoint(env);
  if (endpoint) return { send: devsReportSender(endpoint, fetcher), askStatus: devsStatusAsker(endpoint, home, fetcher) };
  if (env.OMB_BUG_REPORT_URL?.trim()) return { send: async (payload) => saveDevsReportLocally(dataDir, payload, now), askStatus: unknownReportStatus };
  // Security: a Cloud home's bootstrap secret belongs to its own Admin, so the ArkoBot Central never gets its signature.
  return { send: devsReportSender(ARKOBOT_BUG_REPORT_URL, fetcher), askStatus: devsStatusAsker(ARKOBOT_BUG_REPORT_URL, null, fetcher) };
}
