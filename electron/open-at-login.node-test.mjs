import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { autostartEntry, createOpenAtLogin, installOpenAtLogin, migrateLegacyWindowsLoginItems } from "./open-at-login.mjs";

/** Electron's login item API on macOS and Windows: one item per name, as Windows keeps one Run entry per name. */
function fakeApp({ openAtLogin = false, isPackaged = true } = {}) {
  const items = new Map(openAtLogin ? [["OpenMausBot", { args: [] }]] : []);
  return {
    isPackaged, items, wasOpenedAtLogin: false,
    getLoginItemSettings() {
      return { openAtLogin: items.size > 0, wasOpenedAtLogin: this.wasOpenedAtLogin, launchItems: [...items].map(([name, item]) => ({ name, args: item.args, enabled: true })) };
    },
    setLoginItemSettings({ openAtLogin: on, args = [], name = "OpenMausBot" }) { if (on) items.set(name, { args }); else items.delete(name); },
  };
}

const temp = async t => { const dir = await mkdtemp(path.join(os.tmpdir(), "omb-open-at-login-")); t.after(() => rm(dir, { recursive: true, force: true })); return dir; };

test("macOS: the person's own login item opens the window, and lending never takes it away", async t => {
  const dir = await temp(t);
  const app = fakeApp();
  const login = createOpenAtLogin({ app, file: path.join(dir, "mac.json"), platform: "darwin", home: dir });
  assert.equal(login.chosen(), false);
  login.choose(true);
  assert.equal(login.chosen(), true);
  app.wasOpenedAtLogin = true;
  assert.equal(login.startedHidden(), false, "a launch from the person's own item opens the window");
  login.follow(true);
  login.follow(false);
  assert.equal(login.chosen(), true, "lending stopping leaves it");
  login.choose(false);
  assert.equal(app.getLoginItemSettings().openAtLogin, false);
});

test("macOS: choosing it while lending added one makes it the person's, so it opens the window and stays", async t => {
  const dir = await temp(t);
  const app = fakeApp();
  const login = createOpenAtLogin({ app, file: path.join(dir, "mac.json"), platform: "darwin", home: dir });
  login.follow(true);
  assert.equal(login.chosen(), false, "lending's own item is not the person's choice");
  login.choose(true);
  app.wasOpenedAtLogin = true;
  assert.deepEqual([login.chosen(), login.startedHidden()], [true, false]);
  login.follow(false);
  assert.equal(app.getLoginItemSettings().openAtLogin, true);
});

test("Windows: the person's item has a name of its own, apart from lending's hidden one", async t => {
  const dir = await temp(t);
  const app = fakeApp();
  const login = createOpenAtLogin({ app, file: path.join(dir, "win.json"), platform: "win32", home: dir, argv: ["ArkoBot.exe"] });
  login.follow(true);
  login.choose(true);
  assert.equal(login.chosen(), true);
  assert.deepEqual(app.items.get("ArkoBot at login"), { args: [] }, "no hidden flag");
  login.follow(false);
  assert.equal(login.chosen(), true, "lending stopping leaves it");
  login.choose(false);
  assert.equal(login.chosen(), false);
});

const EXE = "C:\\Users\\me\\AppData\\Local\\Programs\\openmausbot\\ArkoBot.exe";
const LEGACY_EXE = "C:\\Users\\me\\AppData\\Local\\Programs\\openmausbot\\OpenMausBot.exe";

/** Electron 43's login item API on Windows: one Run entry per name (the AppUserModelId, set to the appId, unless
 * named), `openAtLogin` true only for that default entry with exactly the asked `args`, and `launchItems` listing every
 * entry that starts the asked executable (`path`, this one unless given). */
function windowsApp(entries = []) {
  const items = new Map(entries.map(({ name, args = [], enabled = true, path = EXE }) => [name, { args, enabled, ...(path === EXE ? {} : { path }) }]));
  const DEFAULT = "com.openmausbot.app";
  const file = (item) => item.path ?? EXE;
  return {
    isPackaged: true, items,
    getLoginItemSettings({ args = [], path = EXE } = {}) {
      const own = items.get(DEFAULT);
      return {
        openAtLogin: Boolean(own) && file(own) === path && JSON.stringify(own.args) === JSON.stringify(args),
        launchItems: [...items].filter(([, item]) => file(item) === path).map(([name, item]) => ({ name, path: file(item), args: item.args, scope: "user", enabled: item.enabled })),
      };
    },
    setLoginItemSettings({ openAtLogin: on, args = [], name = DEFAULT, path = EXE, enabled = true }) {
      if (on) items.set(name, { args, enabled, ...(path === EXE ? {} : { path }) }); else items.delete(name);
    },
  };
}

test("Windows: an update from OpenMausBot.exe points its login entries at ArkoBot.exe, each as on or off as it was", async t => {
  const dir = await temp(t);
  const app = windowsApp([
    { name: "electron.app.OpenMausBot", args: ["--omb-hidden"], path: LEGACY_EXE },
    { name: "OpenMausBot at login", path: LEGACY_EXE, enabled: false },
    { name: "Something else", path: "C:\\Other\\other.exe" },
  ]);
  assert.equal(migrateLegacyWindowsLoginItems({ app, platform: "win32", execPath: EXE }), 2);
  assert.deepEqual([...app.items].sort(), [
    ["ArkoBot at login", { args: [], enabled: false }],
    ["Something else", { args: [], enabled: true, path: "C:\\Other\\other.exe" }],
    ["com.openmausbot.app", { args: ["--omb-hidden"], enabled: true }],
  ]);
  const login = createOpenAtLogin({ app, file: path.join(dir, "win.json"), platform: "win32", home: dir, argv: ["ArkoBot.exe"] });
  assert.equal(login.chosen(), true, "lending's entry still starts the app");
  login.follow(true);
  assert.equal(app.items.size, 3, "lending finds its own entry instead of adding a second");
  assert.equal(migrateLegacyWindowsLoginItems({ app, platform: "win32", execPath: EXE }), 0, "once only");
});

