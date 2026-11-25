import type { Metadata, Viewport } from 'next';
import { Inter, Poppins } from 'next/font/google';
import { site } from '@/config/site';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--fonte-inter', display: 'swap' });
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--fonte-poppins',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: site.titulo,
  description: site.descricao,
  applicationName: site.nome,
  alternates: { canonical: '/' },
  keywords: [
    'bots de IA',
    'agentes de IA',
    'automação para empresas',
    'IA para empresas',
    'Claude',
    'ChatGPT',
    'Gemini',
    'aprovação pelo WhatsApp',
    'computador na nuvem',
  ],
  authors: [{ name: site.empresa }],
  creator: site.empresa,
  publisher: site.empresa,
  icons: {
    icon: [{ url: '/gerado/favicon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/gerado/apple-touch-icon.png', sizes: '180x180' }],
  },
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: site.url,
    siteName: site.nome,
    title: site.titulo,
    description: site.descricao,
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'ArkoBot: uma equipe de bots de IA para a sua empresa' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: site.titulo,
    description: site.descricao,
    images: ['/og.png'],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
};

const dadosEstruturados = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: site.nome,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Windows, macOS, Linux, Web',
  description: site.descricao,
  url: site.url,
  inLanguage: 'pt-BR',
  publisher: { '@type': 'Organization', name: site.empresa },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${poppins.variable}`}>
      <body>
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-tinta focus:px-4 focus:py-2 focus:font-semibold focus:text-white"
        >
          Pular para o conteúdo
        </a>
        {children}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(dadosEstruturados) }} />
      </body>
    </html>
  );
}
