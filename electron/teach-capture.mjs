// Teach-a-task frames come from desktopCapturer thumbnails taken in main, not from getDisplayMedia: this app answers
// display-media requests only on macOS and Linux, and a still picture every two seconds needs no video stream.
// Electron 43: desktopCapturer.getSources works on Windows, macOS (with Screen Recording access) and X11; on Wayland
// each call would open the portal's picker again.

const PICKER_THUMB = { width: 320, height: 200 };
const FRAME_SIZE = { width: 1280, height: 800 };
const JPEG_QUALITY = 70;
const SIGNATURE = { width: 16, height: 10 };

/** @returns {"platform" | "permission" | null} why frames cannot be taken here */
export function teachCaptureUnavailable({ platform, env, screenAccess }) {
  if (platform === "linux") return env.XDG_SESSION_TYPE === "wayland" || env.WAYLAND_DISPLAY ? "platform" : null;
  if (platform === "darwin") return screenAccess === "denied" || screenAccess === "restricted" ? "permission" : null;
  return platform === "win32" ? null : "platform";
}

/** Grayscale 16x10 of a BGRA bitmap, for telling a changed screen from a still one. */
export function bitmapSignature(bgra, width, height) {
  return Array.from({ length: width * height }, (_, i) =>
    Math.round(0.114 * bgra[i * 4] + 0.587 * bgra[i * 4 + 1] + 0.299 * bgra[i * 4 + 2]));
}

const kindOf = (id) => (typeof id === "string" && id.startsWith("window:") ? "window" : "screen");

export function registerTeachCaptureIpc({ ipcMain, desktopCapturer, systemPreferences, guard, platform = process.platform, env = process.env }) {
  const unavailable = () => teachCaptureUnavailable({
    platform,
    env,
    screenAccess: platform === "darwin" ? systemPreferences.getMediaAccessStatus("screen") : null,
  });

  ipcMain.handle("teach:sources", guard("teach:sources", async () => {
    const reason = unavailable();
    if (reason) return { sources: [], unavailable: reason };
    const sources = await desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: PICKER_THUMB, fetchWindowIcons: false });
    return {
      sources: sources.map((source) => ({
        id: source.id,
        name: source.name,
        kind: kindOf(source.id),
        thumbnail: source.thumbnail.isEmpty() ? null : source.thumbnail.toDataURL(),
      })),
      unavailable: null,
    };
  }));

  ipcMain.handle("teach:frame", guard("teach:frame", async (_event, id) => {
    if (typeof id !== "string" || !id || unavailable()) return null;
    const sources = await desktopCapturer.getSources({ types: [kindOf(id)], thumbnailSize: FRAME_SIZE, fetchWindowIcons: false });
    const image = sources.find((source) => source.id === id)?.thumbnail;
    if (!image || image.isEmpty()) return null;
    const small = image.resize({ ...SIGNATURE, quality: "good" });
    return {
      jpeg: image.toJPEG(JPEG_QUALITY).toString("base64"),
      signature: bitmapSignature(small.toBitmap(), SIGNATURE.width, SIGNATURE.height),
    };
  }));
}
