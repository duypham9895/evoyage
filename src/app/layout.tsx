import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import { headers } from 'next/headers';
import AnalyticsProvider from '@/components/AnalyticsProvider';
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
  maximumScale: 5,
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the request headers at the root layout. This forces dynamic
  // rendering for every page (otherwise statically-generated routes never
  // see the middleware-set `x-nonce`, and Next.js can't apply the nonce to
  // its hydration chunks → strict-dynamic CSP blocks everything client-side).
  // The headers() call is the canonical way to force dynamic rendering in
  // App Router; we don't actually need the value here. (D.8b smoke-test
  // 2026-05-24 found /plan was static, so its chunks were blocked even
  // though the middleware was setting the nonce header on the response.)
  await headers();

  return (
    <html lang="vi">
      <body
        className={`${beVietnamPro.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable} antialiased bg-[var(--color-background)] text-[var(--color-foreground)]`}
      >
        <AnalyticsProvider />
        {children}
      </body>
    </html>
  );
}
