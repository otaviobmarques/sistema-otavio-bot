import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Marked, type Tokens } from 'marked';

export type Secao = { id: string; titulo: string };
export type Documento = { titulo: string; vigencia: string; html: string; secoes: Secao[] };

const ROTAS: Record<string, string> = {
  'termos-de-uso.md': '/termos/',
  'politica-de-privacidade.md': '/privacidade/',
  'politica-de-cookies.md': '/cookies/',
};

function slug(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

function semMarcacao(texto: string): string {
  return texto.replace(/[*_`]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

export async function lerDocumento(arquivo: keyof typeof ROTAS): Promise<Documento> {
  let md = await readFile(join(process.cwd(), 'conteudo', 'legal', arquivo), 'utf8');
  md = md.replace(/<!--[\s\S]*?-->/g, '');
  const titulo = md.match(/^# (.+)$/m)?.[1] ?? '';
  md = md.replace(/^# .+\n/m, '');
  const vigencia = semMarcacao(md.match(/^\*\*Versão[^\n]+\*\*$/m)?.[0] ?? '');
  md = md.replace(/^\*\*Versão[^\n]+\*\*\n/m, '');
  md = md.replace(/## Sumário\n[\s\S]*?\n(?=---\n|## )/, '');
  for (const [nome, rota] of Object.entries(ROTAS)) md = md.replaceAll(`](${nome}`, `](${rota}`);

  const secoes: Secao[] = [];
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading(this: { parser: { parseInline: (t: Tokens.Heading['tokens']) => string } }, token: Tokens.Heading) {
        const id = slug(semMarcacao(token.text));
        if (token.depth === 2) secoes.push({ id, titulo: semMarcacao(token.text) });
        return `<h${token.depth} id="${id}">${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`;
      },
      link(this: { parser: { parseInline: (t: Tokens.Link['tokens']) => string } }, token: Tokens.Link) {
        const externo = /^https?:/.test(token.href);
        const texto = this.parser.parseInline(token.tokens);
        return `<a href="${token.href}"${externo ? ' target="_blank" rel="noopener noreferrer"' : ''}>${texto}</a>`;
      },
    },
  });
  const html = await marked.parse(md);
  return { titulo, vigencia, html, secoes };
}
