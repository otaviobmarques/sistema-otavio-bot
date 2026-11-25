import { ArrowLeft } from 'lucide-react';
import type { Documento } from '@/lib/legal';
import { Rodape } from './Final';
import { Logo } from './Logo';

const OUTROS = [
  { href: '/termos/', rotulo: 'Termos de uso' },
  { href: '/privacidade/', rotulo: 'Política de privacidade' },
  { href: '/cookies/', rotulo: 'Política de cookies' },
];

function Sumario({ doc }: { doc: Documento }) {
  return (
    <ol className="space-y-1.5 text-sm">
      {doc.secoes.map((s) => (
        <li key={s.id}>
          <a href={`#${s.id}`} className="block rounded-lg px-2 py-1 text-cinza transition hover:bg-cartao hover:text-tinta">
            {s.titulo}
          </a>
        </li>
      ))}
    </ol>
  );
}

export function PaginaLegal({ doc, atual }: { doc: Documento; atual: string }) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-linha bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <a href="/" aria-label="ArkoBot, página inicial" className="h-7 text-base">
            <Logo className="h-7" />
          </a>
          <a href="/" className="ml-auto inline-flex items-center gap-1.5 text-sm text-cinza hover:text-tinta">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar ao site
          </a>
        </div>
      </header>
      <main id="conteudo" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <nav aria-label="Documentos legais" className="flex flex-wrap gap-2">
          {OUTROS.map((o) => (
            <a
              key={o.href}
              href={o.href}
              aria-current={o.href === atual ? 'page' : undefined}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                o.href === atual ? 'border-tinta bg-tinta text-white' : 'border-linha text-tinta hover:border-tinta/30'
              }`}
            >
              {o.rotulo}
            </a>
          ))}
        </nav>
        <h1 className="mt-8 text-3xl font-semibold tracking-tight text-tinta sm:text-5xl">{doc.titulo}</h1>
        <p className="mt-3 text-cinza">{doc.vigencia}</p>

        <div className="mt-10 grid gap-10 lg:grid-cols-[16rem_1fr]">
          <aside className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:self-start lg:overflow-y-auto">
            <details className="rounded-2xl border border-linha bg-cartao p-4 lg:hidden">
              <summary className="cursor-pointer font-semibold text-tinta">Sumário</summary>
              <div className="mt-3">
                <Sumario doc={doc} />
              </div>
            </details>
            <div className="hidden lg:block">
              <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-[0.14em] text-cinza">Sumário</p>
              <Sumario doc={doc} />
            </div>
          </aside>
          <article className="texto-legal min-w-0 max-w-3xl" dangerouslySetInnerHTML={{ __html: doc.html }} />
        </div>
      </main>
      <Rodape />
    </>
  );
}
