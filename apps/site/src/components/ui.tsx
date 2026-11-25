'use client';

import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { canalPrincipal } from '@/config/contato';

type RevelarProps = {
  children: React.ReactNode;
  className?: string;
  atraso?: number;
  y?: number;
  as?: 'div' | 'li' | 'article';
};

export function Revelar({ children, className, atraso = 0, y = 28, as = 'div' }: RevelarProps) {
  const Componente = motion[as];
  return (
    <Componente
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, delay: atraso, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Componente>
  );
}

export function Selo({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-ciano/30 bg-ciano/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-ciano">
      <span className="h-1.5 w-1.5 animate-pulso rounded-full bg-ciano" aria-hidden />
      {children}
    </span>
  );
}

type CabecalhoProps = { selo: string; titulo: React.ReactNode; texto?: React.ReactNode; centro?: boolean; id?: string };

export function CabecalhoSecao({ selo, titulo, texto, centro = true, id }: CabecalhoProps) {
  return (
    <Revelar className={centro ? 'mx-auto max-w-3xl text-center' : 'max-w-2xl'}>
      <Selo>{selo}</Selo>
      <h2 id={id} className="mt-5 font-display text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
        {titulo}
      </h2>
      {texto && <p className="mt-5 text-base leading-relaxed text-suave sm:text-lg">{texto}</p>}
    </Revelar>
  );
}

type BotaoProps = { children: React.ReactNode; variante?: 'primario' | 'secundario'; href?: string; className?: string };

export function BotaoContato({ children, variante = 'primario', href, className = '' }: BotaoProps) {
  const canal = canalPrincipal();
  const destino = href ?? canal.href;
  const externo = !href && canal.externo;
  const base =
    'group inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold transition duration-300 sm:text-base';
  const estilo =
    variante === 'primario'
      ? 'bg-ciano text-noite shadow-[0_0_0_0_rgba(0,232,248,0.5)] hover:-translate-y-0.5 hover:shadow-[0_10px_40px_-8px_rgba(0,232,248,0.7)]'
      : 'border border-white/15 bg-white/5 text-white hover:-translate-y-0.5 hover:border-ciano/50 hover:bg-white/10';
  return (
    <a
      href={destino}
      className={`${base} ${estilo} ${className}`}
      {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
      {variante === 'primario' && (
        <ArrowRight aria-hidden className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
      )}
    </a>
  );
}