test("Windows: entries this executable already starts under the earlier names are renamed too", () => {
  const app = windowsApp([{ name: "electron.app.openmausbot", args: ["--omb-hidden"] }, { name: "OpenMausBot at login" }]);
  assert.equal(migrateLegacyWindowsLoginItems({ app, platform: "win32", execPath: EXE }), 2);
  assert.deepEqual([...app.items.keys()].sort(), ["ArkoBot at login", "com.openmausbot.app"]);
});

test("login entries are left alone off Windows and in development", () => {
  const app = windowsApp([{ name: "electron.app.OpenMausBot", path: LEGACY_EXE }]);
  assert.equal(migrateLegacyWindowsLoginItems({ app, platform: "darwin", execPath: EXE }), 0);
  assert.equal(migrateLegacyWindowsLoginItems({ app: { ...app, isPackaged: false }, platform: "win32", execPath: EXE }), 0);
  assert.equal(app.items.size, 1);
});

test("Windows: Settings shows on while Windows already starts the app, even from lending's hidden entry", async t => {
  const dir = await temp(t);
  const app = windowsApp([{ name: "com.openmausbot.app", args: ["--omb-hidden"] }]);
  const login = createOpenAtLogin({ app, file: path.join(dir, "win.json"), platform: "win32", home: dir, argv: ["ArkoBot.exe"] });
  const handlers = new Map();
  installOpenAtLogin({ ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) }, guard: (_channel, handler) => handler, loginItem: login, changed: () => {} });
  assert.deepEqual(await handlers.get("open-at-login:state")({}), { available: true, on: true });
  app.items.get("com.openmausbot.app").enabled = false;
  assert.equal(login.chosen(), false, "an entry turned off in Task Manager starts nothing");
});

test("Windows: turning it off removes every entry that starts the app, and lending adds none until it is on again", async t => {
  const dir = await temp(t);
  const app = windowsApp([{ name: "com.openmausbot.app", args: ["--omb-hidden"] }, { name: "ArkoBot at login" }]);
  const login = createOpenAtLogin({ app, file: path.join(dir, "win.json"), platform: "win32", home: dir, argv: ["ArkoBot.exe"] });
  login.choose(false);
  assert.deepEqual([...app.items.keys()], []);
  login.follow(true);
  assert.equal(login.chosen(), false, "lending keeps to the person's choice");
  login.choose(true);
  login.follow(true);
  assert.deepEqual([...app.items].sort(), [["ArkoBot at login", { args: [], enabled: true }], ["com.openmausbot.app", { args: ["--omb-hidden"], enabled: true }]]);
});

test("Linux: the person's autostart entry has no hidden flag and no lending mark, and lending never removes it", async t => {
  const dir = await temp(t);
  const config = path.join(dir, "config");
  const entry = path.join(config, "autostart", "openmausbot.desktop");
  const login = createOpenAtLogin({ app: fakeApp(), file: path.join(dir, "linux.json"), platform: "linux", home: dir, env: { XDG_CONFIG_HOME: config, APPIMAGE: "/home/me/OpenMausBot.AppImage" } });
  login.choose(true);
  assert.equal(await readFile(entry, "utf8"), autostartEntry("/home/me/OpenMausBot.AppImage", { lending: false }));
  assert.doesNotMatch(await readFile(entry, "utf8"), /--omb-hidden|X-OpenMausBot-Lending/);
  assert.equal(login.chosen(), true);
  login.follow(false);
  assert.equal(existsSync(entry), true, "lending stopping leaves it");
  login.choose(false);
  assert.equal(existsSync(entry), false);
});

test("a build that cannot add a login item offers no switch and changes nothing", async t => {
  const dir = await temp(t);
  const app = fakeApp({ isPackaged: false });
  const login = createOpenAtLogin({ app, file: path.join(dir, "dev.json"), platform: "darwin", home: dir });
  const handlers = new Map();
  let redraws = 0;
  installOpenAtLogin({ ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) }, guard: (_channel, handler) => handler, loginItem: login, changed: () => redraws++ });
  assert.deepEqual(await handlers.get("open-at-login:state")({}), { available: false, on: false });
  await handlers.get("open-at-login:set")({}, true);
  assert.equal(app.getLoginItemSettings().openAtLogin, false);
  const packaged = createOpenAtLogin({ app: fakeApp(), file: path.join(dir, "mac.json"), platform: "darwin", home: dir });
  installOpenAtLogin({ ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) }, guard: (_channel, handler) => handler, loginItem: packaged, changed: () => redraws++ });
  assert.deepEqual(await handlers.get("open-at-login:set")({}, true), { available: true, on: true });
  assert.deepEqual(await handlers.get("open-at-login:set")({}, "yes"), { available: true, on: false }, "only a real true turns it on");
  assert.equal(redraws, 3, "the app menu's item is drawn again after each change");
});
