// The launch check's required update (updater.mjs): found → downloaded → installed at once; never a loop on failure.
import assert from "node:assert/strict";
import test from "node:test";

import { harness, settle } from "./updater-test-fixture.mjs";

function launch(h, { available = true, download = null } = {}) {
  const calls = { check: 0, download: 0, install: 0 };
  h.updater.checkForUpdates = async () => {
    calls.check += 1;
    h.updater.emit("checking-for-update");
    h.updater.emit(available ? "update-available" : "update-not-available", { version: "2.0.0" });
  };
  h.updater.downloadUpdate = () => {
    calls.download += 1;
    if (download) return download(calls.download);
    h.updater.emit("download-progress", { percent: 50 });
    h.updater.emit("update-downloaded", { version: "2.0.0" });
    return Promise.resolve(["/tmp/ArkoBot-Setup-2.0.0.exe"]);
  };
  h.updater.quitAndInstall = () => {
    calls.install += 1;
  };
  return calls;
}

test("an update found at launch downloads, says it is required, and installs at once", async () => {
  const h = harness();
  const calls = launch(h);
  await h.coordinator.check(false, { mandatory: true });
  await settle();
  assert.ok(h.states.some((state) => state.status === "downloading" && state.mandatory === true && state.version === "2.0.0"));
  assert.ok(h.states.some((state) => state.status === "downloading" && state.percent === 50));
  assert.equal(calls.install, 1);
  assert.equal(h.getState().status, "installing");
  assert.equal(h.getState().mandatory, true);
});

test("no update at launch leaves the app usable", async () => {
  const h = harness();
  const calls = launch(h, { available: false });
  await h.coordinator.check(false, { mandatory: true });
  await settle();
  assert.equal(h.getState().status, "idle");
  assert.equal(h.getState().mandatory, undefined);
  assert.equal(calls.download, 0);
  assert.equal(calls.install, 0);
});

test("an unreachable feed at launch stays quiet: the app opens as usual", async () => {
  const h = harness();
  h.updater.checkForUpdates = () => Promise.reject(Object.assign(new Error("getaddrinfo ENOTFOUND github.com"), { code: "ENOTFOUND" }));
  await assert.doesNotReject(h.coordinator.check(false, { mandatory: true }));
  await settle();
  assert.equal(h.getState().status, "idle");
  assert.equal(h.states.some((state) => state.status === "error"), false);
});

test("a failed required download is shown, never retried by itself, and Try again downloads and installs it", async () => {
  const h = harness();
  const calls = launch(h, {
    download: (attempt) => {
      if (attempt === 1) return Promise.reject(Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }));
      h.updater.emit("update-downloaded", { version: "2.0.0" });
      return Promise.resolve(["/tmp/ArkoBot-Setup-2.0.0.exe"]);
    },
  });
  await h.coordinator.check(false, { mandatory: true });
  await settle();
  assert.equal(h.getState().status, "error");
  assert.equal(h.getState().mandatory, true);
  // Hourly checks do not replace the error the person is looking at.
  await h.coordinator.check();
  await settle();
  assert.equal(calls.download, 1);
  assert.equal(calls.install, 0);

  await h.coordinator.check(true);
  await settle();
  assert.equal(calls.download, 2);
  assert.equal(calls.install, 1);
  assert.equal(h.getState().status, "installing");
});

test("an install that throws shows its error once instead of trying again", async () => {
  const h = harness();
  const calls = launch(h);
  h.updater.quitAndInstall = () => {
    calls.install += 1;
    throw new Error("installer missing");
  };
  await h.coordinator.check(false, { mandatory: true });
  await settle();
  await settle();
  assert.equal(calls.install, 1);
  assert.equal(h.getState().status, "error");
  assert.equal(h.getState().message, "installer missing");
});

test("an hourly check's update is not required: it waits for the person as before", async () => {
  const h = harness();
  const calls = launch(h);
  await h.coordinator.check();
  await settle();
  assert.equal(h.getState().status, "downloaded");
  assert.equal(h.getState().mandatory, undefined);
  assert.equal(calls.install, 0);
});

test("macOS installs only once Squirrel has staged the required update", async () => {
  const h = harness({ nativeStaging: true });
  const ready = {};
  const calls = launch(h, {
    download: () => {
      h.updater.emit("update-downloaded", { version: "2.0.0" });
      return new Promise((resolve) => { ready.resolve = resolve; });
    },
  });
  await h.coordinator.check(false, { mandatory: true });
  await settle();
  assert.equal(h.getState().status, "preparing");
  assert.equal(calls.install, 0);
  ready.resolve(["/tmp/ArkoBot-2.0.0-mac.zip"]);
  await settle();
  assert.equal(calls.install, 1);
});
