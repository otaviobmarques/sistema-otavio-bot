import { faixaDeIAs } from '@/config/ias';

export function FaixaIAs() {
  const itens = [...faixaDeIAs, ...faixaDeIAs];
  return (
    <section aria-labelledby="faixa-titulo" className="border-y border-white/5 bg-white/[0.015] py-8">
      <h2 id="faixa-titulo" className="px-4 text-center text-xs font-semibold uppercase tracking-[0.2em] text-suave">
        Funciona com as IAs que você já conhece
      </h2>
      <div className="relative mt-6 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
        <ul className="flex w-max animate-faixa gap-3 hover:[animation-play-state:paused]">
          {itens.map((nome, i) => (
            <li
              key={`${nome}-${i}`}
              aria-hidden={i >= faixaDeIAs.length}
              className="whitespace-nowrap rounded-full border border-white/10 bg-white/[0.03] px-5 py-2.5 font-display text-base font-semibold text-white/80"
            >
              {nome}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
