import assert from "node:assert/strict";
import fs, { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import test from "node:test";
import { createCloudFilesService } from "./cloud-sync.mjs";
import { openSyncState } from "./cloud-sync-state.mjs";
import { movedOutputPath, rebasePath, settleOutputsFolder } from "./outputs-folder.mjs";
import { revealInFolder } from "./save-file.mjs";
import { fakeCloud } from "./fixtures/cloud-sync-fake-cloud.mjs";

const documents = (t) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "omb-outputs-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, "Documents");
};

test("Documents/MausBot alone becomes Documents/ArkoBot, with everything in it", (t) => {
  const docs = documents(t);
  mkdirSync(join(docs, "MausBot", "Owl", "Plan"), { recursive: true });
  writeFileSync(join(docs, "MausBot", "Owl", "Plan", "plan.md"), "the plan");
  const settled = settleOutputsFolder(docs);
  assert.deepEqual(settled, { dir: join(docs, "ArkoBot"), legacy: join(docs, "MausBot"), moved: true, problem: null });
  assert.equal(readFileSync(join(docs, "ArkoBot", "Owl", "Plan", "plan.md"), "utf8"), "the plan");
  assert.equal(existsSync(join(docs, "MausBot")), false);
  assert.equal(settleOutputsFolder(docs).moved, false, "a second start has nothing to move");
});

