'use client';

import { motion } from 'motion/react';
import {
  AppWindow,
  Brain,
  CalendarClock,
  Clapperboard,
  Moon,
  Plug,
  Scale,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';
import { CabecalhoSecao, Revelar } from './ui';

function Cartao({
  icone: Icone,
  titulo,
  texto,
  className = '',
  atraso = 0,
  children,
}: {
  icone: LucideIcon;
  titulo: string;
  texto: string;
  className?: string;
  atraso?: number;
  children?: React.ReactNode;
}) {
  return (
    <Revelar atraso={atraso} as="article" className={className}>
      <div className="group relative h-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-7 transition duration-300 hover:border-ciano/40">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-ciano/0 blur-3xl transition duration-500 group-hover:bg-ciano/20"
        />
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-ciano/10 text-ciano transition duration-300 group-hover:rotate-[-6deg] group-hover:scale-110">
          <Icone className="h-5 w-5" aria-hidden />
        </span>
        <h3 className="mt-5 font-display text-xl font-bold text-white">{titulo}</h3>
        <p className="mt-2 leading-relaxed text-suave">{texto}</p>
        {children && <div className="mt-6">{children}</div>}
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
          <span className="block text-[#aebac1]">Gmail: enviar e-mail para 3 contatos</span>
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
            className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug text-[#e9edef] ${
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
        <span className="text-suave">Verba de IA no mês</span>
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

function Gravando() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-noite/60 p-4 text-sm">
      <span className="relative flex h-3 w-3">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
      </span>
      <span className="text-white">Gravando</span>
      <span className="ml-auto rounded-full bg-ciano px-3 py-1 text-xs font-bold text-noite">Gerar skill</span>
    </div>
  );
}

export function Recursos() {
  return (
    <section id="recursos" aria-labelledby="recursos-titulo" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <CabecalhoSecao
          id="recursos-titulo"
          selo="Recursos"
          titulo="Tudo o que a sua equipe de bots precisa"
          texto="Controle de verdade sobre o que os bots fazem, quanto gastam e quando falam com você."
        />
        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Cartao
            icone={Smartphone}
            titulo="Aprovações pelo WhatsApp"
            texto="Quando um bot precisa de você, chega uma mensagem curta no seu WhatsApp. Responda com um número e pronto: vale igual a um clique no app."
            className="lg:row-span-2"
          >
            <ConversaWhatsApp />
            <p className="mt-4 text-xs leading-relaxed text-suave/80">
              Só o número que você cadastrar pode aprovar. Recomendamos um chip separado para o bot.
            </p>
          </Cartao>
          <Cartao
            icone={Scale}
            titulo="Regras e orçamento por empresa"
            texto="Cada empresa tem a sua verba de IA no mês e as suas regras de aprovação. Você recebe aviso a 80% e a 100%, e os bots pausam quando a verba acaba, até você liberar."
            atraso={0.05}
          >
            <BarraVerba />
          </Cartao>
          <Cartao
            icone={Clapperboard}
            titulo="Ensine uma tarefa"
            texto="Grave a tela por até 10 minutos fazendo a tarefa, narrando se quiser. Dela sai um rascunho de habilidade para você revisar e entregar ao bot."
            atraso={0.1}
          >
            <Gravando />
          </Cartao>
          <Cartao
            icone={Moon}
            titulo="Roda 24 horas"
            texto="Coloque o ArkoBot num servidor e os bots, as conversas e as rotinas continuam rodando mesmo com o seu computador desligado."
            atraso={0.05}
          />
          <Cartao
            icone={AppWindow}
            titulo="App para PC e celular"
            texto="App para Windows, macOS e Linux, e um app web que você instala na tela inicial do celular, no iPhone ou no Android."
            atraso={0.1}
          />
          <Cartao
            icone={CalendarClock}
            titulo="Rotinas agendadas"
            texto="Peça uma vez e o bot repete no horário marcado: relatórios, conferências, respostas e acompanhamentos."
          />
          <Cartao
            icone={Brain}
            titulo="Memória e personalidade"
            texto="Cada bot tem nome, jeito de falar e memória própria. Ele lembra do contexto da sua empresa entre uma conversa e outra."
            atraso={0.05}
          />
          <Cartao
            icone={Plug}
            titulo="Conecte os seus apps"
            texto="Ligue Gmail, Slack, Notion e outros apps para os bots trabalharem onde a sua equipe já trabalha."
            atraso={0.1}
          />
        </div>
      </div>
    </section>
  );
}
