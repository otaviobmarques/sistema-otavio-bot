import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import nativeText from "./native-text.cjs";
import { createStartupScreen } from "./startup-screen.mjs";
import { WELCOME_CHARACTERS, WELCOME_FINISH_MS, WELCOME_SIZE, welcomeKind, welcomeScreenHtml } from "./welcome-screen.mjs";

const iconPath = fileURLToPath(new URL("./resources/app-icon.png", import.meta.url));

class Window extends EventEmitter {
  constructor(options = {}) {
    super(); this.options = options; this.destroyed = false; this.scripts = [];
    this.webContents = new EventEmitter();
    this.webContents.executeJavaScript = async (code) => { this.scripts.push(code); };
  }
  setMenu() {}
  loadURL(url) { this.url = url; queueMicrotask(() => this.emit("ready-to-show")); return Promise.resolve(); }
  isDestroyed() { return this.destroyed; }
  destroy() { this.destroyed = true; this.emit("closed"); }
  show() { this.visible = true; this.emit("show"); }
  focus() {}
  isMinimized() { return false; }
}

const splashWith = (welcome) => createStartupScreen({ BrowserWindow: Window, iconPath, platform: "win32",
  isQuitting: () => false, onQuit: () => {}, welcome });

test("the welcome shows after an install or an update, never on an ordinary open", () => {
  assert.equal(welcomeKind({ reason: "no-persisted-version" }), "installed");
  assert.equal(welcomeKind({ reason: "version-change" }), "updated");
  assert.equal(welcomeKind({ reason: "same-version" }), null);
  assert.equal(welcomeKind({ reason: "unknown-version" }), null);
  assert.equal(welcomeKind(undefined), null);
});

test("the welcome page says what happened in the app's language and loads nothing from outside", () => {
  const pt = nativeText.createNativeText({ saved: "pt-br" });
  const installed = welcomeScreenHtml({ t: pt.t, lang: "pt-BR", kind: "installed", version: "0.1.162" });
  assert.match(installed, /Bem-vindo ao ArkoBot/);
  assert.match(installed, /Instalado/);
  assert.match(installed, /Preparando seus bots/);
  assert.match(installed, /v0\.1\.162/);
  const updated = welcomeScreenHtml({ t: pt.t, kind: "updated", version: "0.1.162" });
  assert.match(updated, /ArkoBot atualizado para a versão 0\.1\.162/);
  assert.match(updated, /Atualizado/);
  assert.doesNotMatch(installed, /(?:src|href)="(?!data:)/, "every image is inline");
  assert.match(installed, /default-src 'none'/);
  assert.equal((installed.match(/<img /g) ?? []).length, WELCOME_CHARACTERS.length);
});

test("the welcome's words exist in English, so every language falls back to a real sentence", () => {
  const en = nativeText.englishText.t;
  for (const key of ["installedTitle", "updatedTitle", "stepInstalled", "stepUpdated", "stepPreparing", "stepReady"]) {
    assert.notEqual(en(`native.welcome.${key}`), `native.welcome.${key}`);
  }
});

test("the characters ship small", () => {
  for (const file of WELCOME_CHARACTERS) assert.ok(statSync(file).size < 20_000, file);
});

test("the welcome opens a larger window and plays its last step before the app replaces it", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const splash = splashWith({ kind: "installed", version: "0.1.162" });
  assert.equal(splash.window.options.width, WELCOME_SIZE.width);
  assert.match(decodeURIComponent(splash.window.url), /Bem-vindo|Welcome/);
  const win = new Window();
  splash.attach(win);
  win.webContents.emit("did-finish-load");
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(splash.window.scripts.some(code => code.includes("welcomeFinish")), "the steps finish first");
  assert.equal(win.visible, undefined, "the app waits for the last step");
  t.mock.timers.tick(WELCOME_FINISH_MS);
  assert.equal(win.visible, true);
  assert.equal(splash.window.destroyed, true);
});

test("an ordinary open keeps the plain startup screen and reveals the app at once", async () => {
  const splash = splashWith(null);
  assert.equal(splash.window.options.width, 440);
  const win = new Window();
  splash.attach(win);
  win.webContents.emit("did-finish-load");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(win.visible, true);
});
