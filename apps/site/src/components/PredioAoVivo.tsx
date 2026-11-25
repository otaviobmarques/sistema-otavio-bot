'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';
import { Building2, Gavel, Inbox } from 'lucide-react';
import { Marca } from './Logo';
import { CabecalhoSecao, Revelar } from './ui';

type Status = 'trabalhando' | 'esperando' | 'ocioso';

const COR_STATUS: Record<Status, string> = {
  trabalhando: 'bg-emerald-400',
  esperando: 'bg-amber-400',
  ocioso: 'bg-slate-500',
};

const T: Status = 'trabalhando';
const E: Status = 'esperando';
const O: Status = 'ocioso';

const ANDARES = [
  {
    numero: 3,
    empresa: 'Loja Online',
    verba: 0.58,
    bots: [
      { nome: 'Ana', ciclo: [T, T, T, E, T, T, T, T] },
      { nome: 'Beto', ciclo: [T, T, O, O, T, T, T, T] },
      { nome: 'Caio', ciclo: [O, T, T, T, T, E, T, T] },
    ],
  },
  {
    numero: 2,
    empresa: 'Agência',
    verba: 0.82,
    bots: [
      { nome: 'Duda', ciclo: [T, E, E, T, T, T, O, T] },
      { nome: 'Eva', ciclo: [T, T, T, T, O, O, T, T] },
    ],
  },
  {
    numero: 1,
    empresa: 'Consultoria',
    verba: 0.34,
    bots: [
      { nome: 'Fábio', ciclo: [T, T, T, T, T, T, E, T] },
      { nome: 'Gabi', ciclo: [O, O, T, T, T, T, T, O] },
      { nome: 'Hugo', ciclo: [T, T, T, O, T, T, T, T] },
    ],
  },
];

const EVENTOS = [
  'Ana respondeu 6 clientes da Loja Online',
  'Duda pediu sua aprovação para publicar um post',
  'Gabi começou o relatório semanal da Consultoria',
  'Ana quer enviar um orçamento em seu nome',
  'Eva entrou no computador dela',
  'Caio pediu sua aprovação para responder um cliente',
  'Fábio quer a sua decisão sobre um reembolso',
  'Hugo terminou de preencher o portal do fornecedor',
];

const PARADAS = ['0%', '20%', '40%', '60%', '80%'];

