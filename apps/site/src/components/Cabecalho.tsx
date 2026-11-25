'use client';

import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { navegacao } from '@/config/site';
import { contato } from '@/config/contato';
import { Logo } from './Logo';
import { BotaoContato } from './ui';

export function Cabecalho() {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-linha bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <a href="#inicio" className="h-7 text-base" aria-label="ArkoBot, voltar ao início">
          <Logo className="h-7" />
        </a>
        <nav aria-label="Principal" className="ml-2 hidden items-center gap-1 lg:flex">
          {navegacao.map((item) => (
            <a key={item.href} href={item.href} className="whitespace-nowrap rounded-full px-3 py-2 text-[15px] text-cinza transition hover:text-tinta">
              {item.rotulo}
            </a>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <a href={contato.urlEntrar} className="whitespace-nowrap rounded-full px-3 py-2 text-[15px] font-medium text-tinta transition hover:text-azul">
            Entrar
          </a>
          <BotaoContato variante="secundario" className="!hidden whitespace-nowrap !px-4 !py-2 !text-sm xl:!inline-flex">
            Falar com um especialista
          </BotaoContato>
          <BotaoContato acao="assinar" className="whitespace-nowrap !px-4 !py-2 !text-sm" seta={false}>
            Começar agora
          </BotaoContato>
        </div>
        <button
          type="button"
          className="ml-auto grid h-10 w-10 place-items-center rounded-full border border-linha text-tinta lg:hidden"
          aria-expanded={aberto}
          aria-controls="menu-celular"
          aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
          onClick={() => setAberto((v) => !v)}
        >
          {aberto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      <AnimatePresence>
        {aberto && (
          <motion.nav
            id="menu-celular"
            aria-label="Menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-t border-linha bg-white lg:hidden"
          >
            <div className="flex flex-col gap-1 px-4 py-4">
              {navegacao.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setAberto(false)}
                  className="rounded-xl px-4 py-3 text-base text-tinta hover:bg-cartao"
                >
                  {item.rotulo}
                </a>
              ))}
              <BotaoContato acao="assinar" className="mt-2">
                Começar agora
              </BotaoContato>
              <BotaoContato variante="secundario">Falar com um especialista</BotaoContato>
              <a href={contato.urlEntrar} className="mt-1 rounded-xl px-4 py-3 text-center text-base font-medium text-tinta hover:bg-cartao">
                Já sou cliente: entrar
              </a>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
