import { Plus } from 'lucide-react';
import { CabecalhoSecao, Revelar } from './ui';

const PERGUNTAS = [
  {
    p: 'E se a IA errar?',
    r: 'O que é sensível não acontece sem você. Antes de enviar algo em seu nome ou fazer o que as regras da empresa pedem para conferir, o bot para e pergunta, no app ou no seu WhatsApp. Você aprova ou recusa respondendo com um número.',
  },
  {
    p: 'É seguro? Os bots fazem coisas sem eu saber?',
    r: 'Você define, por empresa, o que cada bot pode fazer sozinho. Cada decisão fica registrada na atividade do app, inclusive as tomadas pelo WhatsApp, e só o número que você cadastrar pode aprovar.',
  },
  {
    p: 'Quanto vou gastar de verdade?',
    r: 'O valor do plano é fixo e já inclui créditos de IA todo mês (1 crédito = R$ 0,01 de uso de IA). Cada empresa tem uma verba: você recebe aviso a 80% e a 100%, e os bots pausam quando ela acaba, até você liberar. Sem surpresa na fatura.',
  },
  {
    p: 'Preciso saber programar?',
    r: 'Não. Você conversa com os bots em português, pelo app no computador ou no celular, como faria com um colega.',
  },
  {
    p: 'Quais IAs posso usar?',
    r: 'Claude, ChatGPT (Codex), Gemini, Grok, Kimi, DeepSeek, Mistral, Qwen, modelos da NVIDIA e da Meta pela OpenRouter, GitHub Copilot, Cursor e modelos abertos no seu servidor, pelo Ollama ou pelo LM Studio. Cada bot pode usar uma IA diferente.',
  },
  {
    p: 'O que é o computador individual de um bot?',
    r: 'É uma máquina (VPS) só daquele bot, com desktop próprio. Ele navega, usa programas e trabalha nela, e você vê a tela ao vivo e pode assumir o controle quando quiser. Os planos Profissional e Empresa incluem computadores, e você pode dar um a qualquer bot por R$ 159 por mês.',
  },
  {
    p: 'Funciona com o meu computador desligado?',
    r: 'Sim. Nos planos, o ArkoBot roda 24 horas na nuvem: os bots, as conversas e as rotinas continuam trabalhando, e o app do PC e do celular são janelas para eles.',
  },
  {
    p: 'Tem fidelidade? E se eu me arrepender?',
    r: 'Não tem fidelidade: você cancela quando quiser. E, se contratar pelo site, pode desistir em até 7 dias e receber o seu dinheiro de volta, como garante o Código de Defesa do Consumidor.',
  },
];

export function Perguntas() {
  return (
    <section id="perguntas" aria-labelledby="perguntas-titulo" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <CabecalhoSecao id="perguntas-titulo" selo="Perguntas" titulo="Antes de começar, você deve estar pensando" />
        <div className="mt-12 space-y-3">
          {PERGUNTAS.map((item, i) => (
            <Revelar key={item.p} atraso={i * 0.04}>
              <details className="group rounded-2xl border border-white/10 bg-white/[0.03] transition-colors open:border-ciano/30 open:bg-white/[0.05]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-left font-semibold text-white [&::-webkit-details-marker]:hidden">
                  {item.p}
                  <Plus className="h-5 w-5 shrink-0 text-ciano transition-transform duration-300 group-open:rotate-45" aria-hidden />
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
