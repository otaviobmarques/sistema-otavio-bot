'use client';

import { motion } from 'motion/react';
import { Check, Gavel, Pin, Plug } from 'lucide-react';
import { botPorId, equipe } from '@/config/equipe';
import { computadorAdicional, formatarReais } from '@/config/planos';
import { AvatarBot } from './AvatarBot';
import { ias, LogoIntegracao, servicos } from './Integracoes';
import { CabecalhoSecao, Revelar, Secao } from './ui';

function Bloco({
  titulo,
  texto,
  children,
  className = '',
  atraso = 0,
}: {
  titulo: string;
  texto: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  atraso?: number;
}) {
  return (
    <Revelar as="article" atraso={atraso} className={className}>
      <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-linha bg-cartao">
        <div className="p-6 sm:p-7">
          <h3 className="text-xl font-semibold text-tinta">{titulo}</h3>
          <p className="mt-2 leading-relaxed text-cinza">{texto}</p>
        </div>
        <div className="mt-auto px-5 pb-5 sm:px-6 sm:pb-6">{children}</div>
      </div>
    </Revelar>
  );
}

const LINHAS_TERMINAL = [
  'abriu o e-mail da empresa',
  'encontrou 4 boletos atrasados',
  'cobrou Mercado Central',
  'cobrou Studio Lume',
  'cobrou Oficina Prado',
  'cobrou Café Aurora',
];

const CAIXA = [
  ['Mercado Central', 'Boleto 1042 · R$ 1.280'],
  ['Studio Lume', 'Boleto 1047 · R$ 860'],
  ['Oficina Prado', 'Boleto 1051 · R$ 2.450'],
  ['Café Aurora', 'Boleto 1055 · R$ 430'],
];