test("when the rename fails, nothing is lost: Documents/MausBot stays as it was and is used", (t) => {
  const docs = documents(t);
  mkdirSync(join(docs, "MausBot", "Owl"), { recursive: true });
  writeFileSync(join(docs, "MausBot", "Owl", "notes.md"), "kept");
  const refusing = { ...fs, renameSync: () => { throw Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" }); } };
  const settled = settleOutputsFolder(docs, { fs: refusing });
  assert.deepEqual(settled, { dir: join(docs, "MausBot"), legacy: join(docs, "MausBot"), moved: false, problem: "EBUSY" });
  assert.equal(readFileSync(join(docs, "MausBot", "Owl", "notes.md"), "utf8"), "kept");
  assert.equal(existsSync(join(docs, "ArkoBot")), false);
});

test("with both folders, Documents/ArkoBot is used and neither is touched", (t) => {
  const docs = documents(t);
  mkdirSync(join(docs, "MausBot", "Old"), { recursive: true });
  mkdirSync(join(docs, "ArkoBot", "New"), { recursive: true });
  const settled = settleOutputsFolder(docs);
  assert.equal(settled.dir, join(docs, "ArkoBot"));
  assert.equal(settled.moved, false);
  assert.deepEqual(readdirSync(join(docs, "MausBot")), ["Old"]);
  assert.deepEqual(readdirSync(join(docs, "ArkoBot")), ["New"]);
});

test("a computer that never synced gets Documents/ArkoBot, made only when something lands there", (t) => {
  const docs = documents(t);
  assert.deepEqual(settleOutputsFolder(docs), { dir: join(docs, "ArkoBot"), legacy: join(docs, "MausBot"), moved: false, problem: null });
  assert.equal(existsSync(docs), false);
});

test("paths saved before the rename are read on Windows, Linux and macOS alike", () => {
  const win = path.win32;
  assert.equal(rebasePath("C:\\Users\\Ana\\Documents\\MausBot\\Owl\\plan.md", "C:\\Users\\Ana\\Documents\\MausBot", "C:\\Users\\Ana\\Documents\\ArkoBot", win),
    "C:\\Users\\Ana\\Documents\\ArkoBot\\Owl\\plan.md");
  assert.equal(rebasePath("c:/users/ana/documents/mausbot/Owl/plan.md", "C:\\Users\\Ana\\Documents\\MausBot", "C:\\Users\\Ana\\Documents\\ArkoBot", win),
    "C:\\Users\\Ana\\Documents\\ArkoBot\\Owl\\plan.md", "Windows paths compare in any case and with either slash");
  assert.equal(rebasePath("C:\\Users\\Ana\\Documents\\MausBotOld\\x.md", "C:\\Users\\Ana\\Documents\\MausBot", "C:\\Users\\Ana\\Documents\\ArkoBot", win), null);
  assert.equal(rebasePath("\\\\server\\share\\MausBot\\x.md", "C:\\Users\\Ana\\Documents\\MausBot", "C:\\Users\\Ana\\Documents\\ArkoBot", win), null);
  const posix = path.posix;
  assert.equal(rebasePath("/home/ana/Documents/MausBot/Owl/plan.md", "/home/ana/Documents/MausBot", "/home/ana/Documents/ArkoBot", posix), "/home/ana/Documents/ArkoBot/Owl/plan.md");
  assert.equal(rebasePath("/Users/ana/Documents/MausBot", "/Users/ana/Documents/MausBot/", "/Users/ana/Documents/ArkoBot", posix), "/Users/ana/Documents/ArkoBot");
  assert.equal(rebasePath("/home/ana/Documents/mausbot/Owl/plan.md", "/home/ana/Documents/MausBot", "/home/ana/Documents/ArkoBot", posix), null, "Linux names are case-sensitive");
  assert.equal(rebasePath("/home/ana/Documents/MausBot2/plan.md", "/home/ana/Documents/MausBot", "/home/ana/Documents/ArkoBot", posix), null);
});

test("a saved path into Documents/MausBot still opens: from Documents/ArkoBot once the file moved there", (t) => {
  const docs = documents(t);
  mkdirSync(join(docs, "MausBot", "Owl"), { recursive: true });
  writeFileSync(join(docs, "MausBot", "Owl", "plan.md"), "the plan");
  const saved = join(docs, "MausBot", "Owl", "plan.md");
  assert.equal(movedOutputPath(saved, docs), saved, "still there: unchanged");
  settleOutputsFolder(docs);
  assert.equal(movedOutputPath(saved, docs), join(docs, "ArkoBot", "Owl", "plan.md"));
  assert.equal(movedOutputPath(join(docs, "MausBot", "Owl", "gone.md"), docs), join(docs, "MausBot", "Owl", "gone.md"), "in neither: unchanged");
  const untouched = { ...fs, lstatSync: () => { throw new Error("looked at a path outside Documents/MausBot"); } };
  assert.equal(movedOutputPath("\\\\attacker\\share\\x.md", docs, { fs: untouched }), "\\\\attacker\\share\\x.md");
  assert.equal(movedOutputPath(join(docs, "Other", "x.md"), docs, { fs: untouched }), join(docs, "Other", "x.md"));
});

test("Show in folder finds a file a conversation named in Documents/MausBot after the rename", async (t) => {
  const docs = documents(t);
  mkdirSync(join(docs, "MausBot", "Owl"), { recursive: true });
  writeFileSync(join(docs, "MausBot", "Owl", "plan.md"), "the plan");
  settleOutputsFolder(docs);
  const shown = [];
  const reveal = (target) => shown.push(target);
  assert.equal(await revealInFolder(join(docs, "MausBot", "Owl", "plan.md"), { reveal, moved: (file) => movedOutputPath(file, docs) }), "shown");
  assert.deepEqual(shown, [join(docs, "ArkoBot", "Owl", "plan.md")]);
  assert.equal(await revealInFolder(join(docs, "MausBot", "Owl", "nope.md"), { reveal, moved: (file) => movedOutputPath(file, docs) }), "missing");
});

test("Files moves its own records with the folder, so syncing goes on in Documents/ArkoBot and never remakes Documents/MausBot", async (t) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "omb-outputs-service-")));
  let service;
  t.after(() => { service?.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  const home = join(dir, "home"), docs = join(home, "Documents"), stateFile = join(dir, "user", "state.db");
  mkdirSync(join(docs, "MausBot", "Owl", "Plan"), { recursive: true });
  writeFileSync(join(docs, "MausBot", "Owl", "Plan", "plan.md"), "the plan");
  const before = openSyncState(stateFile);
  before.setMeta("botdir:owl", join(docs, "MausBot", "Owl"));
  before.setPlace("bot-owl-t1", join(docs, "MausBot", "Owl", "Plan"));
  before.close();
  const cloud = fakeCloud();
  service = createCloudFilesService({
    settingsFile: join(dir, "user", "settings.json"), stateFile, documentsDir: docs, localDataDir: join(home, ".openmausbot"), homeDir: home,
    platform: process.platform, hostname: "Ana-PC", cloudOrigin: () => "https://omb-u-aaaaaaaaaaaa.fly.dev", fetch: async () => { throw new Error("offline"); },
    trashItem: async (file) => rmSync(file), markDownloaded: async () => {}, createClient: () => cloud.client, watch: () => () => {}, freeBytes: () => 100 * 1024 ** 3,
  });
  assert.equal(service.state().outputs.dir, join(docs, "ArkoBot"));
  assert.equal(service.localFolder({ outputs: true }), join(docs, "ArkoBot"));
  const records = openSyncState(stateFile);
  assert.equal(records.place("bot-owl-t1"), join(docs, "ArkoBot", "Owl", "Plan"));
  assert.equal(records.meta("botdir:owl"), join(docs, "ArkoBot", "Owl"));
  records.close();
  assert.equal(readFileSync(join(docs, "ArkoBot", "Owl", "Plan", "plan.md"), "utf8"), "the plan");
  assert.equal(existsSync(join(docs, "MausBot")), false);
  assert.equal((await service.check(join(docs, "ArkoBot", "Owl"))).refusal, "app-data");
});
