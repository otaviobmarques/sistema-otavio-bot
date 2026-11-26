import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type { UpdaterState } from "@/lib/updater";

const fixture = vi.hoisted(() => ({ state: null as UpdaterState | null }));
vi.mock("@/lib/updater", async (original) => ({ ...(await original<typeof import("@/lib/updater")>()), useUpdaterState: () => fixture.state }));
import { RequiredUpdateScreen, requiredUpdateView } from "./RequiredUpdateScreen";

afterEach(() => vi.unstubAllGlobals());

function render(state: UpdaterState | null) {
  fixture.state = state;
  vi.stubGlobal("window", { ogb: { updater: { check: vi.fn(), install: vi.fn(), onState: vi.fn() } } });
  return renderToStaticMarkup(createElement(RequiredUpdateScreen));
}

it("covers nothing unless the launch check found the update", () => {
  expect(requiredUpdateView(null)).toBeNull();
  expect(requiredUpdateView({ status: "downloading", percent: 40 })).toBeNull();
  expect(requiredUpdateView({ status: "error", message: "offline" })).toBeNull();
  expect(requiredUpdateView({ status: "idle", mandatory: true })).toBeNull();
  expect(render({ status: "downloaded", version: "2.0.0" })).toBe("");
});

it("follows a required update from download to restart", () => {
  expect(requiredUpdateView({ status: "downloading", mandatory: true })).toEqual({ step: "downloading", percent: null });
  expect(requiredUpdateView({ status: "downloading", mandatory: true, percent: 41.6 })).toEqual({ step: "downloading", percent: 42 });
  expect(requiredUpdateView({ status: "preparing", mandatory: true })).toEqual({ step: "preparing" });
  expect(requiredUpdateView({ status: "downloaded", mandatory: true })).toEqual({ step: "installing" });
  expect(requiredUpdateView({ status: "installing", mandatory: true })).toEqual({ step: "installing" });
  expect(requiredUpdateView({ status: "checking", mandatory: true })).toEqual({ step: "checking" });

  const html = render({ status: "downloading", mandatory: true, version: "2.0.0", percent: 42 });
  expect(html).toContain('role="alertdialog"');
  expect(html).toContain("Required update");
  expect(html).toContain("Downloading 42%");
  expect(html).toContain('aria-valuenow="42"');
  expect(html).not.toMatch(/Later|Dismiss/);
});

it("says why a required update failed and offers only Try again; one that cannot be retried offers nothing", () => {
  expect(requiredUpdateView({ status: "error", mandatory: true, message: "socket hang up\nat stack" }))
    .toEqual({ step: "failed", message: "socket hang up", retry: true });
  const html = render({ status: "error", mandatory: true, version: "2.0.0", message: "socket hang up" });
  expect(html).toContain("The update did not finish.");
  expect(html).toContain("socket hang up");
  expect(html).toContain("Try again");
  expect(render({ status: "error", mandatory: true, retryable: false, message: "Preparing the update took too long." })).not.toContain("Try again");
});
