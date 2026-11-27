import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import nativeText from "./native-text.cjs";
import { WELCOME_FINISH_MS, WELCOME_SIZE, welcomeScreenHtml } from "./welcome-screen.mjs";

const attribute = (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
const resource = (name) => fileURLToPath(new URL(`./resources/${name}`, import.meta.url));
/** The ArkoBot loading animation (docs/arkobot/arkobot-loading-icone-protagonista-1920x1080.mp4) cut to this window:
 * 880×600 (2× of 440×300), VP9 WebM with no audio (Chromium plays it without proprietary codecs), its last 0.4 s
 * crossfaded into its first so the loop has no seam. The poster is its frame at 0.4 s, the loop's first. */
export const STARTUP_VIDEO_PATH = resource("startup-splash.webm");
export const STARTUP_POSTER_PATH = resource("startup-splash-poster.webp");
const dataUrl = (file, type) => `data:${type};base64,${fs.readFileSync(file).toString("base64")}`;

export function startupScreenHtml({ t = nativeText.englishText.t, lang = "en", videoPath = STARTUP_VIDEO_PATH, posterPath = STARTUP_POSTER_PATH } = {}) {
  const poster = dataUrl(posterPath, "image/webp");
  const video = dataUrl(videoPath, "video/webm");
  // The video carries its own words (pt-BR); the status line only shows a real message from say(), in the app's language.
  return `<!doctype html><html lang="${attribute(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><title>ArkoBot</title><style>
  *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;font-family:Segoe UI,system-ui,sans-serif;color:#f5f5f5;background:transparent}
  main{height:100%;position:relative;overflow:hidden;border:1px solid #ffffff16;border-radius:20px;background:#02040f url("${poster}") center/cover no-repeat;-webkit-app-region:drag}
  video{position:absolute;inset:0;z-index:0;width:100%;height:100%;object-fit:cover;pointer-events:none;user-select:none}
  h1{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);margin:0;white-space:nowrap}
  .status{position:absolute;z-index:1;left:50%;bottom:14px;transform:translateX(-50%);max-width:calc(100% - 48px);padding:3px 11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#c3ccdb;font-size:12px;line-height:18px;border-radius:999px;background:#02040fcc}
  .status[hidden]{display:none}
  button{position:absolute;z-index:2;right:13px;top:13px;width:30px;height:30px;display:grid;place-items:center;padding:0;color:#999da5;border:0;border-radius:7px;background:transparent;cursor:pointer;-webkit-app-region:no-drag}
  button:hover{color:#fff;background:#ffffff14}button:focus-visible{outline:2px solid #1686ff;outline-offset:2px}button svg{pointer-events:none}
  @media(prefers-reduced-motion:reduce){video{display:none}}
  </style></head><body><main><video src="${video}" poster="${poster}" autoplay muted loop playsinline disablepictureinpicture disableremoteplayback preload="auto" aria-hidden="true"></video><script>(() => {
    const video = document.querySelector("video"), still = matchMedia("(prefers-reduced-motion: reduce)");
    const settle = () => { if (still.matches) { video.removeAttribute("autoplay"); video.pause(); } else void video.play().catch(() => {}); };
    settle(); still.addEventListener("change", settle);
    video.addEventListener("error", () => video.remove());
  })()</script><h1>ArkoBot</h1><button aria-label="${attribute(t("native.common.close"))}" onclick="window.startupScreen.close()"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button><div class="status" role="status" hidden></div></main></body></html>`;
}

export function createStartupScreen({
  BrowserWindow, iconPath, platform = process.platform, isQuitting, onQuit,
  onHide, isHidden = () => false, onShow, onFinished, t, lang,
  /** { kind: "installed" | "updated", version }: the first open after an install or update shows the welcome. */
  welcome = null,
}) {
  let disposed = false, revealed = false, fallback, resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const splash = new BrowserWindow({
    ...(welcome ? WELCOME_SIZE : { width: 440, height: 300 }), resizable: false, maximizable: false,
    fullscreenable: false, frame: false, transparent: true,
    backgroundColor: "#00000000", show: false, icon: iconPath,
    title: "ArkoBot", autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      preload: fileURLToPath(new URL("./startup-screen-preload.cjs", import.meta.url)),
    },
  });
  splash.setMenu(null);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(fallback);
    resolveReady();
    if (!splash.isDestroyed()) splash.destroy();
    onFinished?.();
  };
  splash.on("close", event => {
    if (disposed || isQuitting()) return;
    event.preventDefault();
    if (platform === "win32" && onHide) onHide(splash);
    else onQuit();
  });
  // Renderer window.close() bypasses BrowserWindow's cancellable close path, so the page asks for the native one.
  splash.webContents.on("ipc-message", (_event, channel) => {
    if (channel === "startup-screen:close" && !disposed) splash.close();
  });
  let shown = false;
  const showSplash = () => {
    if (shown || disposed || isQuitting()) return;
    shown = true; splash.show(); resolveReady();
  };
  splash.once("ready-to-show", showSplash);
  // Some Wayland compositors (COSMIC) never paint a hidden window, so ready-to-show never comes.
  splash.webContents.once("did-finish-load", () => {
    const grace = setTimeout(showSplash, 500);
    grace.unref?.();
  });
  splash.on("show", () => onShow?.(splash));
  splash.once("closed", resolveReady);
  // The splash stays until the main window replaces it: as the only window, destroying it would quit the app.
  splash.webContents.once("render-process-gone", resolveReady);
  let said = null;
  const say = () => {
    if (said === null || disposed || splash.isDestroyed()) return;
    void splash.webContents.executeJavaScript(`(() => { const line = document.querySelector('.status'); if (line) { line.textContent = ${JSON.stringify(said)}; line.hidden = !line.textContent.trim(); } })()`).catch(() => {});
  };
  splash.webContents.on("did-finish-load", say);
  const startupFallback = setTimeout(resolveReady, 10_000);
  startupFallback.unref?.();
  void splash.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(welcome
    ? welcomeScreenHtml({ t, lang, kind: welcome.kind, version: welcome.version })
    : startupScreenHtml({ t, lang })))
    .catch(resolveReady);
  const attach = (win, { maximized = false } = {}) => {
    let finishing = null;
    // The welcome first plays its last step ("Pronto"), then the app's window replaces it.
    const reveal = () => {
      if (!welcome || revealed || disposed || splash.isDestroyed()) return show();
      if (finishing) return;
      void splash.webContents.executeJavaScript("window.welcomeFinish?.()").catch(() => {});
      finishing = setTimeout(show, WELCOME_FINISH_MS);
      finishing.unref?.();
    };
    const show = () => {
      if (revealed || win.isDestroyed() || isQuitting()) return;
      revealed = true;
      clearTimeout(finishing);
      const minimized = !splash.isDestroyed() && splash.isMinimized();
      if (isHidden()) {
        win.setSkipTaskbar(true);
        win.hide();
        if (maximized) win.once("show", () => win.maximize());
      } else {
        if (maximized) win.maximize();
        if (minimized) { win.showInactive(); win.minimize(); }
        else { win.show(); win.focus(); }
      }
      dispose();
    };
    win.webContents.on("did-finish-load", () => {
      if (revealed || win.isDestroyed() || isQuitting()) return;
      void win.webContents.executeJavaScript(`new Promise(resolve => {
        const root = document.getElementById('root');
        if (!root || root.childElementCount) { resolve(); return; }
        const observer = new MutationObserver(() => {
          if (root.childElementCount) { observer.disconnect(); resolve(); }
        });
        observer.observe(root, { childList: true });
      })`).then(reveal).catch(reveal);
    });
    win.webContents.once("render-process-gone", reveal);
    win.once("show", () => { if (!revealed) { revealed = true; dispose(); } });
    win.once("closed", dispose);
    fallback = setTimeout(reveal, 10_000);
    fallback.unref?.();
  };
  /** A real progress line (already in the app's language) shown over the animation; empty hides it again. */
  const status = (text) => { said = String(text); say(); };
  return { ready, attach, dispose, status, window: splash };
}