function Contador({ valor, rotulo, cor }: { valor: number; rotulo: string; cor: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-suave">
        <span className={`h-2 w-2 rounded-full ${cor}`} />
        {rotulo}
      </div>
      <div className="relative mt-1 h-10 overflow-hidden font-display text-3xl font-bold tabular-nums text-white">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={valor}
            className="absolute left-0"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -30, opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            {valor}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}

export function PredioAoVivo() {
  const ref = useRef<HTMLDivElement>(null);
  const visivel = useInView(ref, { margin: '-80px' });
  const reduzir = useReducedMotion();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!visivel || reduzir) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 2200);
    return () => window.clearInterval(id);
  }, [visivel, reduzir]);

  const passo = tick % 8;
  const todos = ANDARES.flatMap((a) => a.bots.map((b) => b.ciclo[passo]));
  const trabalhando = todos.filter((s) => s === 'trabalhando').length;
  const esperando = todos.filter((s) => s === 'esperando').length;
  const eventos = Array.from({ length: 4 }, (_, i) => ({
    id: tick - i,
    texto: EVENTOS[(((tick - i) % EVENTOS.length) + EVENTOS.length) % EVENTOS.length],
  })).filter((e) => e.id >= 0);
  const parada = PARADAS[tick % PARADAS.length];

  return (
    <section id="predio" aria-labelledby="predio-titulo" className="relative py-24 sm:py-32">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,transparent,rgba(17,26,58,0.6)_30%,rgba(17,26,58,0.6)_70%,transparent)]" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <CabecalhoSecao
          id="predio-titulo"
          selo="Prédio ao vivo"
          titulo={
            <>
              Suas empresas como <span className="texto-gradiente">andares de um prédio</span>
            </>
          }
          texto="Cada empresa ganha um andar, com as equipes, os bots, a verba de IA do mês e as regras de aprovação dela. Na cobertura fica a Sala do conselho, onde as suas decisões esperam. Bata o olho e veja quem está trabalhando e quem precisa de você."
        />

        <div ref={ref} className="mt-14 grid gap-6 lg:grid-cols-[1fr_20rem]">
          <Revelar className="min-w-0">
            <div className="relative rounded-3xl border border-white/10 bg-noite-2/80 p-3 shadow-2xl shadow-black/50 sm:p-5">
              <div className="mx-auto mb-4 w-fit rounded-full border border-ciano/40 bg-ciano/10 px-5 py-1.5 font-display text-sm font-extrabold tracking-[0.3em] text-ciano shadow-[0_0_30px_-4px_rgba(0,232,248,0.6)]">
                ARKOBOT
              </div>
              <div className="flex gap-3">
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div className="flex items-center gap-3 rounded-2xl border border-ciano/25 bg-gradient-to-r from-ciano/10 to-transparent p-3 sm:p-4">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-noite text-ciano">
                      <Gavel className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-suave">Cobertura</div>
                      <div className="truncate font-semibold text-white">Presidência · Sala do conselho</div>
                    </div>
                    <span
                      className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                        esperando ? 'bg-amber-400/15 text-amber-300' : 'bg-emerald-400/10 text-emerald-300'
                      }`}
                    >
                      {esperando === 0 ? 'em dia' : esperando === 1 ? '1 decisão na mesa' : `${esperando} decisões na mesa`}
                    </span>
                  </div>

                  {ANDARES.map((andar) => (
                    <div key={andar.numero} className="rounded-2xl border border-white/10 bg-white/[0.025] p-3 sm:p-4">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-suave">
                          {andar.numero}º andar
                        </span>
                        <span className="font-semibold text-white">{andar.empresa}</span>
                        <span className="ml-auto text-xs text-suave">
                          Verba de IA no mês: <span className="tabular-nums text-white">{Math.round(andar.verba * 100)}%</span>
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <motion.div
                          className={`h-full rounded-full ${andar.verba >= 0.8 ? 'bg-amber-400' : 'bg-gradient-to-r from-azul to-ciano'}`}
                          initial={{ width: 0 }}
                          whileInView={{ width: `${andar.verba * 100}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 1.4, ease: 'easeOut' }}
                        />
                      </div>
                      <ul className="mt-3 flex flex-wrap gap-2 sm:gap-3">
                        {andar.bots.map((bot) => {
                          const status = bot.ciclo[passo];
                          return (
                            <li
                              key={bot.nome}
                              className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 transition-colors duration-500 ${
                                status === 'esperando' ? 'border-amber-400/50 bg-amber-400/10' : 'border-white/10 bg-noite/60'
                              }`}
                            >
                              <span className="relative grid h-8 w-8 place-items-center rounded-lg bg-noite">
                                <Marca className="h-6 w-6" />
                                <motion.span
                                  key={status}
                                  initial={{ scale: 0.4 }}
                                  animate={{ scale: 1 }}
                                  className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-noite ${COR_STATUS[status]}`}
                                />
                              </span>
                              <span className="text-sm">
                                <span className="block font-medium leading-tight text-white">{bot.nome}</span>
                                <span className="block text-[11px] leading-tight text-suave">{status}</span>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}

                  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3 sm:p-4">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-noite text-suave">
                      <Inbox className="h-4 w-4" aria-hidden />
                    </span>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-suave">Térreo</div>
                      <div className="font-semibold text-white">Recepção</div>
                    </div>
                    <span className="ml-auto hidden text-xs text-suave sm:block">Onde chegam os pedidos novos</span>
                  </div>
                </div>

                <div aria-hidden className="relative hidden w-10 rounded-2xl border border-white/10 bg-black/30 sm:block">
                  <div className="absolute inset-x-1/2 inset-y-3 w-px -translate-x-1/2 bg-white/10" />
                  <motion.div
                    className="absolute left-1 right-1 h-[18%] rounded-xl border border-ciano/50 bg-ciano/15 shadow-[0_0_20px_rgba(0,232,248,0.4)]"
                    animate={{ top: parada }}
                    transition={{ type: 'spring', stiffness: 60, damping: 16 }}
                  >
                    <Building2 className="mx-auto mt-2 h-4 w-4 text-ciano" />
                  </motion.div>
                </div>
              </div>
            </div>
          </Revelar>

          <Revelar atraso={0.1} className="min-w-0 space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
              <Contador valor={trabalhando} rotulo="bots trabalhando" cor="bg-emerald-400" />
              <Contador valor={esperando} rotulo="esperando você" cor="bg-amber-400" />
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-suave">Agora no prédio</div>
              <ul className="mt-3 space-y-2" aria-live="off">
                <AnimatePresence initial={false}>
                  {eventos.map((e) => (
                    <motion.li
                      key={e.id}
                      layout
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4 }}
                      className="rounded-xl bg-noite/60 px-3 py-2 text-sm text-texto"
                    >
                      {e.texto}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </div>
            <p className="text-xs leading-relaxed text-suave/80">
              Ilustração com empresas e bots de exemplo. No app, o Prédio mostra os seus bots de verdade, em andares ou
              no modo Ao vivo, com elevador e Sala do conselho.
            </p>
          </Revelar>
        </div>
      </div>
    </section>
  );
}
