// Regenerates every ArkoBot icon from docs/arkobot/mark.svg (docs/arkobot/ICONES.md lists them):
//   node scripts/arkobot-icons.mjs           writes them
//   node scripts/arkobot-icons.mjs --check   fails when a written icon differs from what the mark gives
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MARK = readFileSync(join(ROOT, "docs/arkobot/mark.svg"), "utf8");
export const NAVY = "#050817";
export const CYAN = "#00E8F8";

const inner = (svg) => svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").trim();
const body = inner(MARK);
const symbol = body.replace(/<rect width="1024" height="1024"[^>]*\/>\s*/, "");
const titled = (content, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="${title}">\n  <title>${title}</title>\n  ${content.split("\n").map((line) => line.trim()).join("\n  ")}\n</svg>\n`;

/** The app tile: the mark as drawn. */
export const tileSvg = titled(body, "ArkoBot");
/** Full bleed, for iOS, which rounds the corners itself and shows black through transparency. */
export const squareSvg = titled(body.replace(/<rect width="1024" height="1024" rx="\d+"/, '<rect width="1024" height="1024"'), "ArkoBot");
/** The symbol alone on transparency, for drawing on the app's own surfaces. */
export const symbolSvg = titled(symbol, "ArkoBot");
/** One colour on transparency: a macOS template image, should a menu bar icon ever need one. */
export const monoSvg = titled(`<defs><mask id="eyes"><rect width="1024" height="1024" fill="#FFFFFF"/>${
  [...symbol.matchAll(/<circle[^>]*\/>/g)].map(([circle]) => circle.replace(/fill="[^"]*"/, 'fill="#000000"')).join("")}</mask></defs>
<g mask="url(#eyes)">${symbol.replace(/<circle[^>]*\/>\s*/g, "").replaceAll(CYAN, "#000000")}</g>`, "ArkoBot");

export function png(svg, size) {
  return Buffer.from(new Resvg(svg, { fitTo: { mode: "width", value: size }, background: "rgba(0,0,0,0)", font: { loadSystemFonts: false } }).render().asPng());
}

/** A 32-bit BMP icon entry: NSIS (makensis 3) reads only these below 256 px. */
function dib(svg, size) {
  const { pixels } = new Resvg(svg, { fitTo: { mode: "width", value: size }, background: "rgba(0,0,0,0)", font: { loadSystemFonts: false } }).render();
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  const colour = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const from = (y * size + x) * 4;
      const to = ((size - 1 - y) * size + x) * 4;
      colour[to] = pixels[from + 2];
      colour[to + 1] = pixels[from + 1];
      colour[to + 2] = pixels[from];
      colour[to + 3] = pixels[from + 3];
    }
  }
  const maskRow = Math.ceil(size / 32) * 4;
  header.writeUInt32LE(colour.length + maskRow * size, 20);
  return Buffer.concat([header, colour, Buffer.alloc(maskRow * size)]);
}

/** ICO with BMP entries and a PNG 256 px one (electron-builder 26 wants a 256 px entry). */
export function ico(svg, sizes = [16, 24, 32, 48, 64, 128, 256]) {
  const images = sizes.map((size) => (size >= 256 ? png(svg, size) : dib(svg, size)));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map((image, index) => {
    const entry = Buffer.alloc(16);
    const size = sizes[index];
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(image.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += image.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images]);
}

/** ICNS with PNG entries, the OSTypes macOS 10.7+ reads. */
export const ICNS_TYPES = [["icp4", 16], ["icp5", 32], ["icp6", 64], ["ic07", 128], ["ic08", 256], ["ic09", 512], ["ic10", 1024],
  ["ic11", 32], ["ic12", 64], ["ic13", 256], ["ic14", 512]];
export function icns(svg) {
  const chunks = ICNS_TYPES.map(([type, size]) => {
    const data = png(svg, size);
    const head = Buffer.alloc(8);
    head.write(type, 0, "latin1");
    head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });
  const head = Buffer.alloc(8);
  head.write("icns", 0, "latin1");
  head.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
  return Buffer.concat([head, ...chunks]);
}

const ICONSET = [16, 32, 64, 128, 256, 512].flatMap((size) => [[`icon_${size}x${size}.png`, size], [`icon_${size}x${size}@2x.png`, size * 2]]);

/** Every file this script owns: [path from the repository root, what it holds]. */
export function outputs() {
  return [
    ["build/icon.svg", Buffer.from(tileSvg)],
    ["build/icon-1024.png", png(tileSvg, 1024)],
    ["build/icon.ico", ico(tileSvg)],
    ["build/icon.icns", icns(tileSvg)],
    ...ICONSET.map(([name, size]) => [`build/icon.iconset/${name}`, png(tileSvg, size)]),
    ["electron/resources/app-icon.png", png(tileSvg, 1024)],
    ["public/app-icon.svg", Buffer.from(tileSvg)],
    ["public/app-icon-192.png", png(tileSvg, 192)],
    ["public/app-icon-512.png", png(tileSvg, 512)],
    ["public/apple-touch-icon.png", png(squareSvg, 180)],
    ["apps/portal/public/favicon.svg", Buffer.from(tileSvg)],
    ["docs/arkobot/mark-symbol.svg", Buffer.from(symbolSvg)],
    ["docs/arkobot/mark-mono.svg", Buffer.from(monoSvg)],
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const stale = [];
  for (const [path, data] of outputs()) {
    const file = join(ROOT, path);
    if (check) {
      let current = null;
      try { current = readFileSync(file); } catch {}
      if (!current?.equals(data)) stale.push(path);
      continue;
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, data);
    console.log(`${path}: ${data.length} bytes`);
  }
  if (stale.length) {
    console.error(`out of date, run node scripts/arkobot-icons.mjs:\n${stale.join("\n")}`);
    process.exit(1);
  }
}
