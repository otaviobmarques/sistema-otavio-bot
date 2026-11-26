#!/usr/bin/env node
// Cuts every original in docs/arkobot/personagens/originais into the avatar WebP files the app bundles.
// Needs ImageMagick's `convert` on PATH. Usage: node scripts/personagens-gerar.mjs
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PERSONAGENS, PERSONAGEM_TAMANHOS } from "../shared/personagens.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ORIGINAIS = join(ROOT, "docs/arkobot/personagens/originais");
const SAIDA = join(ROOT, "src/assets/personagens");
const QUALIDADE = "80";

const originais = new Map(
  readdirSync(ORIGINAIS)
    .filter((file) => /\.(jpe?g|png|webp)$/i.test(file))
    .map((file) => [basename(file, extname(file)), join(ORIGINAIS, file)]),
);

const semOriginal = PERSONAGENS.filter((personagem) => !originais.has(personagem.id)).map((personagem) => personagem.id);
if (semOriginal.length) throw new Error(`no original image for: ${semOriginal.join(", ")}`);
const semRegistro = [...originais.keys()].filter((id) => !PERSONAGENS.some((personagem) => personagem.id === id));
if (semRegistro.length) throw new Error(`original without a registry entry in shared/personagens.ts: ${semRegistro.join(", ")}`);

mkdirSync(SAIDA, { recursive: true });
for (const file of readdirSync(SAIDA)) if (file.endsWith(".webp")) rmSync(join(SAIDA, file));

function dimensoes(file) {
  const [width, height] = execFileSync("identify", ["-format", "%w %h", file], { encoding: "utf8" }).trim().split(" ").map(Number);
  return { width, height };
}

for (const personagem of PERSONAGENS) {
  const original = originais.get(personagem.id);
  const { width, height } = dimensoes(original);
  for (const recorte of /** @type {const} */ (["rosto", "corpo"])) {
    const box = personagem[recorte];
    const lado = Math.round(box.lado * Math.min(width, height));
    const crop = `${lado}x${lado}+${Math.round(box.x * width)}+${Math.round(box.y * height)}`;
    for (const tamanho of PERSONAGEM_TAMANHOS[recorte]) {
      const destino = join(SAIDA, `${personagem.id}-${recorte}-${tamanho}.webp`);
      execFileSync("convert", [
        original, "-crop", crop, "+repage", "-filter", "Lanczos", "-resize", `${tamanho}x${tamanho}`,
        "-strip", "-quality", QUALIDADE, "-define", "webp:alpha-quality=100", "-define", "webp:method=6", destino,
      ]);
      if (!existsSync(destino)) throw new Error(`convert wrote nothing for ${destino}`);
      console.log(destino.slice(ROOT.length));
    }
  }
}
