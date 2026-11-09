import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DevsReportPayload } from "./devs-report.ts";
import { BUG_REPORTS_DIR, devsReportRoute, saveDevsReportLocally } from "./devs-report-local.ts";

const PAYLOAD: DevsReportPayload = {
  installId: "4b7c1f2e-0a9d-4c2b-9f1e-6d5a4b3c2d1e", source: "bot", description: "it broke", appVersion: "0.1.128", platform: "linux x64, desktop app",
  diagnostics: "OpenMausBot @devs report", contactEmail: "ada@example.com", contact: "ada@example.com",
};
const AT = Date.parse("2026-11-09T15:30:12.345Z");
const HOME = { machineId: "m-1", bootstrapSecret: "s".repeat(32) };

let dataDir: string;
beforeEach(() => { dataDir = mkdtempSync(join(tmpdir(), "omb-bug-reports-")); });
afterEach(() => { rmSync(dataDir, { recursive: true, force: true }); vi.unstubAllGlobals(); });

const neverFetch = () => vi.fn(async () => { throw new Error("no host may be contacted"); }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

describe("saving a @devs report on this computer", () => {
  it("writes the whole payload as <data dir>/bug-reports/<id>.json and answers with that id", () => {
    const outcome = saveDevsReportLocally(dataDir, PAYLOAD, () => AT);
    expect(outcome).toMatchObject({ ok: true });
    const id = (outcome as { id: string }).id;
    expect(id).toMatch(/^20261109T153012-[0-9a-f]{8}$/);
    const dir = join(dataDir, BUG_REPORTS_DIR);
    expect(readdirSync(dir)).toEqual([`${id}.json`]);
    expect(JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8"))).toEqual({ id, savedAt: "2026-11-09T15:30:12.345Z", ...PAYLOAD });
    if (process.platform !== "win32") expect(statSync(join(dir, `${id}.json`)).mode & 0o777).toBe(0o600);
  });

  it("gives each report its own file", () => {
    const ids = [saveDevsReportLocally(dataDir, PAYLOAD, () => AT), saveDevsReportLocally(dataDir, PAYLOAD, () => AT)].map((one) => (one as { id: string }).id);
    expect(new Set(ids).size).toBe(2);
    expect(readdirSync(join(dataDir, BUG_REPORTS_DIR)).sort()).toEqual(ids.map((id) => `${id}.json`).sort());
  });

  it("asks to try again later when the folder cannot be written", () => {
    writeFileSync(join(dataDir, BUG_REPORTS_DIR), "a file where the folder goes");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(saveDevsReportLocally(dataDir, PAYLOAD, () => AT)).toEqual({ ok: false, retry: true, why: "server" });
  });
});

describe("where reports go", () => {
  it("without OMB_BUG_REPORT_URL, saves the report and never calls fetch, to send or to ask", async () => {
    const fetcher = neverFetch();
    vi.stubGlobal("fetch", fetcher);
    const route = devsReportRoute({}, dataDir, HOME, fetcher, () => AT);
    const outcome = await route.send(PAYLOAD);
    expect(outcome).toMatchObject({ ok: true });
    const id = (outcome as { id: string }).id;
    expect(readdirSync(join(dataDir, BUG_REPORTS_DIR))).toEqual([`${id}.json`]);
    expect(await route.askStatus({ installId: PAYLOAD.installId, ids: [id] }))
      .toEqual({ reports: [{ id, status: "unknown", fixedIn: null }], notify: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("treats an empty or unusable OMB_BUG_REPORT_URL as unset, never falling back to a remote host", async () => {
    for (const url of ["", "   ", "http://192.0.2.1/api/bug-reports", "https://user:pw@evil.example/x", "not an address"]) {
      const fetcher = neverFetch();
      const route = devsReportRoute({ OMB_BUG_REPORT_URL: url }, dataDir, null, fetcher, () => AT);
      expect(await route.send(PAYLOAD), url).toMatchObject({ ok: true });
      await route.askStatus({ installId: PAYLOAD.installId, ids: ["x"] });
      expect(fetcher, url).not.toHaveBeenCalled();
    }
  });

  it("with OMB_BUG_REPORT_URL, posts there and asks there, and saves nothing", async () => {
    const urls: string[] = [];
    const fetcher = (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify(url.endsWith("/status") ? { reports: [], notify: true } : { id: "r-1" }), { status: url.endsWith("/status") ? 200 : 201 });
    }) as unknown as typeof fetch;
    const route = devsReportRoute({ OMB_BUG_REPORT_URL: "https://reports.example/api/bug-reports" }, dataDir, null, fetcher);
    expect(await route.send(PAYLOAD)).toEqual({ ok: true, id: "r-1" });
    expect(await route.askStatus({ installId: PAYLOAD.installId, ids: ["r-1"] })).toEqual({ reports: [], notify: true });
    expect(urls).toEqual(["https://reports.example/api/bug-reports", "https://reports.example/api/bug-reports/status"]);
    expect(readdirSync(dataDir)).toEqual([]);
  });
});
