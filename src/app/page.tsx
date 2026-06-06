import type { Metadata } from 'next';
import { headers } from 'next/headers';
import LandingPageContent from '@/components/landing/LandingPageContent';

const SITE_URL = 'https://evoyage.duypham.me';

export const metadata: Metadata = {
  title: 'eVoyage — Lên kế hoạch chuyến đi xe điện tại Việt Nam',
  description:
    'Tính toán quãng đường thực tế, tìm trạm sạc VinFast, lên kế hoạch hành trình xe điện tự tin. Miễn phí, không cần đăng ký.',
  openGraph: {
    title: 'eVoyage — EV Trip Planner for Vietnam',
    description:
      'Plan your electric vehicle road trip across Vietnam with real-world range calculations and VinFast charging station data.',
    type: 'website',
    locale: 'vi_VN',
    url: SITE_URL,
    siteName: 'eVoyage',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'eVoyage — EV Trip Planner for Vietnam',
    description:
      'Plan your EV road trip with real-world range and charging station data.',
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: SITE_URL,
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'eVoyage',
  description: 'EV trip planner for Vietnam with VinFast charging station data',
  applicationCategory: 'TravelApplication',
  operatingSystem: 'Web',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'VND',
  },
  availableLanguage: ['vi', 'en'],
};

export default async function LandingPage() {
  // Middleware sets x-nonce on the request headers; read it here so the
  // JSON-LD <script> below is allowed under the nonce-based CSP set by
  // src/middleware.ts. Falls back to no nonce in environments where
  // middleware is bypassed (dev SSR shortcut, test snapshot).
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  // Defense-in-depth: also escape any '</' in the JSON-LD payload so a
  // future jsonLd field containing user data couldn't break out of the
  // script tag. Today jsonLd is fully static, so this is paranoia.
  const ldJson = JSON.stringify(jsonLd).replace(/</g, '\\u003c');

  return (
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: ldJson }}
      />
      <LandingPageContent />
    </>
  );
}
