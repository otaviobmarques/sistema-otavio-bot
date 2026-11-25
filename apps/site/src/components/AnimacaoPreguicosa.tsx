'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const Animacao = dynamic(() => import('./Animacao'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-white/[0.03]" />,
});

const ROTULO =
  'Animação de uma conversa no ArkoBot: você pede a campanha de Black Friday, o bot Léo divide o trabalho, Nina entrega uma pesquisa em PDF, Duda mostra três imagens de post, Ana pede aprovação para enviar um e-mail e Beto informa o custo de IA.';

function useCelular() {
  const [celular, setCelular] = useState<boolean | null>(null);
  useEffect(() => {
    const consulta = window.matchMedia('(max-width: 767px)');
    const atualizar = () => setCelular(consulta.matches);
    atualizar();
    consulta.addEventListener('change', atualizar);
    return () => consulta.removeEventListener('change', atualizar);
  }, []);
  return celular;
}

export function ConversaAnimada({ className }: { className?: string }) {
  const celular = useCelular();
  return (
    <div className={`aspect-[390/780] md:aspect-[1280/800] ${className ?? ''}`}>
      {celular !== null && <Animacao variante={celular ? 'celular' : 'desktop'} rotulo={ROTULO} className="h-full w-full" />}
    </div>
  );
}
