import { Check, Cpu, Sparkles } from 'lucide-react';
import { computadorAdicional, formatarReais, planos, precosDefinidos } from '@/config/planos';
import { BotaoContato, CabecalhoSecao, Revelar } from './ui';

function Preco({ valor, sufixo }: { valor: number; sufixo: string }) {
  if (!precosDefinidos) {
    return (
      <div className="flex items-baseline gap-2">
        <span className="font-display text-3xl font-bold text-white">Em breve</span>
      </div>
    );
  }
  return (
    <div className="flex items-baseline gap-1">
      <span className="font-display text-4xl font-bold text-white">{formatarReais(valor)}</span>
      <span className="text-sm text-suave">{sufixo}</span>
    </div>
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
          titulo="Pague pelo que a sua equipe usa"
          texto="Planos por consumo, com créditos de IA inclusos todo mês. Precisa de mais máquinas? Contrate computadores adicionais para os seus bots."
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
                  <p className="mt-2 text-sm text-suave">
                    {precosDefinidos
                      ? `${formatarReais(plano.creditosIA)} em créditos de IA inclusos · ${plano.bots}`
                      : `${plano.bots} · créditos de IA inclusos`}
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
                <BotaoContato variante={plano.destaque ? 'primario' : 'secundario'} className="mt-8 w-full">
                  {precosDefinidos ? 'Começar' : 'Fale com a gente'}
                </BotaoContato>
              </div>
            </Revelar>
          ))}
        </div>

        <Revelar className="mt-8">
          <div className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-gradient-to-r from-white/[0.04] to-transparent p-7 sm:flex-row sm:items-center">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-ciano/10 text-ciano">
              <Cpu className="h-7 w-7" aria-hidden />
            </span>
            <div className="flex-1">
              <h3 className="font-display text-xl font-bold text-white">{computadorAdicional.nome}</h3>
              <p className="mt-1 text-sm leading-relaxed text-suave">{computadorAdicional.resumo}</p>
            </div>
            <div className="shrink-0 sm:text-right">
              <Preco valor={computadorAdicional.precoMensal} sufixo="/mês por computador" />
            </div>
          </div>
        </Revelar>

        {!precosDefinidos && (
          <p className="mt-6 text-center text-sm text-suave">
            Os preços estão sendo definidos. Fale com a gente para saber primeiro e montar o plano da sua empresa.
          </p>
        )}
      </div>
    </section>
  );
}
