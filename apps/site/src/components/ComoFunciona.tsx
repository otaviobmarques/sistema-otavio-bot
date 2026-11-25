import { MessagesSquare, ShieldCheck, UsersRound } from 'lucide-react';
import { CabecalhoSecao, Revelar } from './ui';

const PASSOS = [
  {
    icone: UsersRound,
    titulo: 'Monte a sua equipe',
    texto:
      'Crie bots com nome, função, personalidade e a IA de cada um. Eles guardam memória do que aprendem e podem repassar trabalho entre si.',
  },
  {
    icone: MessagesSquare,
    titulo: 'Passe as tarefas',
    texto:
      'Converse como com um colega, pelo app no computador ou no celular. Agende rotinas, como um relatório toda segunda às 8h, e deixe o bot cuidar.',
  },
  {
    icone: ShieldCheck,
    titulo: 'Aprove o que importa',
    texto:
      'Antes de enviar algo em seu nome ou fazer algo sensível, o bot para e pergunta. Você responde no app ou pelo WhatsApp, com um número.',
  },
];

export function ComoFunciona() {
  return (
    <section id="como-funciona" aria-labelledby="como-titulo" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <CabecalhoSecao
          id="como-titulo"
          selo="Como funciona"
          titulo="Como contratar um colega, só que ele nunca cansa"
          texto="Você continua no comando. Os bots fazem o trabalho repetitivo e chamam você quando precisam de uma decisão."
        />
        <ol className="mt-16 grid gap-6 md:grid-cols-3">
          {PASSOS.map((p, i) => (
            <Revelar key={p.titulo} as="li" atraso={i * 0.12} className="relative">
              <div className="group h-full rounded-3xl border border-white/10 bg-white/[0.03] p-7 transition duration-300 hover:-translate-y-1 hover:border-ciano/40 hover:bg-white/[0.05]">
                <div className="flex items-center gap-4">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl border border-ciano/30 bg-noite text-ciano shadow-[0_0_30px_-6px_rgba(0,232,248,0.6)] transition group-hover:scale-110">
                    <p.icone className="h-6 w-6" aria-hidden />
                  </span>
                  <span className="font-display text-sm font-bold text-suave">Passo {i + 1}</span>
                </div>
                <h3 className="mt-6 font-display text-xl font-bold text-white">{p.titulo}</h3>
                <p className="mt-3 leading-relaxed text-suave">{p.texto}</p>
              </div>
            </Revelar>
          ))}
        </ol>
      </div>
    </section>
  );
}
