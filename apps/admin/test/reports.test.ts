import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { REPORT_LIMITS } from "../src/reports/intake.ts";
import { advance, client, customerClient, sessionCookie, testContext, type TestContext } from "./helpers.ts";

const REPORT = {
  installId: "4b7c1f2e-0a9d-4c2b-9f1e-6d5a4b3c2d1e", source: "bot", description: "o botão travou\n\nWhat they wrote: @devs o botão travou",
  appVersion: "0.1.158", platform: "win32 x64, desktop app", diagnostics: "ArkoBot @devs report\nApp version: 0.1.158",
  contactEmail: "ada@example.com", contact: "ada@example.com",
};

/** The app posts with no cookie and no Origin header, like Node's fetch. */
function app(ctx: TestContext, ip = "198.51.100.9") {
  const { app: hono } = client(ctx);
  const post = async (path: string, body: string) => {
    const response = await hono.request(`${ctx.config.publicUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body },
      { incoming: { socket: { remoteAddress: ip } } });
    return { status: response.status, data: await response.json().catch(() => null), headers: response.headers };
  };
  return {
    send: (report: unknown) => post("/webhooks/bug-reports", JSON.stringify(report)),
    raw: (body: string) => post("/webhooks/bug-reports", body),
    status: (question: unknown) => post("/webhooks/bug-reports/status", JSON.stringify(question)),
  };
}

let ctx: TestContext;
beforeEach(async () => { ctx = await testContext(); });
afterEach(() => ctx.db.close());

describe("the public intake for @devs reports", () => {
  it("stores a valid report and answers 201 with its id, as the app expects", async () => {
    const answer = await app(ctx).send(REPORT);
    expect(answer.status).toBe(201);
    expect(answer.data.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    const { rows } = await ctx.db.query("SELECT * FROM bug_reports WHERE id = $1", [answer.data.id]);
    expect(rows[0]).toMatchObject({ install_id: REPORT.installId, app_version: "0.1.158", platform: REPORT.platform, contact: "ada@example.com",
      ip: "198.51.100.9", status: "new", payload: REPORT });
  });

  it("keeps only the fields it knows and strips NUL, which Postgres refuses", async () => {
    const answer = await app(ctx).send({ ...REPORT, description: "a\u0000b", extra: "<script>", contactEmail: undefined, contact: undefined });
    expect(answer.status).toBe(201);
    const { rows } = await ctx.db.query<{ payload: Record<string, unknown>; contact: string | null }>("SELECT payload, contact FROM bug_reports");
    expect(rows[0]!.payload.description).toBe("ab");
    expect(rows[0]!.payload).not.toHaveProperty("extra");
    expect(rows[0]!.contact).toBeNull();
  });

  it.each([
    ["not JSON", "{oops"],
    ["no description", JSON.stringify({ ...REPORT, description: "  " })],
    ["another source", JSON.stringify({ ...REPORT, source: "web" })],
    ["a long version", JSON.stringify({ ...REPORT, appVersion: "1".repeat(41) })],
    ["a long description", JSON.stringify({ ...REPORT, description: "x".repeat(REPORT_LIMITS.description + 1) })],
    ["an array", "[]"],
  ])("refuses %s with 400 and stores nothing", async (_what, body) => {
    const answer = await app(ctx).raw(body);
    expect(answer.status).toBe(400);
    expect(typeof answer.data.error).toBe("string");
    expect((await ctx.db.query("SELECT 1 FROM bug_reports")).rows).toHaveLength(0);
  });

  it("names the contact field when the address is bad, so the app sends again without it", async () => {
    const answer = await app(ctx).send({ ...REPORT, contactEmail: "not an address" });
    expect(answer.status).toBe(400);
    expect(answer.data.error).toMatch(/contact/i);
  });

  it("refuses a body over 600 KB with 413", async () => {
    const answer = await app(ctx).raw(JSON.stringify({ ...REPORT, diagnostics: "x".repeat(REPORT_LIMITS.body) }));
    expect(answer.status).toBe(413);
    expect((await ctx.db.query("SELECT 1 FROM bug_reports")).rows).toHaveLength(0);
  });

  it("takes 20 reports an hour from one address, answers 429 with retryAfter, and takes them again after the hour", async () => {
    const one = app(ctx, "198.51.100.20");
    for (let i = 0; i < 20; i++) expect((await one.send(REPORT)).status).toBe(201);
    const refused = await one.send(REPORT);
    expect(refused.status).toBe(429);
    expect(refused.data.retryAfter).toBe(3600);
    expect(refused.headers.get("retry-after")).toBe("3600");
    expect((await app(ctx, "198.51.100.21").send(REPORT)).status).toBe(201);
    advance(ctx, 60 * 60_000 + 1);
    expect((await one.send(REPORT)).status).toBe(201);
  });

  it("answers what became of this install's reports, and never another install's", async () => {
    const id = (await app(ctx).send(REPORT)).data.id as string;
    const answer = await app(ctx).status({ installId: REPORT.installId, ids: [id, "6f1c2b3a-1d2e-4f5a-8b9c-0d1e2f3a4b5c", "20261109T153012-1a2b3c4d"] });
    expect(answer.status).toBe(200);
    expect(answer.data).toEqual({ notify: false, reports: [
      { id, status: "received", fixedIn: null },
      { id: "6f1c2b3a-1d2e-4f5a-8b9c-0d1e2f3a4b5c", status: "unknown", fixedIn: null },
      { id: "20261109T153012-1a2b3c4d", status: "unknown", fixedIn: null },
    ] });
    const other = await app(ctx).status({ installId: "someone-else", ids: [id] });
    expect(other.data.reports).toEqual([{ id, status: "unknown", fixedIn: null }]);
    expect((await app(ctx).status({ installId: REPORT.installId, ids: Array.from({ length: 51 }, () => id) })).status).toBe(400);
  });

  it("does not answer on the customer host", async () => {
    const response = await customerClient(ctx).post("/webhooks/bug-reports", REPORT);
    expect(response.status).toBe(404);
  });
});

describe("Relatórios in the panel", () => {
  it("needs a session to read", async () => {
    expect((await client(ctx).get("/api/reports")).status).toBe(401);
  });

  it("lists, opens and moves a report through its statuses, with an audit entry for each change", async () => {
    const id = (await app(ctx).send(REPORT)).data.id as string;
    await app(ctx).send({ ...REPORT, description: "outro problema" });
    const operator = client(ctx, await sessionCookie(ctx, "operator", "op@domma.com.br"));

    const list = await operator.get("/api/reports?status=new");
    expect(list.status).toBe(200);
    expect(list.data.reports).toHaveLength(2);
    expect(list.data.counts).toEqual({ new: 2 });
    expect(list.data.reports.find((row: { id: string }) => row.id === id)).toMatchObject({ summary: REPORT.description, contact: "ada@example.com" });
    expect(list.data.reports[0]).not.toHaveProperty("payload");

    const detail = await operator.get(`/api/reports/${id}`);
    expect(detail.data.report.payload.diagnostics).toBe(REPORT.diagnostics);

    expect((await operator.post(`/api/reports/${id}/status`, { status: "seen" })).data).toEqual({ ok: true, changed: true });
    expect((await operator.post(`/api/reports/${id}/status`, { status: "seen" })).data).toEqual({ ok: true, changed: false });
    expect((await operator.post(`/api/reports/${id}/status`, { status: "closed" })).status).toBe(200);
    expect((await operator.post(`/api/reports/${id}/status`, { status: "deleted" })).status).toBe(400);
    expect((await operator.get(`/api/reports/${id}`)).data.report).toMatchObject({ status: "closed", status_changed_by_email: "op@domma.com.br" });
    expect((await operator.get("/api/reports?status=closed")).data.reports.map((row: { id: string }) => row.id)).toEqual([id]);

    const { rows } = await ctx.db.query<{ action: string; actor_label: string; target_id: string; data: unknown }>(
      "SELECT action, actor_label, target_id, data FROM audit_log WHERE action LIKE 'bug_report.%' ORDER BY id");
    expect(rows).toEqual([
      { action: "bug_report.status_changed", actor_label: "op@domma.com.br", target_id: id, data: { from: "new", to: "seen" } },
      { action: "bug_report.status_changed", actor_label: "op@domma.com.br", target_id: id, data: { from: "seen", to: "closed" } },
    ]);
  });

  it("lets a viewer read but not change a report, and answers 404 for an unknown one", async () => {
    const id = (await app(ctx).send(REPORT)).data.id as string;
    const viewer = client(ctx, await sessionCookie(ctx, "viewer"));
    expect((await viewer.get(`/api/reports/${id}`)).status).toBe(200);
    expect((await viewer.post(`/api/reports/${id}/status`, { status: "seen" })).status).toBe(403);
    expect((await viewer.get("/api/reports/00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });
});
