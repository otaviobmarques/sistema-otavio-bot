import type { Metadata } from 'next';
import { PaginaLegal } from '@/components/PaginaLegal';
import { lerDocumento } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Política de Cookies | ArkoBot',
  description: 'Quais cookies e tecnologias semelhantes o site e o app do ArkoBot usam.',
  alternates: { canonical: '/cookies/' },
};

export default async function Cookies() {
  return <PaginaLegal doc={await lerDocumento('politica-de-cookies.md')} atual="/cookies/" />;
}
