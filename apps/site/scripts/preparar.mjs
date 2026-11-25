import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const raiz = (caminho) => fileURLToPath(new URL(`../../../${caminho}`, import.meta.url));
const destino = (nome) => fileURLToPath(new URL(`../public/gerado/${nome}`, import.meta.url));

await mkdir(destino(''), { recursive: true });

const marca = await readFile(raiz('docs/arkobot/mark.svg'));
await copyFile(raiz('docs/arkobot/mark.svg'), destino('favicon.svg'));
for (const tamanho of [192, 512]) {
  await sharp(marca, { density: 300 }).resize(tamanho, tamanho).png().toFile(destino(`icon-${tamanho}.png`));
}
const quadrado = Buffer.from(marca.toString().replace('rx="224"', 'rx="0"'));
await sharp(quadrado, { density: 300 }).resize(180, 180).png().toFile(destino('apple-touch-icon.png'));

const recortes = [
  { de: '02-barra-lateral.png', para: 'app-conversa.webp', left: 370, top: 70, width: 600, height: 210 },
  { de: '05-predio.png', para: 'app-predio.webp', left: 280, top: 0, width: 1160, height: 230 },
  { de: '03b-configuracoes-abertura.png', para: 'app-configuracoes.webp', left: 290, top: 100, width: 860, height: 700 },
];
for (const r of recortes) {
  await sharp(raiz(`docs/arkobot/screenshots/${r.de}`))
    .extract({ left: r.left, top: r.top, width: r.width, height: r.height })
    .webp({ quality: 88 })
    .toFile(destino(r.para));
}

await copyFile(raiz('public/abertura/arkobot.mp4'), destino('arkobot.mp4'));
await sharp(raiz('public/abertura/arkobot-poster.jpg')).webp({ quality: 82 }).toFile(destino('arkobot-poster.webp'));
