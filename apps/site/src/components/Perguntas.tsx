import { Plus } from 'lucide-react';
import { CabecalhoSecao, Secao } from './ui';

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
    r: 'O valor do plano é fixo e já inclui créditos de IA todo mês (1 crédito = R$ 0,01 de uso de IA). Cada empresa tem uma verba: você recebe aviso a 80% e a 100%, e os bots pausam quando ela acaba, até você liberar.',
  },
  {
    p: 'Posso usar a minha assinatura do ChatGPT ou do Claude?',
    r: 'Sim. Os planos já vêm com IA pronta para usar, mas você pode conectar a sua própria conta (ChatGPT/Codex, Claude, Gemini, Grok, Kimi, Copilot e outras) ou uma chave de API. O uso dessa conta não consome os créditos do seu plano; as cobranças e os limites do seu provedor continuam valendo.',
  },
  {
    p: 'Quais IAs estão inclusas?',
    r: 'ChatGPT, Claude, Gemini, Grok, Kimi, DeepSeek, Mistral, Qwen, MiniMax, Meta e modelos Nemotron da NVIDIA, entre outras. Cada bot pode usar uma IA diferente, e você troca quando quiser.',
  },
  {
    p: 'O que é o computador individual de um bot?',
    r: 'É uma máquina (VPS) só daquele bot, com desktop próprio. Ele navega, usa programas e trabalha nela, e você vê a tela ao vivo e pode assumir o controle. O Profissional inclui 1 e o Empresa inclui 2; você pode dar um a qualquer bot por R$ 159 por mês.',
  },
  {
    p: 'Preciso saber programar?',
    r: 'Não. Você conversa com os bots em português, pelo app no computador ou no celular, como faria com um colega.',
  },
  {
    p: 'Funciona com o meu computador desligado?',
    r: 'Sim. O ArkoBot roda 24 horas na nuvem: os bots, as conversas e as rotinas continuam trabalhando, e o app do PC e do celular são janelas para eles.',
  },
  {
    p: 'Tem fidelidade? E se eu me arrepender?',
    r: 'Não tem fidelidade: você cancela quando quiser. E, se contratar pelo site, pode desistir em até 7 dias e receber o seu dinheiro de volta, como garante o Código de Defesa do Consumidor.',
  },
];

export function Perguntas() {
  return (
    <Secao id="perguntas" rotulada="perguntas-titulo">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <CabecalhoSecao id="perguntas-titulo" titulo="Perguntas frequentes" texto="O que os donos de empresa costumam perguntar antes de começar." />
        <div className="border-t border-linha">
          {PERGUNTAS.map((item) => (
            <details key={item.p} className="group border-b border-linha">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-[17px] font-medium text-tinta [&::-webkit-details-marker]:hidden">
                {item.p}
                <Plus className="h-5 w-5 shrink-0 text-cinza transition-transform duration-300 group-open:rotate-45" aria-hidden />
              </summary>
              <p className="pb-5 leading-relaxed text-cinza">{item.r}</p>
            </details>
          ))}
        </div>
      </div>
    </Secao>
  );
}
