import * as THREE from "three";

const FONT_DISPLAY = "'Space Grotesk', 'Inter', system-ui, sans-serif";
const FONT_SANS = "'Inter', system-ui, sans-serif";

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas 2D indisponível");
  return { c, ctx };
}

function toTexture(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

export function tileTexture(seed = 7) {
  const { c, ctx } = makeCanvas(512, 512);
  const r = rng(seed);
  const n = 4;
  const s = 512 / n;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const v = 236 + Math.floor(r() * 16);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(i * s, j * s, s, s);
      const g = ctx.createLinearGradient(i * s, j * s, i * s + s, j * s + s);
      g.addColorStop(0, "rgba(255,255,255,0.10)");
      g.addColorStop(1, "rgba(0,0,0,0.05)");
      ctx.fillStyle = g;
      ctx.fillRect(i * s, j * s, s, s);
    }
  ctx.strokeStyle = "rgba(60,60,70,0.22)";
  ctx.lineWidth = 3;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath();
    ctx.moveTo(i * s, 0);
    ctx.lineTo(i * s, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * s);
    ctx.lineTo(512, i * s);
    ctx.stroke();
  }
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function plankTexture() {
  const { c, ctx } = makeCanvas(512, 512);
  const r = rng(31);
  const rows = 8;
  const h = 512 / rows;
  for (let j = 0; j < rows; j++) {
    let x = -r() * 200;
    while (x < 512) {
      const w = 160 + r() * 140;
      const v = 0.86 + r() * 0.14;
      ctx.fillStyle = `rgb(${Math.round(255 * v)},${Math.round(236 * v)},${Math.round(214 * v)})`;
      ctx.fillRect(x, j * h, w, h);
      ctx.fillStyle = "rgba(90,60,30,0.25)";
      ctx.fillRect(x, j * h, 2, h);
      x += w;
    }
    ctx.fillStyle = "rgba(90,60,30,0.28)";
    ctx.fillRect(0, j * h, 512, 2);
  }
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function glowTexture() {
  const { c, ctx } = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return toTexture(c, false);
}

export function blobTexture() {
  const { c, ctx } = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(0.55, "rgba(0,0,0,0.22)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return toTexture(c, false);
}

export function aoStripTexture() {
  const { c, ctx } = makeCanvas(8, 64);
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, "rgba(0,0,0,0.42)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 64);
  return toTexture(c, false);
}

export function plazaTexture() {
  const { c, ctx } = makeCanvas(1024, 1024);
  ctx.fillStyle = "#1a2336";
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.strokeStyle = "rgba(148,163,184,0.07)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= 1024; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 1024);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(1024, i);
    ctx.stroke();
  }
  const g = ctx.createRadialGradient(512, 512, 180, 512, 512, 512);
  g.addColorStop(0, "rgba(11,15,23,0)");
  g.addColorStop(1, "rgba(11,15,23,1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 1024);
  return toTexture(c);
}

export function alphaRadialTexture() {
  const { c, ctx } = makeCanvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 40, 128, 128, 128);
  g.addColorStop(0, "#fff");
  g.addColorStop(0.7, "#888");
  g.addColorStop(1, "#000");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return toTexture(c, false);
}

export function signTexture(name: string, sub: string, accent: string) {
  const { c, ctx } = makeCanvas(1024, 320);
  roundRect(ctx, 6, 6, 1012, 308, 34);
  ctx.fillStyle = "#0f1626";
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.fillStyle = accent;
  roundRect(ctx, 48, 70, 22, 180, 11);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 118px ${FONT_DISPLAY}`;
  ctx.textBaseline = "alphabetic";
  let size = 118;
  while (ctx.measureText(name).width > 880 && size > 60) {
    size -= 6;
    ctx.font = `700 ${size}px ${FONT_DISPLAY}`;
  }
  ctx.fillText(name, 104, 168);
  ctx.fillStyle = "#b8c2d6";
  ctx.font = `500 54px ${FONT_SANS}`;
  ctx.fillText(sub, 106, 252);
  return toTexture(c);
}

export function logoTexture(text: string, w = 1024, h = 200) {
  const { c, ctx } = makeCanvas(w, h);
  ctx.fillStyle = "#0b1222";
  roundRect(ctx, 4, 4, w - 8, h - 8, h * 0.22);
  ctx.fill();
  ctx.font = `700 ${Math.round(h * 0.5)}px ${FONT_DISPLAY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#3b82f6";
  ctx.shadowBlur = 28;
  ctx.fillStyle = "#93c5fd";
  ctx.fillText(text, w / 2, h / 2 + 4);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#e0ecff";
  ctx.fillText(text, w / 2, h / 2 + 4);
  return toTexture(c);
}

export function whiteboardTexture(accent: string, seed: number) {
  const { c, ctx } = makeCanvas(512, 320);
  const r = rng(seed * 97 + 13);
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, 512, 320);
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 14;
  ctx.strokeRect(0, 0, 512, 320);
  const colors = ["#2563eb", "#f59e0b", "#16a34a", "#334155"];
  ctx.lineCap = "round";
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = colors[i % colors.length]!;
    ctx.lineWidth = 7;
    const y = 50 + i * 40;
    ctx.beginPath();
    ctx.moveTo(36, y);
    ctx.lineTo(36 + 120 + r() * 170, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "#16a34a";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(330, 270);
  for (let i = 1; i <= 5; i++) ctx.lineTo(330 + i * 30, 270 - (i * 22 + r() * 30));
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i === 1 ? "#fde68a" : accent;
    const x = 360 + (i % 2) * 70;
    const y = 30 + i * 55;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((r() - 0.5) * 0.25);
    ctx.fillRect(0, 0, 58, 50);
    ctx.restore();
  }
  return toTexture(c);
}

export function screenTexture(seed: number) {
  const { c, ctx } = makeCanvas(128, 80);
  const r = rng(seed * 31 + 7);
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0, 0, 128, 80);
  for (let i = 0; i < 8; i++) {
    const shade = 150 + Math.floor(r() * 105);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(8 + (i % 3) * 6, 8 + i * 8.5, 30 + r() * 70, 4);
  }
  return toTexture(c);
}

