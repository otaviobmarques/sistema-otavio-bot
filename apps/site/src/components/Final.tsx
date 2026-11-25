import { Mail, MessageCircle } from 'lucide-react';
import { contato, temCanalConfigurado } from '@/config/contato';
import { site } from '@/config/site';
import { Logo } from './Logo';
import { BotaoContato, Revelar } from './ui';

function Canais() {
  if (!temCanalConfigurado()) {
    return (
      <p className="mt-6 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-5 py-4 text-sm text-suave">
        Os canais de atendimento do ArkoBot serão publicados aqui em breve.
      </p>
    );
  }
  const digitos = contato.whatsapp.replace(/\D/g, '');
  return (
    <ul className="mt-6 flex flex-wrap gap-3 text-sm">
      {digitos && (
        <li>
          <a
            href={`https://wa.me/${digitos}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-white hover:border-ciano/50"
          >
            <MessageCircle className="h-4 w-4 text-ciano" aria-hidden /> WhatsApp
          </a>
        </li>
      )}
      {contato.email && (
        <li>
          <a
            href={`mailto:${contato.email}`}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-white hover:border-ciano/50"
          >
            <Mail className="h-4 w-4 text-ciano" aria-hidden /> {contato.email}
          </a>
        </li>
      )}
    </ul>
  );
}

export function Final() {
  return (
    <section id="contato" aria-labelledby="contato-titulo" className="relative overflow-hidden py-24 sm:py-32">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_50%_100%,rgba(0,232,248,0.16),transparent)]" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="borda-brilho grid items-center gap-10 rounded-[2rem] bg-noite-2/80 p-6 sm:p-10 lg:grid-cols-2 lg:p-14">
          <Revelar>
            <h2 id="contato-titulo" className="font-display text-3xl font-bold leading-tight text-white sm:text-5xl">
              Coloque a sua equipe de bots <span className="texto-gradiente">para trabalhar</span>
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-suave">
              Conte o que a sua empresa faz e o que toma o tempo da sua equipe. A gente ajuda a montar os primeiros bots.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <BotaoContato>Começar</BotaoContato>
              <BotaoContato variante="secundario">Falar com a gente</BotaoContato>
            </div>
            <Canais />
          </Revelar>
          <Revelar atraso={0.15}>
            <figure>
              <video
                className="aspect-video w-full rounded-2xl border border-white/10 bg-noite shadow-2xl shadow-black/60"
                src="/gerado/arkobot.mp4"
                poster="/gerado/arkobot-poster.webp"
                controls
                preload="none"
                playsInline
                aria-label="Vídeo de abertura do ArkoBot"
              />
              <figcaption className="mt-3 text-center text-xs text-suave">A abertura do app ArkoBot (com som).</figcaption>
            </figure>
          </Revelar>
        </div>
      </div>
    </section>
  );
}

export function Rodape() {
  const ano = new Date().getFullYear();
  return (
    <footer className="border-t border-white/10 py-12">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 text-center sm:px-6 md:flex-row md:justify-between md:text-left lg:px-8">
        <div>
          <Logo className="h-7 text-base" />
          <p className="mt-3 text-sm text-suave">
            {site.nome} é um produto {site.empresa}.
          </p>
        </div>
        <p className="text-xs text-suave/80">
          © {ano} {site.empresa}. Claude, ChatGPT, Gemini e os demais nomes de IA citados são marcas dos seus donos.
        </p>
      </div>
    </footer>
  );
}
