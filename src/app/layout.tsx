import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import './globals.css';

const beVietnamPro = Be_Vietnam_Pro({
  variable: '--font-sans',
  subsets: ['latin', 'vietnamese'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  variable: '--font-heading',
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'EVoyage — Plan your EV road trip',
  description:
    'Plan your EV road trip with accurate range calculations, smart charging stops, and the 80% real-world range rule.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'eVoyage',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body
        className={`${beVietnamPro.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable} antialiased bg-[#0A0A0B] text-[#F5F5F7]`}
      >
        {children}
      </body>
    </html>
  );
}
