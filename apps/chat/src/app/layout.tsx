import type { Metadata } from 'next';
import { Providers } from './providers';
import '@gruenerator/chat/styles';

export const metadata: Metadata = {
  title: 'Grünerator Chat',
  description:
    'KI-gestützter Textassistent für Bündnis 90/Die Grünen',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
