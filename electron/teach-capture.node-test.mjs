import assert from "node:assert/strict";
import test from "node:test";

import { bitmapSignature, registerTeachCaptureIpc, teachCaptureUnavailable } from "./teach-capture.mjs";

test("frames can be taken on Windows, a Mac with Screen Recording access and X11, not on Wayland", () => {
  assert.equal(teachCaptureUnavailable({ platform: "win32", env: {}, screenAccess: null }), null);
  assert.equal(teachCaptureUnavailable({ platform: "darwin", env: {}, screenAccess: "granted" }), null);
  assert.equal(teachCaptureUnavailable({ platform: "darwin", env: {}, screenAccess: "denied" }), "permission");
  assert.equal(teachCaptureUnavailable({ platform: "linux", env: { XDG_SESSION_TYPE: "x11" }, screenAccess: null }), null);
  assert.equal(teachCaptureUnavailable({ platform: "linux", env: { WAYLAND_DISPLAY: "wayland-0" }, screenAccess: null }), "platform");
  assert.equal(teachCaptureUnavailable({ platform: "freebsd", env: {}, screenAccess: null }), "platform");
});

test("a BGRA bitmap becomes a grayscale signature", () => {
  assert.deepEqual(bitmapSignature(Uint8Array.from([0, 0, 0, 255, 255, 255, 255, 255]), 2, 1), [0, 255]);
});

function fakeImage(label, empty = false) {
  return {
    isEmpty: () => empty,
    toDataURL: () => `data:image/png;base64,${label}`,
    toJPEG: (quality) => Buffer.from(`${label}@${quality}`),
    resize: ({ width, height }) => ({ toBitmap: () => new Uint8Array(width * height * 4).fill(128) }),
  };
}

test("lists screens and windows, then grabs one downscaled JPEG of the picked source only", async () => {
  const handlers = new Map();
  const asked = [];
  registerTeachCaptureIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    desktopCapturer: {
      getSources: async (options) => {
        asked.push(options);
        return [
          { id: "screen:0:0", name: "Tela inteira", thumbnail: fakeImage("s") },
          { id: "window:42:0", name: "Planilha", thumbnail: fakeImage("w") },
        ];
      },
    },
    systemPreferences: { getMediaAccessStatus: () => "granted" },
    guard: (_channel, handler) => handler,
    platform: "win32",
    env: {},
  });
  const listed = await handlers.get("teach:sources")({});
  assert.deepEqual(listed.sources.map((source) => [source.kind, source.name]), [["screen", "Tela inteira"], ["window", "Planilha"]]);
  assert.equal(listed.unavailable, null);
  const frame = await handlers.get("teach:frame")({}, "window:42:0");
  assert.equal(Buffer.from(frame.jpeg, "base64").toString(), "w@70");
  assert.equal(frame.signature.length, 160);
  assert.deepEqual(asked.at(-1).types, ["window"]);
  assert.equal(await handlers.get("teach:frame")({}, "window:99:0"), null);
  assert.equal(await handlers.get("teach:frame")({}, 7), null);
});

test("says why instead of listing when frames cannot be taken", async () => {
  const handlers = new Map();
  registerTeachCaptureIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    desktopCapturer: { getSources: async () => assert.fail("must not enumerate") },
    systemPreferences: { getMediaAccessStatus: () => "denied" },
    guard: (_channel, handler) => handler,
    platform: "darwin",
    env: {},
  });
  assert.deepEqual(await handlers.get("teach:sources")({}), { sources: [], unavailable: "permission" });
  assert.equal(await handlers.get("teach:frame")({}, "screen:0:0"), null);
});
