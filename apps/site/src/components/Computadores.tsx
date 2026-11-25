'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { Eye, Globe, Hand, KeyRound, MonitorSmartphone, Server } from 'lucide-react';
import { botPorId } from '@/config/equipe';
import { computadorAdicional, formatarReais } from '@/config/planos';
import { AvatarBot } from './AvatarBot';
import { CabecalhoSecao, Revelar } from './ui';

const ITENS = [
  {
    icone: MonitorSmartphone,
    titulo: 'Um desktop só dele',
    texto: 'Cada bot pode ter o seu próprio computador Linux, separado dos outros, para não misturar arquivos, abas e logins.',
  },
  {
    icone: Globe,
    titulo: 'Navega e usa programas',
    texto: 'Abre sites, preenche formulários, baixa arquivos e usa os programas do desktop, como uma pessoa faria.',
  },
  {
    icone: Eye,
    titulo: 'Você assiste ao vivo',
    texto: 'A tela do computador do bot aparece no app enquanto ele trabalha. Dá para acompanhar cada passo.',
  },
  {
    icone: Hand,
    titulo: 'Assuma o controle',
    texto: 'Quer fazer algo você mesmo? Clique em “Assumir o controle”, mexa no desktop e devolva para o bot.',
  },
  {
    icone: KeyRound,
    titulo: 'Logins no lugar certo',
    texto: 'Quando um site pede login, o bot chama você, que entra direto no computador dele. Depois, ele segue trabalhando.',
  },
  {
    icone: Server,
    titulo: 'Na nuvem ou no seu servidor',
    texto: 'Use computadores na nuvem ou transforme um servidor (VPS) que você já tem no computador dos bots.',
  },
];

function JanelaDesktop() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b1230] shadow-2xl shadow-black/60">
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.04] px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        <span className="ml-3 flex items-center gap-2 text-sm font-medium text-white">
          <AvatarBot bot={botPorId('rafa')} className="h-6 w-6" /> Computador do Rafa
        </span>
        <span className="ml-auto flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-300">
          <span className="h-1.5 w-1.5 animate-pulso rounded-full bg-red-400" /> ao vivo
        </span>
      </div>
      <div className="relative h-[19rem] bg-[radial-gradient(circle_at_30%_20%,rgba(61,123,255,0.25),transparent_55%),radial-gradient(circle_at_80%_90%,rgba(139,92,246,0.25),transparent_50%)] sm:h-[22rem]">
        <motion.div
          className="absolute left-[6%] top-[8%] w-[88%] sm:w-[62%] rounded-xl border border-white/10 bg-noite/90 shadow-xl"
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-[11px] text-suave">
            <Globe className="h-3.5 w-3.5" /> portal.fornecedor.com.br/pedidos
          </div>
          <div className="space-y-2 p-3">
            {[80, 60, 72].map((w, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="h-2 w-12 rounded bg-white/15" />
                <motion.span
                  className="h-6 rounded-md border border-ciano/30 bg-ciano/10"
                  initial={{ width: '0%' }}
                  whileInView={{ width: `${w}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.2, delay: 0.4 + i * 0.5 }}
                />
              </div>
            ))}
            <div className="flex justify-end pt-1">
              <span className="rounded-md bg-ciano px-3 py-1 text-[11px] font-bold text-noite">Enviar pedido</span>
            </div>
          </div>
        </motion.div>
        <motion.div
          className="absolute bottom-[8%] right-[5%] hidden w-[52%] sm:block rounded-xl border border-white/10 bg-noite/90 p-3 font-mono text-[11px] leading-5 text-suave shadow-xl"
          animate={{ y: [0, 5, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="mb-1 text-white/70">planilha-pedidos.csv</div>
          <div>
            <span className="text-ciano">✓</span> 128 linhas lidas
          </div>
          <div>
            <span className="text-ciano">✓</span> 12 pedidos novos
          </div>
          <div className="text-white">
            <span className="text-amber-300">→</span> preenchendo o portal…
          </div>
        </motion.div>
        <motion.svg
          viewBox="0 0 24 24"
          className="absolute h-6 w-6 drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]"
          animate={{ left: ['20%', '55%', '58%', '30%', '20%'], top: ['30%', '42%', '62%', '50%', '30%'] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          aria-hidden
        >
          <path d="M3 2 L20 11 L12 13 L9 21 Z" fill="#fff" stroke="#050817" strokeWidth="1.5" strokeLinejoin="round" />
        </motion.svg>
        <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full border border-white/10 bg-noite/80 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
          <Hand className="h-3.5 w-3.5 text-ciano" /> Assumir o controle
        </div>
      </div>
    </div>
  );
}

export function Computadores() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [50, -50]);
  const rot = useTransform(scrollYProgress, [0, 1], [3, -3]);

  return (
    <section ref={ref} id="computadores" aria-labelledby="computadores-titulo" className="relative overflow-hidden py-24 sm:py-32">
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-full bg-[radial-gradient(60%_50%_at_70%_40%,rgba(0,232,248,0.08),transparent)]" />
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:gap-20 lg:px-8">
        <div>
          <CabecalhoSecao
            centro={false}
            id="computadores-titulo"
            selo="O diferencial"
            titulo={
              <>
                Cada bot com o <span className="texto-gradiente">seu próprio computador</span>
              </>
            }
            texto="Um bot que só conversa ajuda pouco. No ArkoBot, cada bot pode ter a sua própria máquina para trabalhar de verdade: entrar em portais, usar programas, baixar notas e entregar o serviço pronto, enquanto você acompanha pela tela."
          />
          <Revelar atraso={0.15}>
            <ul className="mt-10 grid gap-5 sm:grid-cols-2">
              {ITENS.map((item) => (
                <li key={item.titulo} className="flex gap-3">
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ciano/10 text-ciano">
                    <item.icone className="h-[18px] w-[18px]" aria-hidden />
                  </span>
                  <div>
                    <h3 className="font-semibold text-white">{item.titulo}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-suave">{item.texto}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Revelar>
        </div>
        <motion.div style={{ y, rotate: rot }} className="relative">
          <div aria-hidden className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-tr from-ciano/20 via-azul/10 to-violeta/20 blur-2xl" />
          <JanelaDesktop />
          <p className="mt-4 text-center text-xs text-suave/80">Ilustração de um bot trabalhando no computador dele.</p>
          <p className="mt-6 rounded-2xl border border-ciano/30 bg-ciano/10 px-5 py-4 text-center text-sm text-white">
            <strong className="font-display text-base">+ {formatarReais(computadorAdicional.precoMensal)}/mês</strong>: dê a qualquer
            bot o seu próprio computador (VPS) individual. Os planos Profissional e Empresa já incluem computadores.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
