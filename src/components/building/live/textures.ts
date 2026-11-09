import * as THREE from "three";

const FONT_DISPLAY = "'Inter', system-ui, sans-serif";
const FONT_SANS = "'Inter', system-ui, sans-serif";

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("no 2D canvas");
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

export function approvalsTexture(count: number, words: { title: string; one: string; many: string; none: string }) {
  const { c, ctx } = makeCanvas(512, 288);
  roundRect(ctx, 4, 4, 504, 280, 24);
  ctx.fillStyle = "#120e04";
  ctx.fill();
  ctx.strokeStyle = "#f59e0b";
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.fillStyle = "#fde68a";
  ctx.font = `700 40px ${FONT_SANS}`;
  ctx.fillText(words.title.toUpperCase(), 40, 76);
  ctx.fillStyle = count > 0 ? "#f59e0b" : "#22c55e";
  ctx.font = `700 130px ${FONT_DISPLAY}`;
  ctx.fillText(String(count), 40, 220);
  ctx.fillStyle = "#e5e7eb";
  ctx.font = `500 38px ${FONT_SANS}`;
  ctx.fillText(count === 1 ? words.one : count === 0 ? words.none : words.many, count >= 10 ? 220 : 150, 210);
  return toTexture(c);
}

export function cityTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 160;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 160);
  g.addColorStop(0, "#0b1430");
  g.addColorStop(1, "#24345e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 160);
  const r = rng(5);
  for (let i = 0; i < 14; i++) {
    const w = 14 + r() * 26;
    const h = 40 + r() * 100;
    const x = i * 19 - 6;
    ctx.fillStyle = "#0a1022";
    ctx.fillRect(x, 160 - h, w, h);
    for (let y = 160 - h + 6; y < 156; y += 9)
      for (let xx = x + 3; xx < x + w - 3; xx += 6) if (r() > 0.55) {
        ctx.fillStyle = r() > 0.3 ? "#fcd34d" : "#93c5fd";
        ctx.fillRect(xx, y, 3, 4);
      }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