function MockComputador() {
  const beto = botPorId('beto');
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[linear-gradient(140deg,#0b3b4a,#0a1029_55%,#1c1446)] p-3 shadow-[0_30px_60px_-30px_rgba(11,18,48,0.7)] sm:p-4">
      <div className="mb-3 flex items-center justify-between text-[11px] text-white/70">
        <span className="flex items-center gap-1.5">
          <AvatarBot bot={beto} className="h-4 w-4" /> Computador do Beto
        </span>
        <span>sex 9:41</span>
        <span className="hidden text-emerald-300 sm:inline">4/4 cobranças enviadas</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1.15fr]">
        <div className="rounded-xl border border-white/10 bg-black/60 p-3 font-mono text-[11px] leading-5 text-white/80">
          <div className="mb-1 text-white/50">beto@nuvem: ~</div>
          {LINHAS_TERMINAL.map((l, i) => (
            <motion.div
              key={l}
              initial={{ opacity: 0, x: -6 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 + i * 0.35 }}
            >
              <span className="text-emerald-400">✓</span> {l}
            </motion.div>
          ))}
        </div>
        <div className="hidden overflow-hidden rounded-xl bg-white text-[11px] sm:block">
          <div className="border-b border-linha px-3 py-2 font-semibold text-tinta">Caixa de entrada · Cobranças</div>
          {CAIXA.map(([nome, info], i) => (
            <div key={nome} className="flex items-center gap-2 border-b border-linha px-3 py-2 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-tinta">{nome}</div>
                <div className="text-cinza">{info}</div>
              </div>
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 1 + i * 0.35 }}
                className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700"
              >
                Cobrança enviada
              </motion.span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MockIA() {
  const lista = ias.filter((i) => !i.soConta).slice(0, 6);
  return (
    <div className="rounded-2xl border border-linha bg-white p-3 text-sm shadow-[0_10px_30px_-20px_rgba(11,18,48,0.5)]">
      <div className="flex items-center gap-2 px-1 pb-2 text-xs text-cinza">
        <AvatarBot bot={botPorId('nina')} className="h-5 w-5" /> Nina · modelo
      </div>
      <ul>
        {lista.map((item, i) => (
          <li key={item.id} className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 ${i === 1 ? 'bg-cartao' : ''}`}>
            <LogoIntegracao item={item} tamanho={18} />
            <span className="font-medium text-tinta">{item.produto}</span>
            <span className="text-xs text-cinza">{item.nome}</span>
            {i === 1 && <Check className="ml-auto h-4 w-4 text-ciano-forte" aria-hidden />}
          </li>
        ))}
      </ul>
      <div className="mt-2 rounded-lg border border-dashed border-linha px-2 py-1.5 text-xs text-cinza">
        Ou conecte a sua conta: ChatGPT, Claude, Gemini, Grok, Kimi, Copilot…
      </div>
    </div>
  );
}

function MockApps() {
  return (
    <div className="rounded-2xl border border-linha bg-white p-3 shadow-[0_10px_30px_-20px_rgba(11,18,48,0.5)]">
      <div className="flex items-center justify-between px-1 pb-2 text-xs">
        <span className="font-semibold text-tinta">Apps conectados</span>
        <span className="text-cinza">via Composio</span>
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {servicos
          .filter((s) => s.id !== 'whatsapp')
          .slice(0, 5)
          .map((s) => (
            <li key={s.id} className="flex flex-col items-center gap-1 rounded-lg bg-cartao px-1 py-2 text-[11px] text-tinta">
              <LogoIntegracao item={s} tamanho={20} />
              {s.nome}
            </li>
          ))}
        <li className="flex flex-col items-center gap-1 rounded-lg bg-cartao px-1 py-2 text-[11px] text-tinta">
          <Plug className="h-5 w-5 text-cinza" aria-hidden />
          Slack e mais
        </li>
      </ul>
    </div>
  );
}

const CONVERSAS = [
  { id: 'ana', ultima: 'Pronto: 7 orçamentos respondidos', hora: '9:41', fixa: true, naoLidas: 2 },
  { id: 'leo', ultima: 'Três coisas precisam de você hoje', hora: '9:12', fixa: true, naoLidas: 0 },
  { id: 'beto', ultima: '4 cobranças enviadas', hora: '8:55', fixa: false, naoLidas: 1 },
  { id: 'caio', ultima: 'Respondi 12 clientes esta noite', hora: 'agora', fixa: false, naoLidas: 0 },
];

function MockConversas() {
  return (
    <div className="rounded-2xl border border-linha bg-white p-2 shadow-[0_10px_30px_-20px_rgba(11,18,48,0.5)]">
      {CONVERSAS.map((c) => {
        const bot = botPorId(c.id);
        return (
          <div key={c.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-cartao">
            <AvatarBot bot={bot} className="h-9 w-9 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-tinta">
                {bot.nome}
                {c.fixa && <Pin className="h-3 w-3 rotate-45 text-cinza" aria-label="fixada" />}
              </div>
              <div className="truncate text-xs text-cinza">{c.ultima}</div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-[11px] text-cinza">{c.hora}</span>
              {c.naoLidas > 0 && (
                <span className="grid h-4 min-w-4 place-items-center rounded-full bg-ciano-forte px-1 text-[10px] font-bold text-white">
                  {c.naoLidas}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MockWhatsApp() {
  return (
    <div className="rounded-2xl bg-[#efeae2] p-3 shadow-[0_10px_30px_-20px_rgba(11,18,48,0.5)]">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="max-w-[92%] rounded-xl rounded-tl-sm bg-white px-3 py-2 text-sm leading-snug text-[#111b21] shadow-sm"
      >
        <div className="text-xs font-bold text-ciano-texto">#A7 · Loja Online · Ana</div>
        <div className="font-semibold">Enviar em seu nome?</div>
        <div className="text-[#54656f]">Gmail: enviar e-mail para 1.240 contatos</div>
        <div className="mt-1">1 Aprovar · 2 Recusar</div>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.8 }}
        className="ml-auto mt-2 w-fit rounded-xl rounded-tr-sm bg-[#d9fdd3] px-3 py-1.5 text-sm text-[#111b21] shadow-sm"
      >
        1
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 1.5 }}
        className="mt-2 w-fit max-w-[92%] rounded-xl rounded-tl-sm bg-white px-3 py-1.5 text-sm text-[#111b21] shadow-sm"
      >
        ✔ #A7: Aprovar. Feito, igual a no app.
      </motion.div>
    </div>
  );
}

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
const AGENDA: [number, number, string, string][] = [
  [0, 0, 'Caixa', 'bg-sky-100 text-sky-800'],
  [1, 0, 'Caixa', 'bg-sky-100 text-sky-800'],
  [2, 0, 'Caixa', 'bg-sky-100 text-sky-800'],
  [3, 0, 'Caixa', 'bg-sky-100 text-sky-800'],
  [4, 0, 'Caixa', 'bg-sky-100 text-sky-800'],
  [0, 1, 'Cobrar', 'bg-emerald-100 text-emerald-800'],
  [2, 1, 'Rivais', 'bg-amber-100 text-amber-800'],
  [3, 2, 'Posts', 'bg-violet-100 text-violet-800'],
  [4, 2, 'Relatório', 'bg-cyan-100 text-cyan-800'],
];

function MockAgenda() {
  return (
    <div className="rounded-2xl border border-linha bg-white p-3 text-[11px] shadow-[0_10px_30px_-20px_rgba(11,18,48,0.5)]">
      <div className="mb-2 rounded-lg bg-cartao px-2 py-1.5 text-xs text-tinta">“Toda sexta às 11h, me mande o relatório da semana”</div>
      <div className="grid grid-cols-5 gap-1 text-center text-cinza">
        {DIAS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-5 grid-rows-3 gap-1">
        {AGENDA.map(([dia, linha, rotulo, cor], i) => (
          <motion.span
            key={`${dia}-${linha}`}
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 + i * 0.08 }}
            className={`rounded-md px-1 py-1.5 text-center font-semibold ${cor}`}
            style={{ gridColumnStart: dia + 1, gridRowStart: linha + 1 }}
          >
            {rotulo}
          </motion.span>
        ))}
      </div>
      <div className="mt-2 text-cinza">Teo agendou: Relatório · sex 11h</div>
    </div>
  );
}

const ANDARES = [
  { andar: '3º', nome: 'Loja Online', bots: ['ana', 'duda', 'caio'], esperando: 'ana' },
  { andar: '2º', nome: 'Consultoria', bots: ['nina', 'teo'] },
  { andar: '1º', nome: 'Financeiro', bots: ['beto', 'rafa'] },
];

function MockPredio() {
  return (
    <div className="rounded-2xl bg-noite p-3 text-[12px] text-white shadow-[0_20px_40px_-25px_rgba(11,18,48,0.8)]">
      <div className="flex items-center gap-2 rounded-xl border border-ciano/30 bg-ciano/10 px-3 py-2">
        <Gavel className="h-3.5 w-3.5 text-ciano" aria-hidden />
        <span className="font-semibold">Sala do conselho</span>
        <span className="ml-auto rounded-full bg-amber-400/20 px-2 py-0.5 text-amber-300">1 decisão</span>
      </div>
      {ANDARES.map((a) => (
        <div key={a.nome} className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
          <span className="w-6 text-white/50">{a.andar}</span>
          <span className="flex-1 font-semibold">{a.nome}</span>
          <span className="flex -space-x-1.5">
            {a.bots.map((id) => (
              <span key={id} className={`rounded-md ${a.esperando === id ? 'ring-2 ring-amber-400' : 'ring-2 ring-noite'}`}>
                <AvatarBot bot={botPorId(id)} className="h-6 w-6" />
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Recursos() {
  return (
    <Secao id="recursos" rotulada="recursos-titulo">
      <CabecalhoSecao
        centro
        id="recursos-titulo"
        titulo="Uma equipe inteira de bots"
        texto="Dê a cada bot uma função, uma IA e um computador. Eles trabalham ao mesmo tempo, 24 horas, e chamam você quando algo precisa da sua decisão."
      />

      <Revelar className="mt-12">
        <div className="grid items-center gap-8 overflow-hidden rounded-3xl border border-linha bg-cartao p-6 sm:p-8 lg:grid-cols-[0.8fr_1.2fr] lg:p-10">
          <div>
            <h3 className="text-2xl font-semibold text-tinta">Cada bot ganha um computador</h3>
            <p className="mt-3 leading-relaxed text-cinza">
              Um desktop só dele, na nuvem, onde o bot entra em portais, usa programas, baixa notas e manda e-mails. Você assiste
              à tela ao vivo e pode assumir o controle quando quiser.
            </p>
            <p className="mt-5 inline-block rounded-2xl bg-white px-4 py-2 text-sm text-tinta ring-1 ring-linha">
              <strong className="mr-1">+ {formatarReais(computadorAdicional.precoMensal)}/mês</strong> por bot com computador
              individual
            </p>
          </div>
          <MockComputador />
        </div>
      </Revelar>

      <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Bloco
          titulo="Escolha a IA de cada bot"
          texto="ChatGPT, Claude, Gemini, Grok, Kimi, DeepSeek e outras inclusas no plano, ou conecte a sua própria conta de IA. Troque o modelo no meio da conversa."
        >
          <MockIA />
        </Bloco>
        <Bloco
          titulo="Apps conectados"
          texto="Gmail, Google Agenda, Notion, HubSpot, GitHub, Slack e muitos outros pela Composio. Conecte uma vez e todos os bots podem usar."
          atraso={0.08}
        >
          <MockApps />
        </Bloco>
        <Bloco
          titulo="Gerencie bots como conversas"
          texto="Fixe, marque como não lida, duplique, arquive. Funciona como um app de mensagens, e os seus bots aparecem como contatos."
          atraso={0.16}
        >
          <MockConversas />
        </Bloco>
        <Bloco
          titulo="Aprovação pelo WhatsApp"
          texto="Quando um bot precisa do seu sim, chega uma mensagem curta no seu WhatsApp. Responda com um número, de onde estiver."
        >
          <MockWhatsApp />
        </Bloco>
        <Bloco
          titulo="Automações a partir de uma frase"
          texto="Diga “toda sexta às 11h, me mande o relatório” e está agendado. Também por webhook ou quando algo acontece no Gmail, no Slack ou no HubSpot."
          atraso={0.08}
        >
          <MockAgenda />
        </Bloco>
        <Bloco
          titulo="Suas empresas como andares"
          texto="Cada empresa vira um andar do Prédio, com bots, verba de IA e regras próprias. Na cobertura, a Sala do conselho guarda as suas decisões."
          atraso={0.16}
        >
          <MockPredio />
        </Bloco>
      </div>
      <p className="mt-6 text-center text-sm text-cinza">
        {equipe.length} bots de exemplo nas ilustrações. Os nomes de IAs e apps são marcas dos seus donos.
      </p>
    </Secao>
  );
}
