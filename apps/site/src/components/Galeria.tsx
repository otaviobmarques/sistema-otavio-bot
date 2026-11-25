import { CabecalhoSecao, Revelar } from './ui';

const TELAS = [
  {
    src: '/gerado/app-conversa.webp',
    largura: 600,
    altura: 210,
    alt: 'Conversa no app ArkoBot: o bot se apresenta como chefe de gabinete, que gerencia os outros bots e passa cada tarefa ao bot certo.',
    titulo: 'Converse com cada bot',
    texto: 'Mande a tarefa como mandaria para um colega. O bot responde, pergunta quando tem dúvida e repassa para quem sabe fazer.',
  },
  {
    src: '/gerado/app-predio.webp',
    largura: 1160,
    altura: 230,
    alt: 'Tela Prédio ArkoBot no app, com os modos Andares e Ao vivo, contadores de bots trabalhando e esperando você, e a Presidência na cobertura.',
    titulo: 'O Prédio, no app',
    texto: 'Os andares, os contadores e a Sala do conselho, com os seus bots de verdade.',
  },
  {
    src: '/gerado/app-configuracoes.webp',
    largura: 860,
    altura: 700,
    alt: 'Configurações do app ArkoBot, com as seções Geral, IA, Computador, Uso e cobrança, WhatsApp e Atualizações.',
    titulo: 'Tudo em português, no seu controle',
    texto: 'IA, computador dos bots, uso e cobrança, WhatsApp e atualizações num só lugar.',
  },
];

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-noite-2 shadow-2xl shadow-black/50 transition duration-500 group-hover:-translate-y-1 group-hover:border-ciano/40">
      <div className="flex items-center gap-1.5 border-b border-white/10 bg-white/[0.04] px-3 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
      </div>
      <div className="bg-[#fafafa]">{children}</div>
    </div>
  );
}

export function Galeria() {
  const [conversa, predio, config] = TELAS;
  const bloco = (t: (typeof TELAS)[number], atraso: number, className = '') => (
    <Revelar atraso={atraso} className={`group ${className}`}>
      <figure>
        <Moldura>
          <img src={t.src} width={t.largura} height={t.altura} alt={t.alt} loading="lazy" decoding="async" className="h-auto w-full" />
        </Moldura>
        <figcaption className="mt-4">
          <span className="block font-display text-lg font-bold text-white">{t.titulo}</span>
          <span className="mt-1 block text-sm leading-relaxed text-suave">{t.texto}</span>
        </figcaption>
      </figure>
    </Revelar>
  );

  return (
    <section id="app" aria-labelledby="app-titulo" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <CabecalhoSecao
          id="app-titulo"
          selo="Por dentro do app"
          titulo="Telas reais do ArkoBot"
          texto="Sem maquete: é assim que o app aparece hoje para quem usa."
        />
        <div className="mt-16 grid items-start gap-10 lg:grid-cols-2">
          <div className="space-y-10">
            {bloco(conversa, 0)}
            {bloco(predio, 0.1)}
          </div>
          {bloco(config, 0.15)}
        </div>
      </div>
    </section>
  );
}