export function channelsTexture() {
  const { c, ctx } = makeCanvas(512, 360);
  roundRect(ctx, 4, 4, 504, 352, 26);
  ctx.fillStyle = "#0b1222";
  ctx.fill();
  ctx.strokeStyle = "#2b3549";
  ctx.lineWidth = 6;
  ctx.stroke();
  const rows: [string, string, string][] = [
    ["WhatsApp", "7 conversas", "#22c55e"],
    ["Voz", "ouvindo", "#22c55e"],
    ["E-mail", "nenhum novo", "#6b7280"],
  ];
  rows.forEach(([a, b, col], i) => {
    const y = 90 + i * 100;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(52, y - 14, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 46px ${FONT_SANS}`;
    ctx.fillText(a, 84, y);
    ctx.fillStyle = "#9aa6bb";
    ctx.font = `500 34px ${FONT_SANS}`;
    ctx.fillText(b, 86, y + 40);
  });
  return toTexture(c);
}

export function approvalsTexture(count: number) {
  const { c, ctx } = makeCanvas(512, 288);
  roundRect(ctx, 4, 4, 504, 280, 24);
  ctx.fillStyle = "#120e04";
  ctx.fill();
  ctx.strokeStyle = "#f59e0b";
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.fillStyle = "#fde68a";
  ctx.font = `700 40px ${FONT_SANS}`;
  ctx.fillText("APROVAÇÕES", 40, 76);
  ctx.fillStyle = count > 0 ? "#f59e0b" : "#22c55e";
  ctx.font = `700 130px ${FONT_DISPLAY}`;
  ctx.fillText(String(count), 40, 220);
  ctx.fillStyle = "#e5e7eb";
  ctx.font = `500 38px ${FONT_SANS}`;
  ctx.fillText(count === 1 ? "pendente" : count === 0 ? "tudo em dia" : "pendentes", count >= 10 ? 220 : 150, 210);
  return toTexture(c);
}
