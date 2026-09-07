import type { Metadata, Viewport } from 'next';
import { Fraunces, Manrope } from 'next/font/google';
import './globals.css';
import { BootNuvem } from '@/components/BootNuvem';
import { AvisoCritico } from '@/components/AvisoCritico';
import { GovernancaContexto } from '@/components/GovernancaContexto';
import { GovernancaSnapshotResponder } from '@/components/GovernancaSnapshotResponder';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Tatá House — Refeitório do Tatá Sushi',
  description:
    'Tatá House: planejamento do cardápio do refeitório, cotação, lista de compras, estoque e custo por refeição.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Tatá House',
  },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Não limitamos maximumScale — o usuário tem o direito de dar zoom (WCAG 1.4.4).
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#15171b' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${manrope.variable} ${fraunces.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('tema');if(t==='escuro'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body className="font-sans">
        <GovernancaContexto />
        <GovernancaSnapshotResponder />
        <BootNuvem />
        <AvisoCritico />
        {children}
      </body>
    </html>
  );
}
