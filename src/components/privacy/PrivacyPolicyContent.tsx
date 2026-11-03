'use client';

import { LandingNavbar, LandingWrapper, useLandingLocale } from '@/components/landing/LandingClient';
import { useT } from '@/components/landing/LandingPageContent';

/**
 * Every processor the facts table (docs/plans/project-blueprint.md §4) lists,
 * in the order they appear on the page. Each needs a `privacy_processor_<slug>_name`
 * and `privacy_processor_<slug>_body` locale key pair — see src/locales/{en,vi}.json.
 */
const PROCESSOR_SLUGS = [
  'posthog',
  'supabase',
  'vercel',
  'resend',
  'openai',
  'minimax',
  'groq',
  'mapbox',
  'openstreetmap',
  'osrm',
  'upstash',
  'google',
  'vinfast',
] as const;

function PrivacyContent() {
  const { locale, toggleLocale } = useLandingLocale();
  const t = useT();

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <a
        href="#privacy-main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-[var(--color-accent)] focus:text-[var(--color-background)] focus:px-4 focus:py-2"
      >
        Skip to main content
      </a>
      <LandingNavbar
        locale={locale}
        onLocaleChangeAction={toggleLocale}
        translations={{ navCta: t('landing_nav_cta') }}
      />

      <main
        id="privacy-main-content"
        data-testid="privacy-content"
        className="max-w-[760px] mx-auto px-6 pt-28 pb-20"
      >
        <p className="text-sm font-medium text-[var(--color-warn)] mb-4">
          {t('privacy_draft_banner')}
        </p>
        <h1 className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-bold text-[var(--color-foreground)] mb-6">
          {t('privacy_heading')}
        </h1>
        <p className="text-[var(--color-text-secondary)] mb-10">{t('privacy_abroad')}</p>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-[var(--color-foreground)] mb-2">
            {t('privacy_section_collect_heading')}
          </h2>
          <p className="text-[var(--color-text-secondary)]">{t('privacy_section_collect_body')}</p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-[var(--color-foreground)] mb-2">
            {t('privacy_section_why_heading')}
          </h2>
          <p className="text-[var(--color-text-secondary)]">{t('privacy_section_why_body')}</p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-[var(--color-foreground)] mb-4">
            {t('privacy_section_processors_heading')}
          </h2>
          <div className="space-y-6">
            {PROCESSOR_SLUGS.map((slug) => (
              <div key={slug} data-testid={`privacy-processor-${slug}`}>
                <h3 className="font-semibold text-[var(--color-foreground)] mb-1">
                  {t(`privacy_processor_${slug}_name`)}
                </h3>
                <p className="text-[var(--color-text-secondary)] text-sm">
                  {t(`privacy_processor_${slug}_body`, {
                    googleMapsLabel: t('open_in_google_maps'),
                  })}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-[var(--color-foreground)] mb-2">
            {t('privacy_section_device_heading')}
          </h2>
          <p className="text-[var(--color-text-secondary)]">{t('privacy_section_device_body')}</p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-[var(--color-foreground)] mb-2">
            {t('privacy_section_retention_heading')}
          </h2>
          <p className="text-[var(--color-text-secondary)]">{t('privacy_section_retention_body')}</p>
        </section>

        <section className="mb-10" data-testid="privacy-contact">
          <h2 className="text-lg font-semibold text-[var(--color-foreground)] mb-2">
            {t('privacy_section_contact_heading')}
          </h2>
          <p className="text-[var(--color-text-secondary)] mb-3">
            {t('privacy_contact_body', {
              feedbackTitle: t('feedback_title'),
              feedbackCategory: t('feedback_cat_contact_support'),
            })}
          </p>
          <p className="text-[var(--color-text-secondary)] text-sm">
            <a
              href="https://github.com/duypham9895/evoyage/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[var(--color-accent)]"
            >
              {t('privacy_contact_github')}
            </a>
          </p>
        </section>

        <p className="text-xs text-[var(--color-text-secondary)]">{t('privacy_last_updated')}</p>
      </main>
    </div>
  );
}

export default function PrivacyPolicyContent() {
  return (
    <LandingWrapper>
      <PrivacyContent />
    </LandingWrapper>
  );
}
