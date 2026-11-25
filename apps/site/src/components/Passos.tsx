import { Check } from 'lucide-react';
import { botPorId } from '@/config/equipe';
import { AvatarBot } from './AvatarBot';
import { LogoIntegracao, servicos } from './Integracoes';
import { CabecalhoSecao, Revelar, Secao } from './ui';

function Cartaozinho({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-2xl border border-linha bg-cartao p-4">
      <div className="w-full max-w-[15rem] rounded-xl border border-linha bg-white p-3 text-sm shadow-[0_10px_30px_-18px_rgba(11,18,48,0.45)]">
        {children}
      </div>
    </div>
  );
}

function UiPlano() {
  return (
    <Cartaozinho>
      <div className="flex items-center justify-between">
        <span className="font-semibold text-tinta">Profissional</span>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Ativo</span>
      </div>
      <div className="mt-1 text-cinza">R$ 599/mês · 20.000 créditos</div>
      <div className="mt-3 h-1.5 rounded-full bg-linha">
        <div className="h-full w-1/5 rounded-full bg-ciano-forte" />
      </div>
    </Cartaozinho>
  );
}

function UiBot() {
  const ana = botPorId('ana');
  return (
    <Cartaozinho>
      <div className="flex items-center gap-3">
        <AvatarBot bot={ana} className="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-tinta">Ana</div>
          <div className="whitespace-nowrap text-xs text-cinza">Vendas · Claude</div>
        </div>
        <span className="rounded-full bg-tinta px-2.5 py-1 text-xs font-semibold text-white">Criar</span>
      </div>
    </Cartaozinho>
  );
}

function UiApps() {
  const lista = servicos.filter((s) => ['whatsapp', 'gmail', 'hubspot'].includes(s.id));
  return (
    <Cartaozinho>
      <ul className="space-y-2">
        {lista.map((s) => (
          <li key={s.id} className="flex items-center gap-2.5">
            <LogoIntegracao item={s} tamanho={18} />
            <span className="flex-1 text-tinta">{s.nome}</span>
            <Check className="h-4 w-4 text-emerald-600" aria-hidden />
          </li>
        ))}
      </ul>
    </Cartaozinho>
  );
}

function UiTarefa() {
  const ana = botPorId('ana');
  return (
    <Cartaozinho>
      <div className="ml-auto w-fit rounded-2xl rounded-br-md bg-tinta px-3 py-1.5 text-xs text-white">Responda os orçamentos de ontem</div>
      <div className="mt-2 flex items-start gap-2">
        <AvatarBot bot={ana} className="h-6 w-6 shrink-0" />
        <div className="rounded-2xl rounded-tl-md bg-cartao px-3 py-1.5 text-xs text-tinta">Feito: 7 respondidos, 2 esperam o seu sim.</div>
      </div>
    </Cartaozinho>
  );
}

const PASSOS = [
  { titulo: 'Escolha o seu plano', texto: 'Assine pelo site. Os créditos de IA já vêm no plano, e você pode cancelar quando quiser.', ui: <UiPlano /> },
  {
    titulo: 'Crie o primeiro bot',
    texto: 'Dê um nome, uma função e a IA que ele vai usar. Comece com um bot só e cresça depois.',
    ui: <UiBot />,
  },
  {
    titulo: 'Conecte WhatsApp e apps',
    texto: 'Ligue o WhatsApp para aprovar de onde estiver e conecte Gmail, HubSpot e os apps que a sua equipe usa.',
    ui: <UiApps />,
  },
  {
    titulo: 'Mande a primeira tarefa',
    texto: 'Peça algo pequeno e útil, como responder orçamentos ou planejar o dia, e veja o resultado.',
    ui: <UiTarefa />,
  },
];

export function Passos() {
  return (
    <Secao id="como-comecar" rotulada="passos-titulo">
      <CabecalhoSecao
        id="passos-titulo"
        titulo="Do cadastro à primeira tarefa útil."
        texto="Comece com um bot e uma tarefa. Os computadores, os apps e as automações entram quando você quiser."
      />
      <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        {PASSOS.map((p, i) => (
          <Revelar key={p.titulo} as="li" atraso={i * 0.08}>
            {p.ui}
            <div className="mt-5 flex items-center gap-3">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-tinta text-sm font-semibold text-white">{i + 1}</span>
              <h3 className="text-lg font-semibold text-tinta">{p.titulo}</h3>
            </div>
            <p className="mt-2 leading-relaxed text-cinza">{p.texto}</p>
          </Revelar>
        ))}
      </ol>
    </Secao>
  );
}
