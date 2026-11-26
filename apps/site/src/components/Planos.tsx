import { Check, Minus, ShieldCheck } from 'lucide-react';
import {
  comparativo,
  computadorAdicional,
  creditosAvulsos,
  explicacaoCreditos,
  formatarCreditos,
  formatarReais,
  garantia,
  planos,
  precoPorDia,
  precosDefinidos,
} from '@/config/planos';
import { canalDeContato, temCanalConfigurado } from '@/config/contato';
import { BotaoContato, CabecalhoSecao, Revelar, Secao } from './ui';

function Celula({ valor }: { valor: string | boolean }) {
  if (valor === true) return <Check className="mx-auto h-4 w-4 text-ciano-forte" aria-label="Incluído" />;
  if (valor === false) return <Minus className="mx-auto h-4 w-4 text-linha" aria-label="Não incluído" />;
  return <span>{valor}</span>;
}

export function Planos() {
  return (
    <Secao id="planos" rotulada="planos-titulo">
      <CabecalhoSecao
        centro
        id="planos-titulo"
        titulo="Planos"
        texto={
          <>
            Uma equipe de IA que trabalha enquanto você dorme. Planos mensais, <strong className="text-tinta">sem fidelidade</strong>.
            Do Inicial com IA gratuita ao Empresa com várias empresas: cada degrau acrescenta uma coisa. Ou conecte a sua própria conta de IA.
          </>
        }
      />

      <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {planos.map((plano, i) => (
          <Revelar key={plano.id} atraso={i * 0.08} as="article">
            <div
              className={`flex h-full flex-col rounded-3xl border p-6 ${
                plano.destaque ? 'border-ciano-forte bg-white shadow-[0_30px_60px_-35px_rgba(8,145,178,0.6)]' : 'border-linha bg-cartao'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-tinta ring-1 ring-linha">{plano.nome}</span>
                {plano.destaque && (
                  <span className="rounded-full bg-cyan-50 px-2 py-1 text-xs font-medium text-ciano-texto">Recomendado</span>
                )}
                {plano.diasGratis ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">{plano.diasGratis} dias grátis</span>
                ) : null}
              </div>
              <h3 className="mt-5 text-xl font-semibold leading-snug tracking-tight text-tinta">{plano.diferencial}</h3>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-semibold tracking-tight text-tinta">
                  {precosDefinidos ? formatarReais(plano.precoMensal) : 'Em breve'}
                </span>
                {precosDefinidos && <span className="text-cinza">por mês</span>}
              </div>
              {precosDefinidos && <p className="mt-1 text-sm text-cinza">cerca de {precoPorDia(plano.precoMensal)} por dia</p>}
              <p className="mt-4 leading-relaxed text-cinza xl:min-h-[4.5rem]">{plano.resumo}</p>
              <ul className="mt-6 flex-1 space-y-3 text-[15px]">
                <li className="flex gap-3 text-tinta">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-ciano-forte" aria-hidden />
                  {plano.creditosIA > 0 ? (
                    <span>
                      <strong className="font-semibold">{formatarCreditos(plano.creditosIA)} créditos de IA</strong> por mês
                    </span>
                  ) : (
                    <span>
                      <strong className="font-semibold">IA gratuita já inclusa</strong> (com limite diário), ou use a sua própria conta de IA
                    </span>
                  )}
                </li>
                <li className="flex gap-3 text-tinta">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-ciano-forte" aria-hidden />
                  {plano.bots}
                </li>
                {plano.itens.map((item) => (
                  <li key={item} className="flex gap-3 text-tinta">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-ciano-forte" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
              <BotaoContato acao="assinar" plano={plano.id} variante={plano.destaque ? 'primario' : 'secundario'} className="mt-8 w-full">
                {plano.diasGratis ? `Testar ${plano.diasGratis} dias grátis` : 'Assinar'}
              </BotaoContato>
              {temCanalConfigurado() && (
                <a
                  href={canalDeContato().href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 text-center text-sm text-cinza underline-offset-4 hover:text-tinta hover:underline"
                >
                  Prefere conversar antes? Fale pelo WhatsApp
                </a>
              )}
            </div>
          </Revelar>
        ))}
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-3xl border border-linha bg-white p-6 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex-1">
            <h3 className="font-semibold text-tinta">{computadorAdicional.nome}</h3>
            <p className="mt-1 text-sm leading-relaxed text-cinza">{computadorAdicional.resumo}</p>
          </div>
          <p className="shrink-0 text-tinta">
            <span className="text-2xl font-semibold">+ {formatarReais(computadorAdicional.precoMensal)}</span>
            <span className="text-sm text-cinza"> /mês por bot</span>
          </p>
        </div>
        <div className="flex flex-col gap-1 rounded-3xl border border-linha bg-white p-6 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex-1">
            <h3 className="font-semibold text-tinta">{creditosAvulsos.nome}</h3>
            <p className="mt-1 text-sm leading-relaxed text-cinza">{creditosAvulsos.resumo}</p>
          </div>
          <p className="shrink-0 text-xl font-semibold text-tinta">{creditosAvulsos.preco}</p>
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-cinza">{explicacaoCreditos}</p>
      <p className="mx-auto mt-3 flex w-fit items-start gap-2 rounded-2xl bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {garantia}
      </p>

      <details className="group mt-10 border-y border-linha">
        <summary className="flex cursor-pointer list-none items-center justify-between py-5 text-lg font-medium text-tinta [&::-webkit-details-marker]:hidden">
          Comparar todos os recursos
          <span className="text-2xl leading-none text-cinza transition-transform group-open:rotate-45" aria-hidden>
            +
          </span>
        </summary>
        <div className="-mx-4 overflow-x-auto px-4 pb-8 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[44rem] text-left text-[15px]">
            <thead>
              <tr className="border-b border-linha">
                <th scope="col" className="py-3 pr-4 font-medium text-cinza">
                  Recurso
                </th>
                {planos.map((p) => (
                  <th key={p.id} scope="col" className="px-3 py-3 text-center font-semibold text-tinta">
                    {p.nome}
                    <span className="block text-xs font-normal text-cinza">{formatarReais(p.precoMensal)}/mês</span>
                  </th>
                ))}
              </tr>
            </thead>
            {comparativo.map((grupo) => (
              <tbody key={grupo.grupo}>
                <tr>
                  <th colSpan={planos.length + 1} scope="colgroup" className="pt-6 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ciano-texto">
                    {grupo.grupo}
                  </th>
                </tr>
                {grupo.linhas.map((linha) => (
                  <tr key={linha.recurso} className="border-b border-linha/70">
                    <th scope="row" className="py-3 pr-4 font-normal text-tinta">
                      {linha.recurso}
                    </th>
                    {linha.valores.map((v, i) => (
                      <td key={i} className="px-3 py-3 text-center text-tinta">
                        <Celula valor={v} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </details>

      <div className="mt-10 flex flex-col items-start gap-5 rounded-3xl bg-tinta px-7 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-9">
        <p className="text-lg text-white/70">
          <strong className="font-semibold text-white">Fale com um especialista.</strong> Dúvidas, uma demonstração ou um plano para a sua
          empresa.
        </p>
        <BotaoContato variante="claro" className="shrink-0">
          Falar com um especialista
        </BotaoContato>
      </div>
    </Secao>
  );
}

const COMPARACOES = [
  {
    titulo: '168 horas por semana',
    texto: 'Uma jornada CLT tem até 44 horas semanais. Os bots cobrem as 168 horas da semana, inclusive noites, fins de semana e feriados.',
  },
  {
    titulo: 'Um bot novo em minutos',
    texto: 'Contratar e treinar uma pessoa leva semanas. Um bot novo nasce com nome, função e IA em poucos cliques, e aprende com você.',
  },
  {
    titulo: 'Custo fixo e previsível',
    texto: 'O plano é uma assinatura mensal com créditos de IA inclusos e verba por empresa. Sem fidelidade: aumente ou diminua quando quiser.',
  },
];

export function Valor() {
  return (
    <Secao rotulada="valor-titulo" borda={false} className="!pt-0">
      <div className="rounded-3xl border border-linha bg-cartao p-7 sm:p-10">
        <h2 id="valor-titulo" className="text-center text-2xl font-semibold tracking-tight text-tinta sm:text-3xl">
          O que custaria fazer isso com pessoas
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center leading-relaxed text-cinza">
          Os bots não substituem quem faz a sua empresa crescer. Eles cobrem o que fica para trás: o repetitivo e os horários em
          que ninguém está olhando. Uma comparação simples, sem estimativa de salário:
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {COMPARACOES.map((c) => (
            <div key={c.titulo} className="rounded-2xl border border-linha bg-white p-6">
              <h3 className="text-xl font-semibold text-tinta">{c.titulo}</h3>
              <p className="mt-2 leading-relaxed text-cinza">{c.texto}</p>
            </div>
          ))}
        </div>
      </div>
    </Secao>
  );
}
