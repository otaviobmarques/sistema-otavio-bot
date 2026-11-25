import type { Metadata } from 'next';
import { PaginaLegal } from '@/components/PaginaLegal';
import { lerDocumento } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Termos de Uso | ArkoBot',
  description: 'Termos de Uso do ArkoBot, oferecido pela Domma Tecnologia e Desenvolvimento de Softwares Ltda.',
  alternates: { canonical: '/termos/' },
};

export default async function Termos() {
  return <PaginaLegal doc={await lerDocumento('termos-de-uso.md')} atual="/termos/" />;
}
