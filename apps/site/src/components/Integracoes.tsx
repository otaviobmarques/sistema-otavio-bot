import integracoes from '@/config/integracoes.json';
import { CabecalhoSecao, Revelar } from './ui';

type Item = { id: string; nome: string; como: string; produto?: string };

function Logo({ item, tamanho }: { item: Item; tamanho: number }) {
  return (
    <img
      src={`/gerado/logos/${item.id}.svg`}
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

export function FaixaLogos() {
  const itens = [...integracoes.ias, ...integracoes.ias];
  return (
    <section aria-labelledby="faixa-titulo" className="border-y border-white/5 bg-white/[0.015] py-8">
      <h2 id="faixa-titulo" className="px-4 text-center text-xs font-semibold uppercase tracking-[0.2em] text-suave">
        Integra com as IAs que você já conhece
      </h2>
      <div className="relative mt-6 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]">
        <ul className="flex w-max animate-faixa items-center gap-10 hover:[animation-play-state:paused]">
          {itens.map((item, i) => (
            <li
              key={`${item.id}-${i}`}
              aria-hidden={i >= integracoes.ias.length}
              className="flex items-center gap-2.5 whitespace-nowrap font-display text-lg font-semibold text-white/85"
            >
              <Logo item={item} tamanho={28} />
              {item.produto === item.nome ? item.nome : `${item.produto}`}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Cartao({ item, mostraEmpresa }: { item: Item; mostraEmpresa: boolean }) {
  const titulo = mostraEmpresa && item.produto && item.produto !== item.nome ? item.produto : item.nome;
  const dono = mostraEmpresa && item.produto && item.produto !== item.nome ? item.nome : null;
  return (
    <li className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition duration-300 hover:-translate-y-0.5 hover:border-ciano/40 hover:bg-white/[0.06]">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-noite ring-1 ring-white/10 transition group-hover:ring-ciano/40">
        <Logo item={item} tamanho={28} />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-white">
          {titulo}
          {dono && <span className="ml-1.5 text-xs font-normal text-suave">{dono}</span>}
        </span>
        <span className="block text-sm leading-snug text-suave">{item.como}</span>
      </span>
    </li>
  );
}

export function Integracoes() {
  return (
    <section id="integracoes" aria-labelledby="integracoes-titulo" className="relative py-24 sm:py-32">
      <div aria-hidden className="absolute inset-x-0 top-20 -z-10 h-96 bg-[radial-gradient(50%_50%_at_50%_50%,rgba(0,232,248,0.08),transparent)]" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <CabecalhoSecao
          id="integracoes-titulo"
          selo="Integrações"
          titulo={
            <>
              A melhor IA para cada tarefa, <span className="texto-gradiente">sem ficar preso a uma só</span>
            </>
          }
          texto="Cada bot usa a IA que você escolher e pode trocar quando quiser. Use as assinaturas que você já paga, chaves de API ou modelos abertos no seu próprio servidor."
        />
        <Revelar className="mt-14">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-ciano">Inteligências artificiais</h3>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {integracoes.ias.map((item) => (
              <Cartao key={item.id} item={item} mostraEmpresa />
            ))}
          </ul>
        </Revelar>
        <Revelar className="mt-12">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-ciano">Apps da sua empresa</h3>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {integracoes.servicos.map((item) => (
              <Cartao key={item.id} item={item} mostraEmpresa={false} />
            ))}
          </ul>
          <p className="mt-4 text-sm text-suave">
            Os apps se conectam pela Composio, que também liga Slack, Trello, Asana, Jira e muitos outros.
          </p>
        </Revelar>
        <p className="mx-auto mt-10 max-w-3xl text-center text-xs leading-relaxed text-suave/80">
          O ArkoBot integra com esses serviços, mas não é afiliado nem patrocinado por eles. Os nomes e logos são marcas dos
          seus donos e aparecem só para indicar compatibilidade.
        </p>
      </div>
    </section>
  );
}
