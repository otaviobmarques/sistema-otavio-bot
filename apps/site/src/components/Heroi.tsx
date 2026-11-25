'use client';

import { motion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';
import { Check } from 'lucide-react';
import { AnimacaoPreguicosa } from './AnimacaoPreguicosa';
import { BotaoContato, Selo } from './ui';

const DESTAQUES = ['Claude, ChatGPT, Gemini e outras IAs', 'Um computador para cada bot', 'Aprovação pelo WhatsApp'];

export function Heroi() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const orbe1 = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const orbe2 = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const palco = useTransform(scrollYProgress, [0, 1], [0, 60]);

  return (
    <section ref={ref} id="inicio" className="relative isolate overflow-hidden pt-28 pb-16 sm:pt-36 lg:pb-24">
      <div className="grade-fundo absolute inset-0 -z-10" aria-hidden />
      <motion.div
        style={{ y: orbe1 }}
        aria-hidden
        className="absolute -left-40 top-10 -z-10 h-[28rem] w-[28rem] rounded-full bg-ciano/20 blur-[120px]"
      />
      <motion.div
        style={{ y: orbe2 }}
        aria-hidden
        className="absolute -right-32 top-48 -z-10 h-[26rem] w-[26rem] rounded-full bg-violeta/25 blur-[120px]"
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <Selo>Bots de IA para empresas</Selo>
          <h1 className="mt-6 font-display text-[2.35rem] font-extrabold leading-[1.08] tracking-tight text-white sm:text-6xl lg:text-7xl">
            Uma equipe de bots de IA trabalhando <span className="texto-gradiente">24 horas</span> pela sua empresa
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-suave sm:text-xl">
            Cada bot tem nome, função, memória e um computador próprio. Ele usa a IA que você escolher, trabalha sem
            parar e pede a sua aprovação antes de qualquer ação sensível.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <BotaoContato className="w-full sm:w-auto">Começar</BotaoContato>
            <BotaoContato variante="secundario" href="#como-funciona" className="w-full sm:w-auto">
              Ver como funciona
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

        <motion.div style={{ y: palco }} className="relative mx-auto mt-14 max-w-6xl sm:mt-16">
          <div aria-hidden className="absolute -inset-x-10 -bottom-10 top-10 -z-10 rounded-[3rem] bg-ciano/10 blur-3xl" />
          <div className="borda-brilho rounded-2xl bg-noite-2/80 p-1.5 shadow-2xl shadow-black/60 sm:rounded-3xl sm:p-2.5">
            <AnimacaoPreguicosa
              tipo="equipe"
              proporcao="1280 / 800"
              rotulo="Animação: quatro bots do ArkoBot trabalhando ao mesmo tempo, cada um no seu computador, e um pedido de aprovação chegando pelo WhatsApp."
              className="overflow-hidden rounded-xl sm:rounded-2xl"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
