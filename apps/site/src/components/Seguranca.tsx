import { LockKeyhole, ShieldCheck, Wallet } from 'lucide-react';
import { botPorId } from '@/config/equipe';
import { AvatarBot } from './AvatarBot';
import { CabecalhoSecao, Revelar, Secao } from './ui';

function IlustraDados() {
  return (
    <div className="flex items-center justify-center gap-3">
      {['ana', 'beto', 'caio'].map((id) => (
        <div key={id} className="flex flex-col items-center gap-2 rounded-xl border border-linha bg-white p-2.5">
          <AvatarBot bot={botPorId(id)} className="h-8 w-8" />
          <span className="h-1.5 w-10 rounded-full bg-linha" />
          <span className="h-1.5 w-7 rounded-full bg-linha" />
        </div>
      ))}
    </div>
  );
}

function IlustraAprovacao() {
  return (
    <div className="mx-auto w-full max-w-[15rem] rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
      <div className="text-xs font-semibold text-amber-800">PRECISA DA SUA APROVAÇÃO</div>
      <div className="mt-1 font-semibold text-tinta">Enviar em seu nome?</div>
      <div className="mt-2 flex gap-2">
        <span className="rounded-full bg-tinta px-3 py-1 text-xs font-semibold text-white">Aprovar</span>
        <span className="rounded-full border border-linha bg-white px-3 py-1 text-xs text-tinta">Recusar</span>
      </div>
    </div>
  );
}

function IlustraCusto() {
  return (
    <div className="mx-auto w-full max-w-[15rem] rounded-xl border border-linha bg-white p-3 text-sm">
      <div className="flex justify-between text-xs text-cinza">
        <span>Verba da Loja Online</span>
        <span className="font-semibold text-tinta">80%</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-linha">
        <div className="h-full w-4/5 rounded-full bg-gradient-to-r from-ciano-forte to-amber-400" />
      </div>
      <div className="mt-2 text-xs text-amber-700">Aviso enviado: 80% da verba usada</div>
    </div>
  );
}

const CARTOES = [
  {
    icone: LockKeyhole,
    titulo: 'Seus bots, seus dados',
    texto:
      'Cada empresa tem o seu espaço, e cada bot trabalha no próprio computador, sem misturar arquivos e logins. Senhas e chaves aparecem mascaradas nas prévias.',
    ilustra: <IlustraDados />,
  },
  {
    icone: ShieldCheck,
    titulo: 'Você aprova o que importa',
    texto:
      'Enviar em seu nome, gastar ou mexer no que é sensível passa pelo seu sim, no app ou no WhatsApp. Cada decisão fica registrada na atividade.',
    ilustra: <IlustraAprovacao />,
  },
  {
    icone: Wallet,
    titulo: 'Custo previsível',
    texto:
      'Créditos de IA inclusos no plano e uma verba por empresa. Aviso a 80% e a 100%, e os bots pausam quando a verba acaba, até você liberar.',
    ilustra: <IlustraCusto />,
  },
];

export function Seguranca() {
  return (
    <Secao id="seguranca" rotulada="seguranca-titulo">
      <CabecalhoSecao
        id="seguranca-titulo"
        titulo="E se a IA errar? Ela não age sozinha no que importa."
        texto="Você decide o que cada bot faz sozinho e o que espera por você. E sabe quanto vai gastar antes de gastar."
      />
      <div className="mt-12 grid gap-8 md:grid-cols-3">
        {CARTOES.map((c, i) => (
          <Revelar key={c.titulo} atraso={i * 0.08} as="article">
            <div className="flex h-48 items-center rounded-3xl border border-linha bg-cartao p-5">{c.ilustra}</div>
            <h3 className="mt-5 flex items-center gap-2 text-lg font-semibold text-tinta">
              <c.icone className="h-5 w-5 text-ciano-forte" aria-hidden />
              {c.titulo}
            </h3>
            <p className="mt-2 leading-relaxed text-cinza">{c.texto}</p>
          </Revelar>
        ))}
      </div>
    </Secao>
  );
}
