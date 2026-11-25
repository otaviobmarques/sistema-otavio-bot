import { site } from '@/config/site';
import { Logo } from './Logo';

export function PaginaLegal({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <a href="/" aria-label="Voltar ao início" className="inline-block h-7 text-base">
        <Logo className="h-7" />
      </a>
      <h1 className="mt-10 text-3xl font-semibold tracking-tight text-tinta">{titulo}</h1>
      <div className="mt-6 space-y-4 leading-relaxed text-cinza">{children}</div>
      <p className="mt-10 text-sm text-cinza">
        {site.nome} é um produto {site.empresa}.
      </p>
    </main>
  );
}
