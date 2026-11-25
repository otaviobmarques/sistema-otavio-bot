'use client';

import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { destinoDe, type Acao } from '@/config/contato';

type RevelarProps = {
  children: React.ReactNode;
  className?: string;
  atraso?: number;
  y?: number;
  as?: 'div' | 'li' | 'article';
};

export function Revelar({ children, className, atraso = 0, y = 24, as = 'div' }: RevelarProps) {
  const Componente = motion[as];
  return (
    <Componente
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay: atraso, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Componente>
  );
}

type CabecalhoProps = { titulo: React.ReactNode; texto?: React.ReactNode; centro?: boolean; id?: string; rotulo?: string };

export function CabecalhoSecao({ titulo, texto, centro = false, id, rotulo }: CabecalhoProps) {
  return (
    <Revelar className={centro ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}>
      {rotulo && <p className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-ciano-texto">{rotulo}</p>}
      <h2 id={id} className="text-3xl font-semibold leading-[1.1] tracking-tight text-tinta sm:text-[2.75rem]">
        {titulo}
      </h2>
      {texto && <p className="mt-4 text-base leading-relaxed text-cinza sm:text-lg">{texto}</p>}
    </Revelar>
  );
}

type BotaoProps = {
  children: React.ReactNode;
  variante?: 'primario' | 'secundario' | 'claro';
  acao?: Acao;
  href?: string;
  className?: string;
  seta?: boolean;
};

const ESTILOS = {
  primario: 'bg-tinta text-white hover:bg-noite hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-10px_rgba(11,18,48,0.6)]',
  secundario: 'border border-linha bg-white text-tinta hover:-translate-y-0.5 hover:border-tinta/30',
  claro: 'bg-white text-tinta hover:-translate-y-0.5',
};

export function BotaoContato({ children, variante = 'primario', acao = 'falar', href, className = '', seta }: BotaoProps) {
  const canal = destinoDe(acao);
  const destino = href ?? canal.href;
  const externo = !href && canal.externo;
  const mostraSeta = seta ?? variante === 'primario';
  return (
    <a
      href={destino}
      className={`group inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-[15px] font-medium transition duration-300 ${ESTILOS[variante]} ${className}`}
      {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
      {mostraSeta && <ArrowRight aria-hidden className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />}
    </a>
  );
}

export function Secao({
  id,
  rotulada,
  children,
  className = '',
  borda = true,
}: {
  id?: string;
  rotulada: string;
  children: React.ReactNode;
  className?: string;
  borda?: boolean;
}) {
  return (
    <section id={id} aria-labelledby={rotulada} className={`${borda ? 'border-t border-linha' : ''} py-20 sm:py-28 ${className}`}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">{children}</div>
    </section>
  );
}
