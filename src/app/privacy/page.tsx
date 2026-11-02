import type { Metadata } from 'next';
import PrivacyPolicyContent from '@/components/privacy/PrivacyPolicyContent';

// DRAFT — pending legal review
export const metadata: Metadata = {
  title: 'Chính sách quyền riêng tư (bản nháp) — eVoyage',
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return <PrivacyPolicyContent />;
}
