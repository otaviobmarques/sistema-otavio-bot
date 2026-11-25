import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import * as desktop from "../electron/data-dir.mjs";
import { companionHomeFolder } from "../companion/src/state.ts";
import { cloudHomeDataDir } from "./cloud-home-start.ts";
import { DATA_FOLDER, LEGACY_DATA_FOLDER, defaultDataDir } from "./data-dir.ts";
import { defaultSentinelOut } from "./sentinel/paths.ts";

const homes: string[] = [];
const home = () => {
  const dir = mkdtempSync(join(tmpdir(), "arkobot-home-"));
  homes.push(dir);
  return dir;
};
afterEach(() => { for (const dir of homes.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("the data folder", () => {
  it("is ~/.arkobot on a computer that never ran the app", () => {
    const base = home();
    expect(DATA_FOLDER).toBe(".arkobot");
    expect(defaultDataDir(base)).toBe(join(base, ".arkobot"));
  });

  it("stays ~/.openmausbot where an install already keeps its data there, never moved or copied", () => {
    const base = home();
    mkdirSync(join(base, LEGACY_DATA_FOLDER));
    expect(defaultDataDir(base)).toBe(join(base, ".openmausbot"));
    mkdirSync(join(base, DATA_FOLDER));
    expect(defaultDataDir(base), "a stray empty ~/.arkobot never hides the data").toBe(join(base, ".openmausbot"));
  });

  it("is ~/.arkobot once the earlier folder is gone (renamed by hand with the app closed)", () => {
    const base = home();
    mkdirSync(join(base, DATA_FOLDER));
    expect(defaultDataDir(base)).toBe(join(base, ".arkobot"));
  });

  it("resolves the same in the desktop's main process, the companion and a Cloud home", () => {
    for (const legacy of [false, true]) {
      const base = home();
      if (legacy) {
        mkdirSync(join(base, ".openmausbot"));
        mkdirSync(join(base, ".openmausbot-companion"));
      }
      expect(desktop.defaultDataDir(base)).toBe(defaultDataDir(base));
      expect(desktop.homeFolder(base, desktop.COMPANION_FOLDER, desktop.LEGACY_COMPANION_FOLDER)).toBe(companionHomeFolder(base));
      expect(companionHomeFolder(base)).toBe(join(base, legacy ? ".openmausbot-companion" : ".arkobot-companion"));
      expect(cloudHomeDataDir({}, base)).toBe(posix.join(base, legacy ? ".openmausbot" : ".arkobot"));
    }
    expect([desktop.DATA_FOLDER, desktop.LEGACY_DATA_FOLDER]).toEqual([DATA_FOLDER, LEGACY_DATA_FOLDER]);
  });

  it("an OMB_DATA_DIR (the container's /data/.openmausbot) always wins", () => {
    expect(cloudHomeDataDir({ OMB_DATA_DIR: "/data/.openmausbot" }, "/data")).toBe("/data/.openmausbot");
  });

  it("names clean workspaces the desktop may delete by either name, and nothing else", () => {
    for (const name of [".arkobot", ".openmausbot", ".arkobot-test", ".openmausbot-clean"]) expect(desktop.isDataFolderName(name), name).toBe(true);
    for (const name of [".arkobotx", "arkobot", ".ssh", ".openmausbotx"]) expect(desktop.isDataFolderName(name), name).toBe(false);
  });

  it("keeps the sentinel's own folder for either default data folder", () => {
    const base = "/home/me";
    const own = defaultSentinelOut(join(base, ".openmausbot"), "linux", base, {});
    expect(defaultSentinelOut(join(base, ".arkobot"), "linux", base, {})).toBe(own);
    expect(defaultSentinelOut(join(base, "elsewhere"), "linux", base, {})).not.toBe(own);
  });
});

describe("the desktop profile folder", () => {
  it("keeps %APPDATA%\\OpenMausBot when the Windows build, now ArkoBot, finds it", () => {
    const appData = home();
    const current = join(appData, "ArkoBot");
    expect(desktop.pinnedUserData({ appData, current })).toBe(current);
    mkdirSync(join(appData, "OpenMausBot"));
    expect(desktop.pinnedUserData({ appData, current })).toBe(join(appData, "OpenMausBot"));
  });

  it("leaves a build still packaged as OpenMausBot (macOS, Linux) where it is", () => {
    const appData = home();
    mkdirSync(join(appData, "OpenMausBot"));
    expect(desktop.pinnedUserData({ appData, current: join(appData, "OpenMausBot") })).toBe(join(appData, "OpenMausBot"));
    expect(desktop.pinnedUserData({ appData, current: join(appData, "openmausbot") }), "the package name's spelling of it")
      .toBe(join(appData, "openmausbot"));
  });
});
