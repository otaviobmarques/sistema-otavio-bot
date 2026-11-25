import type { Metadata } from 'next';
import { PaginaLegal } from '@/components/PaginaLegal';

export const metadata: Metadata = { title: 'Termos de uso | ArkoBot', alternates: { canonical: '/termos/' } };

export default function Termos() {
  return (
    <PaginaLegal titulo="Termos de uso">
      <p>Os termos de uso do ArkoBot estão sendo preparados pela Domma Tecnologia e serão publicados nesta página.</p>
      <p>
        Enquanto isso, se tiver qualquer dúvida sobre a contratação, fale com a gente pelos canais da{' '}
        <a href="/#contato" className="text-ciano-texto underline">
          página de contato
        </a>
        .
      </p>
    </PaginaLegal>
  );
}
