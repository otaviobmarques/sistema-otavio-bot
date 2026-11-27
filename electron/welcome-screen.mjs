// The first open after an install or an update: instead of the looping logo video, an animated welcome with the steps
// (installed or updated → preparing your bots → ready). The installer itself stays the quick one-click NSIS window;
// this is what the user watches while the app's own server starts. Same window and rules as the startup screen
// (startup-screen.mjs); only the page differs. Everything is inline: the page has no network, files or app bridge.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import nativeText from "./native-text.cjs";

const attribute = (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
const resource = (name) => fileURLToPath(new URL(`./resources/${name}`, import.meta.url));

/** Five of the ArkoBot characters, cut from docs/arkobot/personagens/originais to 176 px. */
export const WELCOME_CHARACTERS = ["astronauta", "atendimento", "chef", "engenheiro", "gamer"].map((name) => resource(`welcome-${name}.webp`));
/** The welcome window is a little larger than the plain startup screen (440×300). */
export const WELCOME_SIZE = Object.freeze({ width: 520, height: 380 });
/** How long "Pronto" shows, all steps done, before the app's window replaces this one. */
export const WELCOME_FINISH_MS = 1_100;

/** "installed" on a first run (no version recorded), "updated" when the version changed, else null. */
export function welcomeKind(startupDecision) {
  if (startupDecision?.reason === "no-persisted-version") return "installed";
  if (startupDecision?.reason === "version-change") return "updated";
  return null;
}

const dataUrl = (file) => `data:image/webp;base64,${fs.readFileSync(file).toString("base64")}`;

const ICON = `<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M512 150 L812 770 L512 640 L212 770 Z" fill="none" stroke="#00E8F8" stroke-width="52" stroke-linejoin="round"/><rect x="398" y="400" width="228" height="148" rx="56" fill="#00E8F8"/><circle class="eye" cx="465" cy="474" r="26" fill="#050817"/><circle class="eye" cx="559" cy="474" r="26" fill="#050817"/></svg>`;
const CHECK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function welcomeScreenHtml({ t = nativeText.englishText.t, lang = "en", kind = "installed", version = "", characters = WELCOME_CHARACTERS } = {}) {
  const title = kind === "updated" ? t("native.welcome.updatedTitle", { version }) : t("native.welcome.installedTitle");
  const first = kind === "updated" ? t("native.welcome.stepUpdated") : t("native.welcome.stepInstalled");
  const faces = characters.map((file, index) => `<img src="${dataUrl(file)}" alt="" style="--i:${index}">`).join("");
  return `<!doctype html><html lang="${attribute(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><title>ArkoBot</title><style>
  *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;font-family:Segoe UI,system-ui,sans-serif;color:#f5f7fb;background:transparent}
  main{height:100%;position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;padding:30px 30px 0;border:1px solid #ffffff16;border-radius:22px;
    background:radial-gradient(120% 80% at 50% 0%,#0a2a3a 0%,#041021 45%,#02040f 100%);-webkit-app-region:drag}
  main::before{content:"";position:absolute;inset:-40%;background:radial-gradient(closest-side,#00e8f826,transparent 70%);animation:breathe 4s ease-in-out infinite;pointer-events:none}
  .logo{position:relative;width:92px;height:92px;display:grid;place-items:center;animation:pop .6s cubic-bezier(.2,1.6,.4,1) both}
  .logo svg{width:52px;height:52px;filter:drop-shadow(0 0 10px #00e8f8aa)}
  .logo::before{content:"";position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,transparent 0 55%,#00e8f8 85%,transparent 100%);
    -webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2px));animation:spin 1.4s linear infinite}
  .logo::after{content:"";position:absolute;inset:0;border-radius:50%;border:1px solid #00e8f833}
  .eye{animation:blink 4.5s infinite;transform-origin:center;transform-box:fill-box}
  h1{position:relative;margin:16px 0 2px;font-size:21px;font-weight:700;letter-spacing:.2px;text-align:center;animation:rise .5s .15s both}
  .version{position:relative;margin:0;color:#8fa3bf;font-size:12px;animation:rise .5s .25s both}
  .crew{position:relative;display:flex;gap:10px;margin:18px 0 16px;height:74px;align-items:flex-end}
  .crew img{width:58px;height:58px;object-fit:contain;filter:drop-shadow(0 6px 6px #0008);
    animation:enter .5s calc(.35s + var(--i) * .12s) cubic-bezier(.2,1.6,.4,1) both,hop 1.6s calc(1s + var(--i) * .18s) ease-in-out infinite}
  .done .crew img{animation:enter .5s 0s both,cheer .55s calc(var(--i) * .07s) cubic-bezier(.2,1.6,.4,1) 2}
  ol{position:relative;display:flex;gap:8px;margin:0;padding:0;list-style:none;animation:rise .5s .5s both}
  li{display:flex;align-items:center;gap:6px;padding:5px 11px 5px 7px;border-radius:999px;font-size:12px;color:#7d8da6;background:#ffffff0a;border:1px solid #ffffff10;transition:all .35s}
  li i{width:16px;height:16px;border-radius:50%;display:grid;place-items:center;border:2px solid #44536b;flex:none;transition:all .35s}
  li i svg{width:11px;height:11px;opacity:0;transform:scale(.3);transition:all .3s cubic-bezier(.2,1.6,.4,1)}
  li.on{color:#e6faff;border-color:#00e8f855;background:#00e8f814}li.on i{border-color:#00e8f8 #00e8f833 #00e8f833;animation:spin .8s linear infinite}
  li.ok{color:#c8f7ff}li.ok i{border-color:#00e8f8;background:#00e8f8;color:#02101a;animation:none}li.ok i svg{opacity:1;transform:none}
  .bar{position:relative;width:100%;max-width:400px;height:6px;margin-top:16px;border-radius:99px;background:#ffffff12;overflow:hidden;animation:rise .5s .6s both}
  .bar b{position:absolute;inset:0 auto 0 0;width:0;border-radius:inherit;background:linear-gradient(90deg,#0098c8,#00e8f8);transition:width .4s ease-out;overflow:hidden}
  .bar b::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,#ffffff80,transparent);transform:translateX(-100%);animation:shine 1.3s ease-in-out infinite}
  .status{position:absolute;z-index:1;left:50%;bottom:12px;transform:translateX(-50%);max-width:calc(100% - 48px);padding:3px 11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#c3ccdb;font-size:12px;line-height:18px;border-radius:999px;background:#02040fcc}
  .status[hidden]{display:none}
  button{position:absolute;z-index:2;right:13px;top:13px;width:30px;height:30px;display:grid;place-items:center;padding:0;color:#999da5;border:0;border-radius:7px;background:transparent;cursor:pointer;-webkit-app-region:no-drag}
  button:hover{color:#fff;background:#ffffff14}button:focus-visible{outline:2px solid #1686ff;outline-offset:2px}button svg{pointer-events:none}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes breathe{50%{opacity:.55;transform:scale(1.08)}}
  @keyframes pop{from{opacity:0;transform:scale(.4)}}
  @keyframes rise{from{opacity:0;transform:translateY(10px)}}
  @keyframes enter{from{opacity:0;transform:translateY(24px) scale(.5)}}
  @keyframes hop{0%,55%,100%{transform:translateY(0) scale(1)}20%{transform:translateY(-12px) scale(.96,1.05)}40%{transform:translateY(0) scale(1.06,.94)}}
  @keyframes cheer{50%{transform:translateY(-18px) rotate(-6deg) scale(1.08)}}
  @keyframes blink{0%,94%,100%{transform:scaleY(1)}97%{transform:scaleY(.1)}}
  @keyframes shine{to{transform:translateX(100%)}}
  @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
  </style></head><body><main>
  <div class="logo">${ICON}</div>
  <h1>${attribute(title)}</h1>${version ? `<p class="version">v${attribute(version)}</p>` : ""}
  <div class="crew" aria-hidden="true">${faces}</div>
  <ol>
    <li class="ok"><i>${CHECK}</i><span>${attribute(first)}</span></li>
    <li class="on"><i>${CHECK}</i><span>${attribute(t("native.welcome.stepPreparing"))}</span></li>
    <li><i>${CHECK}</i><span>${attribute(t("native.welcome.stepReady"))}</span></li>
  </ol>
  <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><b></b></div>
  <button aria-label="${attribute(t("native.common.close"))}" onclick="window.startupScreen.close()"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button><div class="status" role="status" hidden></div>
  </main><script>(() => {
    const bar = document.querySelector(".bar"), fill = bar.firstElementChild, steps = document.querySelectorAll("li");
    let progress = 8, finished = false;
    const paint = () => { fill.style.width = progress + "%"; bar.setAttribute("aria-valuenow", String(Math.round(progress))); };
    paint();
    // No real percentage exists while the server starts: it creeps toward 92 % and jumps to the end when the app is up.
    const creep = setInterval(() => { if (!finished) { progress += (92 - progress) * 0.035; paint(); } }, 120);
    window.welcomeFinish = () => {
      if (finished) return;
      finished = true; clearInterval(creep); progress = 100; paint();
      steps[1].className = "ok";
      setTimeout(() => { steps[2].className = "ok"; document.querySelector("main").classList.add("done"); }, 250);
    };
  })()</script></body></html>`;
}
