'use client';

import dynamic from 'next/dynamic';

const Animacao = dynamic(() => import('./Animacao'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-[inherit] bg-white/[0.03]" />,
});

type Props = { tipo: 'equipe' | 'ias'; rotulo: string; proporcao: string; className?: string };

export function AnimacaoPreguicosa({ tipo, rotulo, proporcao, className }: Props) {
  return (
    <div className={className} style={{ aspectRatio: proporcao }}>
      <Animacao tipo={tipo} rotulo={rotulo} className="h-full w-full" />
    </div>
  );
}
