'use client';

import { useEffect, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { useReducedMotion } from 'motion/react';
import { EQUIPE, EquipeTrabalhando } from '@/remotion/EquipeTrabalhando';
import { CONEXOES, IAsConectando } from '@/remotion/IAsConectando';

const COMPOSICOES = {
  equipe: { componente: EquipeTrabalhando, ...EQUIPE, quadroParado: 200 },
  ias: { componente: IAsConectando, ...CONEXOES, quadroParado: 40 },
};

type Props = { tipo: keyof typeof COMPOSICOES; rotulo: string; className?: string };

export default function Animacao({ tipo, rotulo, className }: Props) {
  const c = COMPOSICOES[tipo];
  const reduzir = useReducedMotion();
  const caixa = useRef<HTMLDivElement>(null);
  const player = useRef<PlayerRef>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const observador = new IntersectionObserver(([entrada]) => setVisivel(entrada.isIntersecting), {
      rootMargin: '120px',
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    const p = player.current;
    if (!p) return;
    if (reduzir) {
      p.pause();
      p.seekTo(c.quadroParado);
    } else if (visivel) p.play();
    else p.pause();
  }, [visivel, reduzir, c.quadroParado]);

  return (
    <div
      ref={caixa}
      role="img"
      aria-label={rotulo}
      className={className}
      style={{ aspectRatio: `${c.largura} / ${c.altura}` }}
    >
      <Player
        ref={player}
        component={c.componente}
        durationInFrames={c.duracao}
        fps={c.fps}
        compositionWidth={c.largura}
        compositionHeight={c.altura}
        initialFrame={reduzir ? c.quadroParado : 0}
        loop
        controls={false}
        clickToPlay={false}
        doubleClickToFullscreen={false}
        spaceKeyToPlayOrPause={false}
        acknowledgeRemotionLicense
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
