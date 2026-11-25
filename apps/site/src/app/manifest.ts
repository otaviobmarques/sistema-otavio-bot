import type { MetadataRoute } from 'next';
import { site } from '@/config/site';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.nome,
    short_name: site.nome,
    description: site.descricao,
    lang: 'pt-BR',
    start_url: '/',
    display: 'standalone',
    background_color: '#050817',
    theme_color: '#050817',
    icons: [
      { src: '/gerado/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/gerado/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
