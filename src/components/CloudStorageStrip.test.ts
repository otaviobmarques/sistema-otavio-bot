import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CloudStorageStrip } from "./CloudStorageStrip";

const GB = 1024 ** 3;
const fixture = vi.hoisted(() => ({ storage: undefined as { state: "ok" | "warning" | "full" | "over"; usedBytes: number; quotaBytes: number | null } | undefined }));
vi.mock("@/state/store", () => ({
  useStore: () => ({ state: { config: { cloudStorage: fixture.storage } }, dispatch: vi.fn() }),
}));

const render = () => renderToStaticMarkup(createElement(CloudStorageStrip));

describe("CloudStorageStrip", () => {
  it("shows nothing until the space is full, or when the Admin never said", () => {
    fixture.storage = undefined;
    expect(render()).toBe("");
    fixture.storage = { state: "ok", usedBytes: GB, quotaBytes: 5 * GB };
    expect(render()).toBe("");
    fixture.storage = { state: "warning", usedBytes: 4.2 * GB, quotaBytes: 5 * GB };
    expect(render()).toBe("");
  });

  it("says the space is full at 100%, and that new files are refused at 110%", () => {
    fixture.storage = { state: "full", usedBytes: 5 * GB, quotaBytes: 5 * GB };
    const full = render();
    expect(full).toContain('data-cloud-storage="full"');
    expect(full).toContain("Your space is full: 5 GB of 5 GB.");
    fixture.storage = { state: "over", usedBytes: 5.6 * GB, quotaBytes: 5 * GB };
    const over = render();
    expect(over).toContain('data-cloud-storage="over"');
    expect(over).toContain("Your space ran out (5.6 GB of 5 GB)");
    expect(over).toContain("new files are refused");
  });
});
