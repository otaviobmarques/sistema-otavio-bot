import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { CLOUD_STORAGE_FILE, createCloudStorageQuota, storageFullLine } from "./cloud-storage-quota.ts";

const dirs: string[] = [];
const dir = () => { const made = mkdtempSync(join(tmpdir(), "omb-storage-")); dirs.push(made); return made; };
afterEach(() => { for (const made of dirs.splice(0)) rmSync(made, { recursive: true, force: true }); });

const GB = 1024 ** 3;

describe("how full this Cloud's disk is", () => {
  it("refuses uploads only at over, follows what the Admin says at once, and keeps it across a restart", () => {
    const dataDir = dir();
    let changes = 0;
    const quota = createCloudStorageQuota({ dataDir, cloudHome: true, changed: () => { changes += 1; } });
    expect(quota.status()).toBeUndefined();
    expect(quota.uploadsRefused()).toBe(false);
    for (const state of ["ok", "warning", "full"] as const) {
      expect(quota.set({ state, usedBytes: 4 * GB, quotaBytes: 5 * GB })).toBe(true);
      expect(quota.uploadsRefused()).toBe(false);
    }
    expect(quota.set({ state: "over", usedBytes: 6 * GB, quotaBytes: 5 * GB })).toBe(true);
    expect(quota.uploadsRefused()).toBe(true);
    expect(changes).toBe(4);
    quota.set({ state: "over", usedBytes: 6 * GB, quotaBytes: 5 * GB });
    expect(changes).toBe(4);
    expect(JSON.parse(readFileSync(join(dataDir, CLOUD_STORAGE_FILE), "utf8"))).toEqual({ v: 1, state: "over", usedBytes: 6 * GB, quotaBytes: 5 * GB });
    const restarted = createCloudStorageQuota({ dataDir, cloudHome: true });
    expect(restarted.uploadsRefused()).toBe(true);
    expect(restarted.status()).toEqual({ state: "over", usedBytes: 6 * GB, quotaBytes: 5 * GB });
    // Files deleted: uploads are taken again.
    restarted.set({ state: "ok", usedBytes: GB, quotaBytes: 5 * GB });
    expect(restarted.uploadsRefused()).toBe(false);
  });

  it("ignores a malformed word, a damaged file, and a server that is not a Cloud home", () => {
    const dataDir = dir();
    const quota = createCloudStorageQuota({ dataDir, cloudHome: true });
    for (const bad of [{}, { state: "cheio", usedBytes: 1, quotaBytes: 1 }, { state: "over", usedBytes: -1, quotaBytes: 1 }, { state: "over", usedBytes: 1.5, quotaBytes: 1 }, { state: "over", usedBytes: 1, quotaBytes: 0 }, null, "over"]) {
      expect(quota.set(bad)).toBe(false);
    }
    expect(quota.uploadsRefused()).toBe(false);
    writeFileSync(join(dataDir, CLOUD_STORAGE_FILE), "{not json");
    expect(createCloudStorageQuota({ dataDir, cloudHome: true }).uploadsRefused()).toBe(false);
    writeFileSync(join(dataDir, CLOUD_STORAGE_FILE), JSON.stringify({ v: 1, state: "over", usedBytes: 9, quotaBytes: 1 }));
    expect(createCloudStorageQuota({ dataDir, cloudHome: false }).uploadsRefused()).toBe(false);
    const notCloud = createCloudStorageQuota({ dataDir: dir(), cloudHome: false });
    expect(notCloud.set({ state: "over", usedBytes: 9, quotaBytes: 1 })).toBe(true);
    expect(notCloud.uploadsRefused()).toBe(false);
  });

  // In Portuguese when no language is set (the packs load at start; this test reads English only).
  it("says why in the app's language", () => {
    expect(storageFullLine("en")).toBe("Your space ran out: delete files or change plans.");
  });
});
