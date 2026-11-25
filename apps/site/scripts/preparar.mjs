import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const raiz = (caminho) => fileURLToPath(new URL(`../../../${caminho}`, import.meta.url));
const destino = (nome) => fileURLToPath(new URL(`../public/gerado/${nome}`, import.meta.url));
const exigir = createRequire(import.meta.url);

await mkdir(destino('logos'), { recursive: true });

const marca = await readFile(raiz('docs/arkobot/mark.svg'));
await copyFile(raiz('docs/arkobot/mark.svg'), destino('favicon.svg'));
for (const tamanho of [192, 512]) {
  await sharp(marca, { density: 300 }).resize(tamanho, tamanho).png().toFile(destino(`icon-${tamanho}.png`));
}
const quadrado = Buffer.from(marca.toString().replace('rx="224"', 'rx="0"'));
await sharp(quadrado, { density: 300 }).resize(180, 180).png().toFile(destino('apple-touch-icon.png'));

await copyFile(raiz('public/abertura/arkobot.mp4'), destino('arkobot.mp4'));
await sharp(raiz('public/abertura/arkobot-poster.jpg')).webp({ quality: 82 }).toFile(destino('arkobot-poster.webp'));

const PASTAS = {
  lobehub: join(dirname(exigir.resolve('@lobehub/icons-static-svg/package.json')), 'icons'),
  'simple-icons': join(dirname(exigir.resolve('simple-icons/icons/whatsapp.svg')), ''),
};
const integracoes = JSON.parse(await readFile(new URL('../src/config/integracoes.json', import.meta.url), 'utf8'));
for (const item of [...integracoes.ias, ...integracoes.servicos]) {
  let svg = await readFile(join(PASTAS[item.pacote], item.arquivo), 'utf8');
  if (item.cor) {
    svg = svg.includes('fill="currentColor"')
      ? svg.replace('fill="currentColor"', `fill="${item.cor}"`)
      : svg.replace('<svg ', `<svg fill="${item.cor}" `);
  }
  await writeFile(destino(`logos/${item.id}.svg`), svg);
}
