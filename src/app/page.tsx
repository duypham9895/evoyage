import type { Metadata } from 'next';
import LandingPageContent from '@/components/landing/LandingPageContent';

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
    url: 'https://evoyage.app',
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
    canonical: 'https://evoyage.app',
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

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingPageContent />
    </>
  );
}
