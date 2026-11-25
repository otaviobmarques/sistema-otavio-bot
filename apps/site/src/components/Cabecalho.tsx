'use client';

import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { navegacao } from '@/config/site';
import { Logo } from './Logo';
import { BotaoContato } from './ui';

export function Cabecalho() {
  const [rolou, setRolou] = useState(false);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    const aoRolar = () => setRolou(window.scrollY > 12);
    aoRolar();
    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => window.removeEventListener('scroll', aoRolar);
  }, []);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        rolou || aberto ? 'border-b border-white/10 bg-noite/80 backdrop-blur-xl' : 'border-b border-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:h-18 lg:px-8">
        <a href="#inicio" className="h-8 text-lg" aria-label="ArkoBot, voltar ao início">
          <Logo className="h-8" />
        </a>
        <nav aria-label="Principal" className="ml-auto hidden items-center gap-1 lg:flex">
          {navegacao.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-full px-3.5 py-2 text-sm font-medium text-suave transition hover:bg-white/5 hover:text-white"
            >
              {item.rotulo}
            </a>
          ))}
        </nav>
        <BotaoContato acao="assinar" className="!hidden !px-5 !py-2.5 !text-sm lg:!inline-flex">Começar agora</BotaoContato>
        <button
          type="button"
          className="ml-auto grid h-10 w-10 place-items-center rounded-full border border-white/10 text-white lg:hidden"
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
            className="overflow-hidden border-t border-white/10 lg:hidden"
          >
            <div className="flex flex-col gap-1 px-4 py-4">
              {navegacao.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setAberto(false)}
                  className="rounded-xl px-4 py-3 text-base font-medium text-texto hover:bg-white/5"
                >
                  {item.rotulo}
                </a>
              ))}
              <BotaoContato acao="assinar" className="mt-2">Começar agora</BotaoContato>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
