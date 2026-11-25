import type { Metadata } from 'next';
import { PaginaLegal } from '@/components/PaginaLegal';
import { garantia } from '@/config/planos';

export const metadata: Metadata = { title: 'Política de privacidade | ArkoBot', alternates: { canonical: '/privacidade/' } };

export default function Privacidade() {
  return (
    <PaginaLegal titulo="Política de privacidade">
      <p>
        A política de privacidade do ArkoBot, de acordo com a Lei Geral de Proteção de Dados (LGPD), está sendo preparada pela Domma
        Tecnologia e será publicada nesta página.
      </p>
      <p>Este site não usa cookies de análise nem de publicidade.</p>
      <h2 id="arrependimento" className="pt-4 text-xl font-semibold text-tinta">
        Direito de arrependimento
      </h2>
      <p>{garantia}</p>
    </PaginaLegal>
  );
}
