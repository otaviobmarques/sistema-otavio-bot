import { Plus } from 'lucide-react';
import { CabecalhoSecao, Revelar } from './ui';

const PERGUNTAS = [
  {
    p: 'O que é o ArkoBot?',
    r: 'Uma equipe de bots de IA que trabalha para a sua empresa. Cada bot tem nome, função, memória e pode ter um computador próprio. Você conversa com eles como com colegas, e eles pedem a sua aprovação antes de ações sensíveis.',
  },
  {
    p: 'Preciso saber programar?',
    r: 'Não. Você passa as tarefas em português, pelo app no computador ou no celular, e aprova os pedidos com um clique ou respondendo um número no WhatsApp.',
  },
  {
    p: 'Quais IAs posso usar?',
    r: 'Claude, ChatGPT (Codex), Gemini, Grok, DeepSeek, Mistral, Kimi, Qwen, GitHub Copilot, Cursor e outras, além de modelos abertos rodando no seu servidor, como pelo Ollama ou pelo LM Studio. Cada bot pode usar uma IA diferente.',
  },
  {
    p: 'O que é o computador de cada bot?',
    r: 'É um desktop Linux só daquele bot, na nuvem ou num servidor seu. O bot navega, usa programas e trabalha nele. Você vê a tela ao vivo no app e pode assumir o controle quando quiser.',
  },
  {
    p: 'Os bots podem fazer algo sem eu saber?',
    r: 'Ações sensíveis, como enviar algo em seu nome, passam por aprovação. Cada empresa tem as suas regras de aprovação e uma verba de IA no mês: você recebe aviso a 80% e a 100%, e os bots pausam quando a verba acaba.',
  },
  {
    p: 'Funciona com o meu computador desligado?',
    r: 'Sim, quando o ArkoBot roda num servidor. Os bots, as conversas e as rotinas ficam lá, e o app do PC e do celular viram janelas para ele.',
  },
  {
    p: 'Quanto custa?',
    r: 'Os planos são por consumo, com créditos de IA inclusos, e você pode contratar computadores adicionais para os bots. Os preços ainda estão sendo definidos. Fale com a gente para saber primeiro.',
  },
];

export function Perguntas() {
  return (
    <section id="perguntas" aria-labelledby="perguntas-titulo" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <CabecalhoSecao id="perguntas-titulo" selo="Perguntas" titulo="Perguntas frequentes" />
        <div className="mt-12 space-y-3">
          {PERGUNTAS.map((item, i) => (
            <Revelar key={item.p} atraso={i * 0.04}>
              <details className="group rounded-2xl border border-white/10 bg-white/[0.03] transition-colors open:border-ciano/30 open:bg-white/[0.05]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-left font-semibold text-white [&::-webkit-details-marker]:hidden">
                  {item.p}
                  <Plus
                    className="h-5 w-5 shrink-0 text-ciano transition-transform duration-300 group-open:rotate-45"
                    aria-hidden
                  />
                </summary>
                <p className="px-5 pb-5 leading-relaxed text-suave">{item.r}</p>
              </details>
            </Revelar>
          ))}
        </div>
      </div>
    </section>
  );
}
