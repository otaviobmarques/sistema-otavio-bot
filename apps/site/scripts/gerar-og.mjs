import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// O sharp (librsvg) desenha o texto com as fontes instaladas na máquina. Por isso o public/og.png é gerado uma
// vez, numa máquina com a fonte Inter, e vai para o repositório, em vez de ser gerado a cada build na Vercel.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="a" cx="0.12" cy="0.1" r="0.7"><stop offset="0" stop-color="#00E8F8" stop-opacity="0.28"/><stop offset="1" stop-color="#00E8F8" stop-opacity="0"/></radialGradient>
    <radialGradient id="b" cx="0.95" cy="0.95" r="0.7"><stop offset="0" stop-color="#8B5CF6" stop-opacity="0.3"/><stop offset="1" stop-color="#8B5CF6" stop-opacity="0"/></radialGradient>
    <filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="1200" height="630" fill="#050817"/>
  <rect width="1200" height="630" fill="url(#a)"/>
  <rect width="1200" height="630" fill="url(#b)"/>
  <g transform="translate(90 135) scale(0.34)" filter="url(#g)">
    <path d="M512 150 L812 770 L512 640 L212 770 Z" fill="none" stroke="#00E8F8" stroke-width="48" stroke-linejoin="round"/>
    <rect x="398" y="400" width="228" height="148" rx="56" fill="#00E8F8"/>
    <circle cx="465" cy="474" r="26" fill="#050817"/>
    <circle cx="559" cy="474" r="26" fill="#050817"/>
  </g>
  <text x="470" y="262" font-family="Poppins, Inter, sans-serif" font-weight="800" font-size="120" letter-spacing="-3"><tspan fill="#FFFFFF">arko</tspan><tspan fill="#00E8F8">bot</tspan></text>
  <text x="474" y="340" font-family="Inter, sans-serif" font-weight="600" font-size="38" fill="#E8EEFC">Uma equipe de bots de IA</text>
  <text x="474" y="388" font-family="Inter, sans-serif" font-weight="600" font-size="38" fill="#E8EEFC">trabalhando para a sua empresa</text>
  <text x="474" y="452" font-family="Inter, sans-serif" font-size="26" fill="#A9B6D6">Claude, ChatGPT, Gemini e mais · um computador por bot</text>
  <text x="90" y="575" font-family="Inter, sans-serif" font-size="22" fill="#7F8DB0">arkobot.com.br · um produto Domma Tecnologia</text>
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(fileURLToPath(new URL('../public/og.png', import.meta.url)));
