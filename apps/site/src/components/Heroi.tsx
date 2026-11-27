'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { equipe } from '@/config/equipe';
import { AvatarBot } from './AvatarBot';
import { ConversaAnimada } from './AnimacaoPreguicosa';
import { BotaoContato } from './ui';

const ALVOS = ['Sua empresa', 'Seu atendimento', 'Suas vendas', 'Seu financeiro', 'Seu marketing', 'Sua contratação'];

const FLUTUANTES = [
  { id: 'ana', classe: 'left-0 top-0 h-10 w-10 sm:left-[3%] sm:h-14 sm:w-14', giro: '-8deg', atraso: '0s' },
  { id: 'nina', classe: 'left-[10%] top-[62%] hidden h-12 w-12 md:block', giro: '6deg', atraso: '1.2s' },
  { id: 'caio', classe: 'right-0 top-[4%] h-10 w-10 sm:right-[3%] sm:h-14 sm:w-14', giro: '8deg', atraso: '0.6s' },
  { id: 'duda', classe: 'right-[10%] top-[64%] hidden h-12 w-12 md:block', giro: '-6deg', atraso: '1.8s' },
];

function PalavraQueGira() {
  const reduzir = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduzir) return;
    const id = window.setInterval(() => setI((v) => (v + 1) % ALVOS.length), 2200);
    return () => window.clearInterval(id);
  }, [reduzir]);
  return (
    <span className="relative grid h-[1.3em] justify-items-center overflow-hidden pt-[0.08em]">
      <span className="invisible col-start-1 row-start-1 whitespace-nowrap" aria-hidden>
        Seu atendimento
      </span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={ALVOS[i]}
          className="col-start-1 row-start-1 whitespace-nowrap text-ciano-forte"
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-100%', opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          {ALVOS[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function Heroi() {
  return (
    <section id="inicio" aria-labelledby="heroi-titulo" className="relative overflow-hidden pt-24 pb-16 sm:pt-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="relative mx-auto max-w-5xl text-center">
          <div aria-hidden className="pointer-events-none relative select-none py-4">
            <div className="relative font-display text-[19vw] font-extrabold leading-[0.95] tracking-tighter sm:text-[9.5rem]">
              <span className="text-tinta">arko</span>
              <span className="text-ciano-forte">bot</span>
            </div>
            {FLUTUANTES.map((f) => {
              const bot = equipe.find((b) => b.id === f.id)!;
              return (
                <span
                  key={f.id}
                  className={`absolute animate-flutuar drop-shadow-lg ${f.classe}`}
                  style={{ ['--giro' as string]: f.giro, animationDelay: f.atraso }}
                >
                  <AvatarBot bot={bot} className="h-full w-full" />
                </span>
              );
            })}
          </div>

          <h1 id="heroi-titulo" className="mt-4 text-[2.1rem] font-semibold leading-[1.1] tracking-tight text-tinta sm:text-6xl">
            <PalavraQueGira />
            <span className="block">no piloto automático</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-cinza sm:text-lg">
            Uma equipe de bots de IA que atende, vende, cobra e pesquisa 24 horas por dia. Cada bot tem a sua função e o seu
            computador, conversa com os outros e pede o seu sim pelo WhatsApp antes de qualquer coisa sensível.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <BotaoContato acao="assinar" className="w-full sm:w-auto">
              Começar agora
            </BotaoContato>
            <BotaoContato variante="secundario" className="w-full sm:w-auto">
              Falar com um especialista
            </BotaoContato>
          </div>
          <p className="mt-4 text-sm text-cinza">
            IA inclusa no plano, ou conecte a sua própria conta de IA. A partir de R$ 39 por mês, com 7 dias grátis no Inicial, sem fidelidade.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-auto mt-12 max-w-[24rem] md:max-w-none"
        >
          <div aria-hidden className="absolute inset-x-10 -bottom-6 top-16 -z-10 rounded-[3rem] bg-ciano/25 blur-3xl" />
          <div className="rounded-[2.2rem] bg-noite p-2 shadow-[0_40px_100px_-30px_rgba(11,18,48,0.55)] ring-1 ring-black/10 md:rounded-[1.4rem] md:p-0">
            <div className="hidden items-center gap-1.5 px-4 pb-1 pt-3 md:flex" aria-hidden>
              <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <span className="h-3 w-3 rounded-full bg-[#28c840]" />
            </div>
            <ConversaAnimada className="overflow-hidden rounded-[1.8rem] md:rounded-b-[1.4rem] md:rounded-t-none" />
          </div>
          <p className="mt-4 text-center text-sm text-cinza">Interface do app · conversa ilustrativa com dados de exemplo.</p>
        </motion.div>
      </div>
    </section>
  );
}
