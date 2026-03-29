import type { Metadata } from 'next';

import localFont from 'next/font/local';

import './globals.css';
import { Providers } from './providers';

import { Toaster } from '@/components/ui/sonner';

const ptSans = localFont({
  src: [
    { path: '../public/fonts/PTSans-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/PTSans-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-pt-sans',
});

const raleway = localFont({
  src: [
    { path: '../public/fonts/Raleway-Regular.woff', weight: '400', style: 'normal' },
    { path: '../public/fonts/Raleway-Medium.woff', weight: '500', style: 'normal' },
    { path: '../public/fonts/Raleway-SemiBold.woff', weight: '600', style: 'normal' },
    { path: '../public/fonts/Raleway-Bold.woff', weight: '700', style: 'normal' },
  ],
  variable: '--font-raleway',
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
    <html lang="de">
      <body className={`${ptSans.variable} ${raleway.variable} antialiased`}>
        <Providers>{children}</Providers>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
