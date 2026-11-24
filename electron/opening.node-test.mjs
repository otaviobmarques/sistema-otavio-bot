import assert from "node:assert/strict";
import test from "node:test";

import { registerDesktopPrefs } from "./desktop-prefs.mjs";
import { createOpening, openingAllowed } from "./opening.mjs";

test("an installed app plays the opening; development, smoke tests and OMB_OPENING=0 do not", () => {
  assert.equal(openingAllowed({}, true), true);
  assert.equal(openingAllowed({}, false), false);
  assert.equal(openingAllowed({ OMB_OPENING: "1" }, false), true);
  assert.equal(openingAllowed({ OMB_SMOKE_TEST: "1" }, true), false);
  assert.equal(openingAllowed({ OMB_SMOKE_TEST: "1", OMB_OPENING: "1" }, false), false);
  assert.equal(openingAllowed({ OMB_OPENING: "0" }, true), false);
});

test("the opening plays once per launch: not again on a reload or another server's page", () => {
  const opening = createOpening({ choice: () => ({ on: true, sound: true }), allowed: () => true });
  assert.deepEqual(opening.claim(), { play: true, sound: true });
  assert.deepEqual(opening.claim(), { play: false, sound: false });
  assert.deepEqual(opening.claim(), { play: false, sound: false });
});

test("Settings turn the opening or its sound off", () => {
  assert.deepEqual(createOpening({ choice: () => ({ on: false, sound: true }), allowed: () => true }).claim(), { play: false, sound: false });
  assert.deepEqual(createOpening({ choice: () => ({ on: true, sound: false }), allowed: () => true }).claim(), { play: true, sound: false });
  assert.deepEqual(createOpening({ choice: () => ({ on: true, sound: true }), allowed: () => false }).claim(), { play: false, sound: false });
});

test("the desktop keeps the choice, on with sound by default, and answers every page of its window", async () => {
  const handlers = new Map();
  let saved = {};
  registerDesktopPrefs({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), on: () => {} },
    read: () => saved, write: (value) => { saved = value; }, page: () => "server", cloudOffered: async () => false,
    openingAllowed: () => true,
  });
  assert.deepEqual(await handlers.get("opening:state")({}), { on: true, sound: true });
  assert.deepEqual(await handlers.get("opening:set")({}, { sound: false }), { on: true, sound: false });
  assert.deepEqual(await handlers.get("opening:set")({}, { on: false }), { on: false, sound: false });
  assert.equal(saved.opening, false);
  assert.deepEqual(await handlers.get("opening:claim")({}), { play: false, sound: false });
  await handlers.get("opening:set")({}, { on: true, sound: true });
  assert.deepEqual(await handlers.get("opening:claim")({}), { play: false, sound: false }, "this launch already asked");
});
