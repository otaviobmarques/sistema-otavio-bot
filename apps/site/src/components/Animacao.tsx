'use client';

import { useEffect, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { useReducedMotion } from 'motion/react';
import { CONVERSA_CELULAR, CONVERSA_DESKTOP, ConversaCelular, ConversaDesktop } from '@/remotion/Conversa';

export const COMPOSICOES = {
  desktop: { componente: ConversaDesktop, ...CONVERSA_DESKTOP },
  celular: { componente: ConversaCelular, ...CONVERSA_CELULAR },
};

const QUADRO_PARADO = 470;

type Props = { variante: keyof typeof COMPOSICOES; rotulo: string; className?: string };

export default function Animacao({ variante, rotulo, className }: Props) {
  const c = COMPOSICOES[variante];
  const reduzir = useReducedMotion();
  const caixa = useRef<HTMLDivElement>(null);
  const player = useRef<PlayerRef>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const observador = new IntersectionObserver(([entrada]) => setVisivel(entrada.isIntersecting), { rootMargin: '120px' });
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    const p = player.current;
    if (!p) return;
    if (reduzir) {
      p.pause();
      p.seekTo(QUADRO_PARADO);
    } else if (visivel) p.play();
    else p.pause();
  }, [visivel, reduzir]);

  return (
    <div ref={caixa} role="img" aria-label={rotulo} className={className} style={{ aspectRatio: `${c.largura} / ${c.altura}` }}>
      <Player
        ref={player}
        component={c.componente}
        durationInFrames={c.duracao}
        fps={c.fps}
        compositionWidth={c.largura}
        compositionHeight={c.altura}
        loop
        autoPlay={reduzir === false}
        initialFrame={reduzir ? QUADRO_PARADO : 0}
        controls={false}
        clickToPlay={false}
        doubleClickToFullscreen={false}
        spaceKeyToPlayOrPause={false}
        initiallyMuted
        acknowledgeRemotionLicense
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
