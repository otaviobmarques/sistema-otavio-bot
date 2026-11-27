import integracoes from '@/config/integracoes.json';

export type Integracao = { id: string; nome: string; produto?: string; como?: string; soConta?: boolean };

export function LogoIntegracao({ item, tamanho, branco = false }: { item: Integracao; tamanho: number; branco?: boolean }) {
  return (
    <img
      src={`/gerado/logos/${item.id}${branco ? '-branco' : ''}.svg`}
      alt=""
      width={tamanho}
      height={tamanho}
      loading="lazy"
      decoding="async"
      className="shrink-0"
      style={{ width: tamanho, height: tamanho }}
    />
  );
}

export const ias: Integracao[] = integracoes.ias;
export const servicos: Integracao[] = integracoes.servicos;

export function FaixaLogos() {
  const inclusas = ias.filter((i) => !i.soConta);
  const itens = [...inclusas, ...inclusas];
  return (
    <section aria-labelledby="faixa-titulo" className="py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="rounded-3xl border border-linha bg-cartao px-4 py-6 sm:px-8">
          <h2 id="faixa-titulo" className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-cinza">
            Claude incluso nos planos pagos, IA gratuita no Inicial, ou conecte a sua própria conta
          </h2>
          <div className="relative mt-5 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
            <ul className="flex w-max animate-faixa items-center gap-9 hover:[animation-play-state:paused]">
              {itens.map((item, i) => (
                <li
                  key={`${item.id}-${i}`}
                  aria-hidden={i >= inclusas.length}
                  className="flex items-center gap-2.5 whitespace-nowrap text-[17px] font-semibold text-tinta"
                >
                  <LogoIntegracao item={item} tamanho={26} />
                  {item.produto ?? item.nome}
                  <span className="text-xs font-normal text-cinza">{item.nome !== item.produto ? item.nome : ''}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
