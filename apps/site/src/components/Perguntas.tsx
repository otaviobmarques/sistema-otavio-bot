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
    r: 'O valor do plano é fixo. Do Essencial em diante, ele já inclui créditos de IA todo mês (1 crédito = R$ 0,01 de uso de IA). Cada empresa tem uma verba: você recebe aviso a 80% e a 100%, e os bots pausam quando ela acaba, até você liberar. O Inicial (R$ 39) não tem créditos: usa a IA gratuita, com limite de cerca de 200 pedidos por dia.',
  },
  {
    p: 'Posso usar a minha assinatura do ChatGPT ou do Claude?',
    r: 'Sim. Os planos já vêm com IA pronta para usar (o Claude nos planos pagos, a IA gratuita no Inicial), mas você pode conectar a sua própria conta (ChatGPT/Codex, Claude, Gemini, Grok, Kimi, Copilot e outras) ou uma chave de API. O uso dessa conta não consome os créditos do seu plano; as cobranças e os limites do seu provedor continuam valendo.',
  },
  {
    p: 'Quais IAs estão inclusas?',
    r: 'Nos planos pagos (Essencial, Profissional e Empresa), os créditos usam hoje os modelos Claude, da Anthropic; GPT e Gemini chegam em breve. No Inicial, a IA gratuita usa modelos abertos e planos gratuitos de Groq, Google Gemini, NVIDIA e OpenRouter: tem limite de cerca de 200 pedidos por dia e pode ficar mais lenta ou fora do ar de vez em quando. Em qualquer plano, você pode conectar a sua própria conta de IA, e cada bot pode usar uma IA diferente.',
  },
  {
    p: 'O que é o computador individual de um bot?',
    r: 'É uma máquina (VPS) só daquele bot, com desktop próprio. Ele navega, usa programas e trabalha nela, e você vê a tela ao vivo e pode assumir o controle. O Profissional inclui 1 e o Empresa inclui 2; você pode dar um a qualquer bot, em qualquer plano, por R$ 159 por mês cada.',
  },
  {
    p: 'Preciso saber programar?',
    r: 'Não. Você conversa com os bots em português, pelo app no computador ou no celular, como faria com um colega.',
  },
  {
    p: 'Funciona com o meu computador desligado?',
    r: 'Sim. O seu ArkoBot roda nos nossos servidores, no seu próprio endereço (nome.arkobot.com.br), e você o abre pela área do cliente; o app do PC e do celular são janelas para ele. Nos planos pagos ele fica ligado 24 horas, com os bots e as rotinas trabalhando. No Inicial, ele fica em servidor compartilhado e dorme depois de 30 minutos sem uso; acorda quando você o abre.',
  },
  {
    p: 'Quanto espaço eu tenho para arquivos?',
    r: 'Inicial, 5 GB; Essencial, 20 GB; Profissional, 50 GB; Empresa, 100 GB. Avisamos por e-mail a 80% e a 100%; acima de 110%, novos arquivos são recusados até você liberar espaço ou mudar de plano. Nada é apagado automaticamente enquanto a assinatura estiver ativa.',
  },
  {
    p: 'Tem fidelidade? E se eu me arrepender?',
    r: 'Não tem fidelidade: você cancela quando quiser. No Inicial, são 7 dias grátis sem pedir cartão: cancele antes do fim do teste e nada é cobrado. E, se contratar pelo site, pode desistir em até 7 dias e receber o seu dinheiro de volta, como garante o Código de Defesa do Consumidor.',
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
