import type { Metadata } from 'next';

import { Syne, Unbounded } from 'next/font/google';
import localFont from 'next/font/local';

import './globals.css';
import { Providers } from './providers';

// Mixpanel tracking removed for Grünerator deployment
import { Toaster } from '@/components/ui/sonner';
const inter = localFont({
  src: [
    {
      path: './fonts/Inter.ttf',
      weight: '400',
      style: 'normal',
    },
  ],
  variable: '--font-inter',
});

const syne = Syne({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-syne',
});

const unbounded = Unbounded({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-unbounded',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://slides.gruenerator.eu'),
  title: 'Grünerator Slides — KI-Präsentationen',
  description:
    'KI-gestützte Präsentationen erstellen und bearbeiten. Ein Tool des Grünerators für Die Grünen.',
  openGraph: {
    title: 'Grünerator Slides — KI-Präsentationen',
    description: 'KI-gestützte Präsentationen erstellen und bearbeiten.',
    url: 'https://slides.gruenerator.eu',
    siteName: 'Grünerator Slides',
    type: 'website',
    locale: 'de_DE',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${unbounded.variable} ${syne.variable} antialiased`}>
        <Providers>{children}</Providers>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
