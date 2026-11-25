'use client';

import { motion } from 'motion/react';
import { ListChecks, Smartphone, Wallet, type LucideIcon } from 'lucide-react';
import { CabecalhoSecao, Revelar } from './ui';

function Cartao({
  icone: Icone,
  titulo,
  texto,
  atraso = 0,
  children,
}: {
  icone: LucideIcon;
  titulo: string;
  texto: string;
  atraso?: number;
  children: React.ReactNode;
}) {
  return (
    <Revelar atraso={atraso} as="article">
      <div className="group flex h-full flex-col rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition duration-300 hover:border-ciano/40 sm:p-7">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-ciano/10 text-ciano transition group-hover:scale-110">
          <Icone className="h-5 w-5" aria-hidden />
        </span>
        <h3 className="mt-5 font-display text-xl font-bold text-white">{titulo}</h3>
        <p className="mt-2 leading-relaxed text-suave">{texto}</p>
        <div className="mt-6 flex-1 content-end">{children}</div>
      </div>
    </Revelar>
  );
}

function ConversaWhatsApp() {
  const bolhas = [
    {
      lado: 'bot',
      conteudo: (
        <>
          <span className="block text-xs font-bold text-ciano">#A7 · Loja Online · Ana</span>
          <span className="block font-semibold">Enviar em seu nome?</span>
          <span className="block text-[#aebac1]">Gmail: enviar e-mail para 1.240 contatos</span>
          <span className="mt-1 block">1 Aprovar · 2 Recusar</span>
        </>
      ),
    },
    { lado: 'voce', conteudo: '1' },
    { lado: 'bot', conteudo: '✔ #A7: Aprovar. Feito, igual a no app.' },
  ];
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b141a] p-3">
      <div className="flex flex-col gap-2">
        {bolhas.map((b, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ delay: 0.3 + i * 0.7, duration: 0.4 }}
            className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-snug text-[#e9edef] ${
              b.lado === 'bot' ? 'self-start rounded-tl-sm bg-[#1f2c34]' : 'self-end rounded-tr-sm bg-[#005c4b]'
            }`}
          >
            {b.conteudo}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function BarraVerba() {
  return (
    <div className="rounded-2xl border border-white/10 bg-noite/60 p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-suave">Verba de IA no mês · Loja Online</span>
        <span className="font-semibold tabular-nums text-white">80%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-ciano via-amber-300 to-amber-400"
          initial={{ width: 0 }}
          whileInView={{ width: '80%' }}
          viewport={{ once: true }}
          transition={{ duration: 1.6, ease: 'easeOut' }}
        />
      </div>
      <p className="mt-3 text-xs text-amber-300">Atenção: 80% da verba usada</p>
    </div>
  );
}

const REGRAS = [
  ['Enviar e-mail para clientes', 'pede aprovação'],
  ['Publicar nas redes', 'pede aprovação'],
  ['Pesquisar na web', 'livre'],
  ['Mexer no financeiro', 'pede aprovação'],
];

function Regras() {
  return (
    <ul className="space-y-2 rounded-2xl border border-white/10 bg-noite/60 p-4 text-sm">
      {REGRAS.map(([acao, regra]) => (
        <li key={acao} className="flex items-center justify-between gap-3">
          <span className="text-texto">{acao}</span>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              regra === 'livre' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-300'
            }`}
          >
            {regra}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Controle() {
  return (
    <section id="controle" aria-labelledby="controle-titulo" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <CabecalhoSecao
          id="controle-titulo"
          selo="Você no controle"
          titulo="E se a IA errar? Ela não age sozinha no que importa"
          texto="Você decide o que cada bot pode fazer sozinho e o que precisa da sua aprovação. E sabe quanto vai gastar antes de gastar."
        />
        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          <Cartao
            icone={Smartphone}
            titulo="Aprovação pelo WhatsApp"
            texto="Antes de enviar algo em seu nome, o bot para e pergunta. A mensagem chega no seu WhatsApp e você responde com um número, de onde estiver."
          >
            <ConversaWhatsApp />
          </Cartao>
          <Cartao
            icone={ListChecks}
            titulo="Regras por empresa"
            texto="Cada empresa tem as suas regras de aprovação. O que é livre, o bot faz; o que é sensível, espera por você."
            atraso={0.08}
          >
            <Regras />
          </Cartao>
          <Cartao
            icone={Wallet}
            titulo="Custo previsível"
            texto="Créditos de IA inclusos no plano e uma verba por empresa. Você recebe aviso a 80% e a 100%, e os bots pausam quando a verba acaba, até você liberar."
            atraso={0.16}
          >
            <BarraVerba />
          </Cartao>
        </div>
      </div>
    </section>
  );
}
