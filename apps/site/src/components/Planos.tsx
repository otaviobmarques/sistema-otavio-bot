import { Check, Coins, Cpu, ShieldCheck, Sparkles } from 'lucide-react';
import {
  computadorAdicional,
  creditosAvulsos,
  explicacaoCreditos,
  formatarCreditos,
  formatarReais,
  garantia,
  planos,
  precosDefinidos,
} from '@/config/planos';
import { BotaoContato, CabecalhoSecao, Revelar } from './ui';

function Preco({ valor, sufixo }: { valor: number; sufixo: string }) {
  if (!precosDefinidos) return <span className="font-display text-3xl font-bold text-white">Em breve</span>;
  return (
    <span className="flex items-baseline gap-1">
      <span className="font-display text-4xl font-bold text-white">{formatarReais(valor)}</span>
      <span className="text-sm text-suave">{sufixo}</span>
    </span>
  );
}

export function Planos() {
  return (
    <section id="planos" aria-labelledby="planos-titulo" className="relative py-24 sm:py-32">
      <div aria-hidden className="absolute inset-x-0 top-1/3 -z-10 h-96 bg-[radial-gradient(50%_50%_at_50%_50%,rgba(61,123,255,0.12),transparent)]" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <CabecalhoSecao
          id="planos-titulo"
          selo="Planos"
          titulo="Uma equipe inteira pelo preço de uma assinatura"
          texto="Créditos de IA inclusos todo mês, sem fidelidade. Precisa de mais? Dê um computador próprio a qualquer bot ou compre créditos avulsos."
        />

        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          {planos.map((plano, i) => (
            <Revelar key={plano.id} atraso={i * 0.1} as="article">
              <div
                className={`relative flex h-full flex-col rounded-3xl p-7 transition duration-300 hover:-translate-y-1 ${
                  plano.destaque
                    ? 'borda-brilho bg-gradient-to-b from-ciano/[0.12] to-noite-2 shadow-[0_30px_80px_-30px_rgba(0,232,248,0.45)]'
                    : 'border border-white/10 bg-white/[0.03]'
                }`}
              >
                {plano.destaque && (
                  <span className="absolute -top-3 left-7 inline-flex items-center gap-1 rounded-full bg-ciano px-3 py-1 text-xs font-bold text-noite">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden /> Recomendado
                  </span>
                )}
                <h3 className="font-display text-2xl font-bold text-white">{plano.nome}</h3>
                <p className="mt-2 min-h-12 text-sm leading-relaxed text-suave">{plano.resumo}</p>
                <div className="mt-6">
                  <Preco valor={plano.precoMensal} sufixo="/mês" />
                  <p className="mt-2 text-sm text-texto">
                    <span className="font-semibold text-ciano">{formatarCreditos(plano.creditosIA)} créditos de IA</span> por mês ·{' '}
                    {plano.bots}
                  </p>
                </div>
                <ul className="mt-7 flex-1 space-y-3 text-sm">
                  {plano.itens.map((item) => (
                    <li key={item} className="flex gap-3 text-texto">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-ciano" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
                <BotaoContato acao="assinar" variante={plano.destaque ? 'primario' : 'secundario'} className="mt-8 w-full">
                  {precosDefinidos ? `Assinar o ${plano.nome}` : 'Fale com a gente'}
                </BotaoContato>
              </div>
            </Revelar>
          ))}
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Revelar>
            <div className="flex h-full flex-col gap-4 rounded-3xl border border-ciano/30 bg-gradient-to-r from-ciano/[0.08] to-transparent p-6 sm:flex-row sm:items-center">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ciano/10 text-ciano">
                <Cpu className="h-6 w-6" aria-hidden />
              </span>
              <div className="flex-1">
                <h3 className="font-display text-lg font-bold text-white">{computadorAdicional.nome}</h3>
                <p className="mt-1 text-sm leading-relaxed text-suave">{computadorAdicional.resumo}</p>
              </div>
              <div className="shrink-0 sm:text-right">
                <Preco valor={computadorAdicional.precoMensal} sufixo="/mês por bot" />
              </div>
            </div>
          </Revelar>
          <Revelar atraso={0.08}>
            <div className="flex h-full flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:flex-row sm:items-center">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/5 text-ciano">
                <Coins className="h-6 w-6" aria-hidden />
              </span>
              <div className="flex-1">
                <h3 className="font-display text-lg font-bold text-white">{creditosAvulsos.nome}</h3>
                <p className="mt-1 text-sm leading-relaxed text-suave">{creditosAvulsos.resumo}</p>
              </div>
              <span className="shrink-0 font-display text-xl font-bold text-white">{creditosAvulsos.preco}</span>
            </div>
          </Revelar>
        </div>

        <div className="mt-8 flex flex-col items-center gap-3 text-center text-sm text-suave">
          <p>{explicacaoCreditos}</p>
          <p className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-emerald-200">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
            {garantia}
          </p>
        </div>
      </div>
    </section>
  );
}
