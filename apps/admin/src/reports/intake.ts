// The public intake for the app's @devs bug reports (server/devs-report-send.ts in the app is the client). Anyone can
// post here, so nothing that arrives is trusted: it is validated, size-capped, rate-limited per IP and only stored.
//
//   POST /webhooks/bug-reports         { installId, source, description, appVersion, platform, diagnostics, contactEmail?, contact? }
//     201 { id } · 400 / 413 { error } · 429 { error, retryAfter } (seconds, also Retry-After)
//   POST /webhooks/bug-reports/status  { installId, ids[] }
//     200 { reports: [{ id, status: "received" | "unknown", fixedIn: null }], notify: false }
import { z } from "zod";
import { hit, LIMITS, type Limit } from "../auth/rate-limit.ts";
import type { AppContext } from "../context.ts";
import { hmacHex } from "../security/crypto.ts";

/** The app's own limits (server/devs-report.ts DEVS_REPORT_LIMITS), which this intake promises to take. */
export const REPORT_LIMITS = { body: 600 * 1024, description: 10_000, field: 40, diagnostics: 262_144, installId: 64, contact: 254, statusIds: 50 } as const;

/** Postgres text and jsonb refuse NUL, so it never reaches the database. */
const text = (max: number) => z.string().max(max).transform((value) => value.replace(/\u0000/g, ""));
const line = (max: number) => text(max).pipe(z.string().trim().min(1).max(max));
const contact = z.email().max(REPORT_LIMITS.contact).optional();

const reportSchema = z.object({
  installId: line(REPORT_LIMITS.installId),
  source: z.literal("bot"),
  description: text(REPORT_LIMITS.description).pipe(z.string().trim().min(1)),
  appVersion: line(REPORT_LIMITS.field),
  platform: line(REPORT_LIMITS.field),
  diagnostics: text(REPORT_LIMITS.diagnostics),
  contactEmail: contact,
  contact,
});
export type IncomingReport = z.infer<typeof reportSchema>;

const statusSchema = z.object({
  installId: line(REPORT_LIMITS.installId),
  ids: z.array(z.string().max(64)).max(REPORT_LIMITS.statusIds),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type IntakeResult =
  | { status: 201; body: { id: string } }
  | { status: 200; body: { reports: Array<{ id: string; status: "received" | "unknown"; fixedIn: null }>; notify: false } }
  | { status: 400 | 413; body: { error: string } }
  | { status: 429; body: { error: string; retryAfter: number } };

function refusal(error: z.ZodError): IntakeResult {
  const first = error.issues[0];
  const field = first?.path.join(".") || "corpo";
  return { status: 400, body: { error: `Campo ${field} inválido: ${first?.message ?? "formato inesperado"}` } };
}

async function limited(ctx: AppContext, kind: string, ip: string, limit: Limit): Promise<IntakeResult | null> {
  if (await hit(ctx.db, `${kind}:${hmacHex(ctx.config.sessionSecret, ip)}`, limit, ctx.now())) return null;
  const retryAfter = Math.ceil(limit.windowMs / 1000);
  return { status: 429, body: { error: "Muitos relatórios deste endereço; tente de novo mais tarde.", retryAfter } };
}

export async function receiveBugReport(ctx: AppContext, raw: unknown, ip: string): Promise<IntakeResult> {
  const parsed = reportSchema.safeParse(raw);
  if (!parsed.success) return refusal(parsed.error);
  const refused = await limited(ctx, "bug-report-ip", ip, LIMITS.bugReportIp);
  if (refused) return refused;
  const report = parsed.data;
  const { rows } = await ctx.db.query<{ id: string }>(
    `INSERT INTO bug_reports (received_at, install_id, app_version, platform, contact, ip, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [ctx.now(), report.installId, report.appVersion, report.platform, report.contactEmail ?? report.contact ?? null, ip.slice(0, 64), JSON.stringify(report)],
  );
  return { status: 201, body: { id: rows[0]!.id } };
}

export async function bugReportStatus(ctx: AppContext, raw: unknown, ip: string): Promise<IntakeResult> {
  const parsed = statusSchema.safeParse(raw);
  if (!parsed.success) return refusal(parsed.error);
  const refused = await limited(ctx, "bug-report-status-ip", ip, LIMITS.bugReportStatusIp);
  if (refused) return refused;
  const { installId, ids } = parsed.data;
  const known = ids.filter((id) => UUID.test(id));
  const { rows } = known.length
    ? await ctx.db.query<{ id: string }>("SELECT id FROM bug_reports WHERE install_id = $1 AND id = ANY($2::uuid[])", [installId, known])
    : { rows: [] };
  const received = new Set(rows.map((row) => row.id));
  return {
    status: 200,
    body: { reports: ids.map((id) => ({ id, status: received.has(id) ? "received" : "unknown", fixedIn: null })), notify: false },
  };
}
