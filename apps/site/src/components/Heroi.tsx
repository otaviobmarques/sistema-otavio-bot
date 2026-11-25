'use client';

import { motion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';
import { Check } from 'lucide-react';
import { equipe } from '@/config/equipe';
import { AvatarBot } from './AvatarBot';
import { ConversaAnimada } from './AnimacaoPreguicosa';
import { BotaoContato, Selo } from './ui';

const DESTAQUES = ['Claude, ChatGPT, Gemini, Grok e outras IAs', 'Computador próprio para cada bot', 'Aprovação pelo WhatsApp', 'Sem fidelidade'];

export function Heroi() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const orbe1 = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const orbe2 = useTransform(scrollYProgress, [0, 1], [0, -120]);

  return (
    <section ref={ref} id="inicio" className="relative isolate overflow-hidden pt-28 pb-16 sm:pt-36 lg:pb-20">
      <div className="grade-fundo absolute inset-0 -z-10" aria-hidden />
      <motion.div style={{ y: orbe1 }} aria-hidden className="absolute -left-40 top-10 -z-10 h-[28rem] w-[28rem] rounded-full bg-ciano/20 blur-[120px]" />
      <motion.div style={{ y: orbe2 }} aria-hidden className="absolute -right-32 top-48 -z-10 h-[26rem] w-[26rem] rounded-full bg-violeta/25 blur-[120px]" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <Selo>Sua equipe de IA, 24 horas por dia</Selo>
          <h1 className="mt-6 font-display text-[2.2rem] font-extrabold leading-[1.08] tracking-tight text-white sm:text-6xl lg:text-[4.2rem]">
            Contrate uma equipe de bots de IA que trabalha <span className="texto-gradiente">24 horas</span> pela sua empresa
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-suave sm:text-xl">
            Atendimento fora do horário, pesquisa, posts, planilhas e cadastros em portais. Os bots dividem as tarefas entre
            si, entregam pronto e pedem a sua aprovação pelo WhatsApp antes de qualquer coisa sensível.{' '}
            <strong className="font-semibold text-white">A partir de R$ 159 por mês.</strong>
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <BotaoContato acao="assinar" className="w-full sm:w-auto">
              Começar agora
            </BotaoContato>
            <BotaoContato variante="secundario" className="w-full sm:w-auto">
              Falar com um especialista
            </BotaoContato>
          </div>
          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-suave">
            {DESTAQUES.map((d) => (
              <li key={d} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-ciano" aria-hidden />
                {d}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto mt-14 max-w-6xl sm:mt-16">
          <div aria-hidden className="absolute -inset-x-10 -bottom-10 top-10 -z-10 rounded-[3rem] bg-ciano/10 blur-3xl" />
          <div className="mx-auto max-w-[24rem] md:max-w-none">
            <div className="borda-brilho rounded-[2.2rem] bg-noite-2/90 p-2 shadow-2xl shadow-black/60 md:rounded-3xl md:p-2.5">
              <div className="mb-2 hidden items-center gap-1.5 px-3 pt-1.5 md:flex" aria-hidden>
                <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
                <span className="h-3 w-3 rounded-full bg-[#28c840]" />
                <span className="ml-3 text-xs text-suave">ArkoBot</span>
              </div>
              <ConversaAnimada className="overflow-hidden rounded-[1.8rem] md:rounded-2xl" />
            </div>
          </div>
          <div className="mt-6 flex flex-col items-center gap-3 text-center text-sm text-suave sm:flex-row sm:justify-center">
            <div className="flex -space-x-2" aria-hidden>
              {equipe.slice(0, 6).map((b) => (
                <AvatarBot key={b.id} bot={b} tamanho={30} className="rounded-[9px] ring-2 ring-noite" />
              ))}
            </div>
            Vários bots na mesma conversa, cada um com a sua função. É assim no app.
          </div>
        </div>
      </div>
    </section>
  );
}
