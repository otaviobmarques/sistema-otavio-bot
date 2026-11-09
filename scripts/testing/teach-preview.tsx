// The disposable Teach-a-task fixture: the real app with a stand-in desktop bridge whose screen is drawn here and
// whose speech helper speaks a script. No screen, window or microphone of this computer is read.
import { createRoot } from "react-dom/client";
import App from "../../src/App";
import { initialDesktopCapabilities } from "../../src/lib/desktop";
import { setAnalyticsEnabled, setEmailGateDone } from "../../src/lib/analytics";
import { markSimpleModePromptSeen } from "../../src/lib/simple-mode-prompt";
import { GROK_MOVE_NOTICE } from "../../src/lib/notices";
import "../../src/styles.css";

type Line = { text?: string; partial?: boolean };
const NARRATION = [
  "Primeiro eu abro o portal da prefeitura e entro com o certificado.",
  "Depois clico em Emitir nota, preencho o CNPJ do tomador e o valor do serviço.",
  "Antes de emitir eu confiro o código do serviço e só então clico em Emitir.",
];
const SCREENS = [
  { title: "nfse.exemplo.gov.br — Entrar", body: ["Certificado digital", "Entrar"], color: "#1f4e79" },
  { title: "nfse.exemplo.gov.br — Início", body: ["Emitir nota", "Consultar notas", "Sair"], color: "#2e7d32" },
  { title: "Emitir nota — Tomador", body: ["CNPJ do tomador: 12.345.678/0001-90", "Valor: R$ 1.500,00"], color: "#6a1b9a" },
  { title: "Emitir nota — Serviço", body: ["Código do serviço: 1.07", "Emitir"], color: "#b71c1c" },
];

let grabs = 0;
let spoken = 0;
const lines = new Set<(line: Line) => void>();
const ends = new Set<(info: { code: number }) => void>();
let speaking: ReturnType<typeof setInterval> | null = null;

function draw(screen: (typeof SCREENS)[number], width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#f4f6f8";
  g.fillRect(0, 0, width, height);
  g.fillStyle = screen.color;
  g.fillRect(0, 0, width, height * 0.12);
  g.fillStyle = "#fff";
  g.font = `${Math.round(height * 0.05)}px sans-serif`;
  g.fillText(screen.title, width * 0.03, height * 0.08);
  g.fillStyle = "#222";
  screen.body.forEach((text, i) => {
    g.fillStyle = i === screen.body.length - 1 ? screen.color : "#ddd";
    g.fillRect(width * 0.1, height * (0.25 + i * 0.18), width * 0.6, height * 0.12);
    g.fillStyle = i === screen.body.length - 1 ? "#fff" : "#222";
    g.fillText(text, width * 0.12, height * (0.33 + i * 0.18));
  });
  return canvas;
}

function signature(canvas: HTMLCanvasElement): number[] {
  const small = document.createElement("canvas");
  small.width = 16;
  small.height = 10;
  const g = small.getContext("2d")!;
  g.drawImage(canvas, 0, 0, 16, 10);
  const data = g.getImageData(0, 0, 16, 10).data;
  return Array.from({ length: 160 }, (_, i) => Math.round(0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!));
}

window.ogb = {
  platform: "darwin",
  getCapabilities: async () => initialDesktopCapabilities(),
  teachCapture: {
    sources: async () => ({
      sources: [
        { id: "screen:1:0", name: "Tela inteira", kind: "screen" as const, thumbnail: draw(SCREENS[1]!, 320, 200).toDataURL() },
        { id: "window:7:0", name: "Portal NFS-e — Chrome", kind: "window" as const, thumbnail: draw(SCREENS[0]!, 320, 200).toDataURL() },
        { id: "window:9:0", name: "Planilha de clientes", kind: "window" as const, thumbnail: null },
      ],
      unavailable: null,
    }),
    frame: async () => {
      const canvas = draw(SCREENS[Math.min(SCREENS.length - 1, Math.floor(grabs++ / 2))]!, 1280, 800);
      return { jpeg: canvas.toDataURL("image/jpeg", 0.7).split(",")[1]!, signature: signature(canvas) };
    },
  },
  speechStart: async () => {
    let said = "";
    speaking = setInterval(() => {
      if (spoken >= NARRATION.length) return;
      said = `${said} ${NARRATION[spoken++]}`.trim();
      for (const cb of lines) cb({ text: said, partial: true });
    }, 1_500);
  },
  speechStop: async () => {
    if (speaking) clearInterval(speaking);
    speaking = null;
  },
  speechFinish: async () => {
    if (speaking) clearInterval(speaking);
    speaking = null;
    for (const cb of ends) cb({ code: 0 });
  },
  onSpeechTranscript: (cb: (line: Line) => void) => {
    lines.add(cb);
    return () => lines.delete(cb);
  },
  onSpeechEnd: (cb: (info: { code: number }) => void) => {
    ends.add(cb);
    return () => ends.delete(cb);
  },
} as unknown as typeof window.ogb;

Object.assign(window, { teachFixture: { stats: () => ({ grabs, spoken }) } });

setAnalyticsEnabled(false);
setEmailGateDone("skipped");
markSimpleModePromptSeen();
localStorage.setItem(GROK_MOVE_NOTICE, "1");
createRoot(document.getElementById("root")!).render(<App />);
