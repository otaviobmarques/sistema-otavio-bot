import { Mail, MessageCircle } from 'lucide-react';
import { contato, temCanalConfigurado } from '@/config/contato';
import { equipe } from '@/config/equipe';
import { garantia } from '@/config/planos';
import { site } from '@/config/site';
import { AvatarBot } from './AvatarBot';
import { Logo } from './Logo';
import { BotaoContato, Revelar } from './ui';

function Canais() {
  if (!temCanalConfigurado()) {
    return <p className="mt-6 text-sm text-white/60">Os canais de atendimento do ArkoBot serão publicados aqui em breve.</p>;
  }
  const digitos = contato.whatsapp.replace(/\D/g, '');
  return (
    <ul className="mt-6 flex flex-wrap justify-center gap-3 text-sm">
      {digitos && (
        <li>
          <a href={`https://wa.me/${digitos}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-white hover:border-white/50">
            <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
          </a>
        </li>
      )}
      {contato.email && (
        <li>
          <a href={`mailto:${contato.email}`} className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-white hover:border-white/50">
            <Mail className="h-4 w-4" aria-hidden /> {contato.email}
          </a>
        </li>
      )}
    </ul>
  );
}

export function Final() {
  return (
    <section id="contato" aria-labelledby="contato-titulo" className="px-4 py-16 sm:px-6 sm:py-24">
      <Revelar className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-[2rem] bg-noite px-6 py-14 text-center sm:px-12 sm:py-20">
          <div aria-hidden className="absolute -top-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-ciano/25 blur-[100px]" />
          <div className="relative flex justify-center -space-x-3" aria-hidden>
            {equipe.map((b, i) => (
              <span key={b.id} className="rounded-[14px] ring-4 ring-noite" style={{ transform: `translateY(${i % 2 ? 6 : 0}px)` }}>
                <AvatarBot bot={b} className="h-12 w-12 sm:h-14 sm:w-14" />
              </span>
            ))}
          </div>
          <h2 id="contato-titulo" className="relative mt-8 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
            Conheça sua primeira equipe de bots
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-lg leading-relaxed text-white/70">
            Cada dia sem ajuda é mais um cliente esperando resposta. Comece hoje, a partir de R$ 159 por mês, sem fidelidade.
          </p>
          <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <BotaoContato acao="assinar" variante="claro">
              Começar agora
            </BotaoContato>
            <BotaoContato className="!border !border-white/25 !bg-transparent">Falar com um especialista</BotaoContato>
          </div>
          <p className="relative mt-5 text-sm text-white/60">{garantia}</p>
          <Canais />
        </div>
      </Revelar>
    </section>
  );
}

export function Rodape() {
  const ano = new Date().getFullYear();
  return (
    <footer className="border-t border-linha py-12">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <Logo className="h-7 text-base" />
          <p className="mt-3 text-sm text-cinza">
            {site.nome} é um produto {site.empresa}.
          </p>
        </div>
        <nav aria-label="Produto" className="text-sm">
          <p className="font-semibold text-tinta">Produto</p>
          <ul className="mt-3 space-y-2 text-cinza">
            <li><a href="#recursos" className="hover:text-tinta">Recursos</a></li>
            <li><a href="#trabalhos" className="hover:text-tinta">Trabalhos</a></li>
            <li><a href="#planos" className="hover:text-tinta">Planos</a></li>
            <li><a href="#perguntas" className="hover:text-tinta">Perguntas</a></li>
          </ul>
        </nav>
        <nav aria-label="Legal" className="text-sm">
          <p className="font-semibold text-tinta">Legal</p>
          <ul className="mt-3 space-y-2 text-cinza">
            <li><a href="/termos/" className="hover:text-tinta">Termos de uso</a></li>
            <li><a href="/privacidade/" className="hover:text-tinta">Política de privacidade</a></li>
            <li><a href="/privacidade/#arrependimento" className="hover:text-tinta">Direito de arrependimento</a></li>
          </ul>
        </nav>
      </div>
      <p className="mx-auto mt-10 max-w-6xl px-4 text-xs leading-relaxed text-cinza sm:px-6">
        © {ano} {site.empresa}. OpenAI, ChatGPT, Claude, Gemini, Grok, Kimi, DeepSeek, NVIDIA, WhatsApp e os demais nomes e logos
        citados são marcas dos seus donos e aparecem só para indicar integração. O ArkoBot não é afiliado nem patrocinado por eles.
      </p>
    </footer>
  );
}
