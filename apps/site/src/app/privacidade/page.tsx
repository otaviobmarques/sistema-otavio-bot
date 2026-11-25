import type { Metadata } from 'next';
import { PaginaLegal } from '@/components/PaginaLegal';
import { lerDocumento } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Política de Privacidade | ArkoBot',
  description: 'Como o ArkoBot trata dados pessoais, de acordo com a LGPD.',
  alternates: { canonical: '/privacidade/' },
};

export default async function Privacidade() {
  return <PaginaLegal doc={await lerDocumento('politica-de-privacidade.md')} atual="/privacidade/" />;
}
