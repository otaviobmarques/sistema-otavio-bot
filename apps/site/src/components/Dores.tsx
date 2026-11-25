import { ArrowRight, Clock3, RefreshCcw, Repeat, UserPlus } from 'lucide-react';
import { equipe } from '@/config/equipe';
import { AvatarBot } from './AvatarBot';
import { CabecalhoSecao, Revelar } from './ui';

const DORES = [
  {
    icone: Clock3,
    dor: 'Cliente sem resposta à noite e no fim de semana',
    solucao: 'O bot de atendimento responde na hora, a qualquer hora, e só chama você quando precisa de uma decisão.',
  },
  {
    icone: Repeat,
    dor: 'Gente boa presa em tarefa repetitiva',
    solucao: 'Planilhas, cadastros em portais, relatórios e follow-ups vão para os bots, que têm computador próprio para isso.',
  },
  {
    icone: RefreshCcw,
    dor: 'Retrabalho e coisa esquecida',
    solucao: 'Rotinas com dia e hora marcados e memória em cada bot: o combinado é feito no horário, sempre do mesmo jeito.',
  },
  {
    icone: UserPlus,
    dor: 'Falta gente, e contratar é caro e demorado',
    solucao: 'Crie um bot novo com nome, função e IA em poucos cliques. Aumente ou diminua a equipe quando quiser, sem fidelidade.',
  },
];

export function Dores() {
  return (
    <section id="por-que" aria-labelledby="dores-titulo" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <CabecalhoSecao
          id="dores-titulo"
          selo="Por que ArkoBot"
          titulo="O trabalho da sua empresa não precisa parar quando a equipe para"
          texto="O ArkoBot não substitui as pessoas que fazem a sua empresa crescer. Ele tira delas o que é repetitivo e cobre os horários em que ninguém está olhando."
        />
        <div className="mt-14 grid gap-5 md:grid-cols-2">
          {DORES.map((d, i) => (
            <Revelar key={d.dor} atraso={i * 0.08} as="article">
              <div className="group h-full rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition duration-300 hover:border-ciano/40 sm:p-7">
                <div className="flex items-start gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-400/10 text-red-300">
                    <d.icone className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="pt-1.5 font-display text-lg font-bold leading-snug text-white">{d.dor}</h3>
                </div>
                <p className="mt-4 flex gap-3 leading-relaxed text-texto">
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-ciano transition-transform group-hover:translate-x-1" aria-hidden />
                  {d.solucao}
                </p>
              </div>
            </Revelar>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Equipe() {
  return (
    <section id="equipe" aria-labelledby="equipe-titulo" className="relative py-24 sm:py-32">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,transparent,rgba(17,26,58,0.55)_25%,rgba(17,26,58,0.55)_75%,transparent)]" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <CabecalhoSecao
          id="equipe-titulo"
          selo="Sua equipe"
          titulo={
            <>
              Monte a equipe que a sua empresa <span className="texto-gradiente">sempre quis ter</span>
            </>
          }
          texto="Cada bot tem nome, função, personalidade, memória e a IA que você escolher. Eles conversam entre si, passam tarefas uns para os outros e respondem a você como colegas de trabalho."
        />
        <ul className="mt-14 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          {equipe.map((bot, i) => (
            <Revelar key={bot.id} as="li" atraso={(i % 4) * 0.07}>
              <div className="group relative h-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-5 transition duration-300 hover:-translate-y-1 hover:border-white/25">
                <div
                  aria-hidden
                  className="absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-25 blur-2xl transition-opacity group-hover:opacity-50"
                  style={{ background: bot.cores[0] }}
                />
                <AvatarBot bot={bot} className="h-16 w-16 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105 sm:h-20 sm:w-20" titulo />
                <h3 className="mt-4 font-display text-lg font-bold text-white">{bot.nome}</h3>
                <p className="text-sm font-semibold" style={{ color: bot.cores[0] }}>
                  {bot.funcao}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-suave">{bot.faz}</p>
              </div>
            </Revelar>
          ))}
        </ul>
        <p className="mt-6 text-center text-sm text-suave">
          Exemplos de equipe. Você escolhe os nomes, as funções e o jeito de cada bot.
        </p>
      </div>
    </section>
  );
}
