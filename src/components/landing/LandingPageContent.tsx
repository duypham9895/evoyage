'use client';

import {
  LandingNavbar,
  ScrollAnimator,
  FAQAccordion,
  StatCounter,
  LandingWrapper,
  useLandingLocale,
} from './LandingClient';
import VietnamMap from './VietnamMap';
import HomeEnergyPrices from './HomeEnergyPrices';
import vi from '@/locales/vi.json';
import en from '@/locales/en.json';
import stationStats from '@/data/station-stats.json';
import { formatLastUpdated, formatStationCount } from '@/lib/station-stats';
import { getEnergyPrices } from '@/lib/energy-prices';

const dictionaries = { vi, en } as const;

type InterpolationParams = Record<string, string | number>;

/**
 * Replace `{{key}}` placeholders with values from params.
 * Mirrors the `interpolate()` helper in src/lib/locale.tsx so this
 * landing-only `useT()` keeps parity with the global locale provider.
 */
function interpolate(template: string, params?: InterpolationParams): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = params[key];
    return value !== undefined ? String(value) : match;
  });
}

function useT() {
  const { locale } = useLandingLocale();
  const dict = dictionaries[locale] as Record<string, string>;
  return (key: string, params?: InterpolationParams) => interpolate(dict[key] ?? key, params);
}

/* ─── Vietnam Map (GADM geographic data) ───────────────── */

/* ─── Feature section config ─────────────────────────────── */

const FEATURE_COLORS = [
  'var(--color-info)',
  'var(--color-accent)',
  'var(--color-info)',
  'var(--color-accent)',
  'var(--color-info)',
  'var(--color-accent)',
] as const;

/* ─── Vehicle Data ──────────────────────────────────────── */

const VINFAST_MODELS = [
  { model: 'VF 3', rangeKm: 215, batteryKwh: 18.6, dcChargeMin: 36 },
  { model: 'VF 5', rangeKm: 326, batteryKwh: 37.2, dcChargeMin: 30 },
  { model: 'VF 6', rangeKm: 399, batteryKwh: 59.6, dcChargeMin: 24 },
  { model: 'VF 7', rangeKm: 431, batteryKwh: 75.3, dcChargeMin: 24 },
  { model: 'VF 8', rangeKm: 471, batteryKwh: 87.7, dcChargeMin: 26 },
  { model: 'VF 9', rangeKm: 594, batteryKwh: 123, dcChargeMin: 26 },
] as const;

/**
 * Vietnam consolidated 63 provinces + municipalities into 34 administrative units
 * (6 centrally-run cities + 28 provinces) effective 2025-07-01. Source:
 * https://en.wikipedia.org/wiki/2025_Vietnamese_administrative_reform
 */
const VIETNAM_PROVINCE_COUNT = 34;

/* ─── Main Landing Content ──────────────────────────────── */

function LandingContent() {
  const { locale, toggleLocale } = useLandingLocale();
  const t = useT();

  const faqItems = [
    { question: t('landing_faq1_q'), answer: t('landing_faq1_a') },
    { question: t('landing_faq2_q'), answer: t('landing_faq2_a') },
    { question: t('landing_faq3_q'), answer: t('landing_faq3_a') },
    { question: t('landing_faq4_q'), answer: t('landing_faq4_a') },
    { question: t('landing_faq5_q'), answer: t('landing_faq5_a') },
    { question: t('landing_faq6_q'), answer: t('landing_faq6_a') },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* ─── Navbar ─────────────────────────────────────── */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-[var(--color-accent)] focus:text-[var(--color-background)] focus:px-4 focus:py-2">
        Skip to main content
      </a>
      <LandingNavbar
        locale={locale}
        onLocaleChangeAction={toggleLocale}
        translations={{ navCta: t('landing_nav_cta') }}
      />

      {/* ─── Hero Section ───────────────────────────────── */}
      <main id="main-content">
      <section className="min-h-screen flex items-center pt-16 relative overflow-hidden bg-gradient-to-b from-[var(--color-landing-navy)] via-[var(--color-landing-navy-deep)] to-[var(--color-background)]">
        <div className="max-w-[1200px] mx-auto px-6 w-full">
          <div className="flex flex-col md:flex-row items-center gap-12 md:gap-16">
            {/* Left: text */}
            <div className="flex-1 max-w-xl">
              {/* Badge */}
              <span className="inline-block px-4 py-1.5 bg-[var(--color-accent-subtle)] text-[var(--color-accent)] text-sm font-medium rounded-full border border-[var(--color-accent)]/20 mb-6">
                {t('landing_hero_badge')}
              </span>

              <h1 className="font-[family-name:var(--font-heading)] font-bold text-3xl sm:text-4xl md:text-[56px] md:leading-[1.1] text-[var(--color-foreground)] mb-6">
                {t('landing_hero_h1')}
              </h1>

              <p className="text-[var(--color-muted)] text-base md:text-lg leading-relaxed mb-8 max-w-lg">
                {t('landing_hero_subtitle')}
              </p>

              <a
                href="/plan"
                className="inline-block px-8 py-4 bg-[var(--color-accent)] text-[var(--color-background)] font-semibold text-base md:text-lg rounded-xl hover:bg-[var(--color-accent-dim)] transition-all cta-glow"
              >
                {t('landing_hero_cta')}
              </a>

              {/* Stats row */}
              <div className="flex flex-wrap gap-6 md:gap-10 mt-10 text-sm">
                <div>
                  <span className="text-[var(--color-foreground)] font-bold text-xl font-[family-name:var(--font-heading)]">{formatStationCount(stationStats.count, locale)}+</span>
                  <span className="text-[var(--color-muted)] ml-2">{t('landing_hero_stat_stations')}</span>
                </div>
                <div>
                  <span className="text-[var(--color-foreground)] font-bold text-xl font-[family-name:var(--font-heading)]">{VINFAST_MODELS.length}+</span>
                  <span className="text-[var(--color-muted)] ml-2">{t('landing_hero_stat_models')}</span>
                </div>
                <div>
                  <span className="text-[var(--color-foreground)] font-bold text-xl font-[family-name:var(--font-heading)]">{VIETNAM_PROVINCE_COUNT}</span>
                  <span className="text-[var(--color-muted)] ml-2">{t('landing_hero_stat_provinces')}</span>
                </div>
              </div>
              <p className="text-[var(--color-muted)] text-xs mt-3 max-w-md">
                {t('landing_hero_stats_freshness').replace(
                  '{{date}}',
                  formatLastUpdated(stationStats.lastUpdated, locale),
                )}
              </p>
            </div>

            {/* Right: interactive Vietnam map */}
            <div className="flex-shrink-0 w-full md:w-[45%] max-w-[400px] md:max-w-[500px]">
              <VietnamMap />
            </div>
          </div>
        </div>
      </section>

      {/* ─── Today's Energy Prices ─────────────────────── */}
      <HomeEnergyPrices snapshot={getEnergyPrices()} t={t} locale={locale} />

      {/* ─── How It Works ───────────────────────────────── */}
      <section className="py-12 md:py-32 bg-[var(--color-background)]">
        <div className="max-w-[1200px] mx-auto px-6">
          <ScrollAnimator>
            <h2 className="font-[family-name:var(--font-heading)] font-semibold text-2xl md:text-[40px] text-[var(--color-foreground)] text-center mb-16">
              {t('landing_how_title')}
            </h2>
          </ScrollAnimator>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {([
              { color: 'var(--color-info)', step: 1, title: t('landing_step1_title'), desc: t('landing_step1_desc') },
              { color: 'var(--color-accent)', step: 2, title: t('landing_step2_title'), desc: t('landing_step2_desc') },
              { color: 'var(--color-accent)', step: 3, title: t('landing_step3_title'), desc: t('landing_step3_desc') },
            ] as const).map((item) => (
              <ScrollAnimator key={item.step}>
                <div
                  className="relative bg-[var(--color-surface)] rounded-2xl p-6 border border-[var(--color-surface-hover)] hover:border-[var(--color-surface-hover)] transition-all"
                  style={{ borderTopColor: item.color, borderTopWidth: '3px' }}
                >
                  <span
                    className="font-[family-name:var(--font-heading)] text-[40px] font-bold leading-none mb-3 block"
                    style={{ color: item.color, opacity: 0.25 }}
                  >
                    {item.step}
                  </span>
                  <h3 className="font-[family-name:var(--font-heading)] font-semibold text-lg md:text-[22px] text-[var(--color-foreground)] mb-3">
                    {item.title}
                  </h3>
                  <p className="text-[var(--color-muted)] text-sm md:text-[15px] leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </ScrollAnimator>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Key Features ───────────────────────────────── */}
      <section className="py-12 md:py-32 bg-[var(--color-landing-alt)]">
        <div className="max-w-[1200px] mx-auto px-6">
          <ScrollAnimator>
            <h2 className="font-[family-name:var(--font-heading)] font-semibold text-2xl md:text-[40px] text-[var(--color-foreground)] text-center mb-16">
              {t('landing_features_title')}
            </h2>
          </ScrollAnimator>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <ScrollAnimator key={n}>
                <div className="bg-[var(--color-surface)] rounded-2xl p-6 border border-[var(--color-surface-hover)] hover:border-[var(--color-info)]/40 hover:-translate-y-1 transition-all duration-200">
                  <span
                    className="inline-block text-xs font-bold font-[family-name:var(--font-mono)] uppercase tracking-widest mb-3"
                    style={{ color: FEATURE_COLORS[n - 1] }}
                  >
                    0{n}
                  </span>
                  <h3 className="font-[family-name:var(--font-heading)] font-semibold text-lg md:text-[22px] text-[var(--color-foreground)] mb-2">
                    {t(`landing_feat${n}_title`, n === 2 ? { count: stationStats.count } : undefined)}
                  </h3>
                  <p className="text-[var(--color-muted)] text-sm leading-relaxed">
                    {t(`landing_feat${n}_desc`)}
                  </p>
                </div>
              </ScrollAnimator>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Supported Vehicles ─────────────────────────── */}
      <section className="py-12 md:py-32 bg-[var(--color-background)]">
        <div className="max-w-[1200px] mx-auto px-6">
          <ScrollAnimator>
            <div className="text-center mb-12">
              <h2 className="font-[family-name:var(--font-heading)] font-semibold text-2xl md:text-[40px] text-[var(--color-foreground)] mb-3">
                {t('landing_models_title')}
              </h2>
              <p className="text-[var(--color-muted)] text-base">{t('landing_models_subtitle')}</p>
            </div>
          </ScrollAnimator>

          {/* Horizontal scroll on mobile, grid on desktop */}
          <div className="flex md:grid md:grid-cols-3 gap-4 overflow-x-auto pb-4 md:pb-0 snap-x snap-mandatory md:snap-none -mx-6 px-6 md:mx-0 md:px-0">
            {VINFAST_MODELS.map((car) => (
              <ScrollAnimator key={car.model} className="snap-start">
                <div className="min-w-[180px] bg-[var(--color-surface)] rounded-2xl p-5 border border-[var(--color-surface-hover)] hover:border-[var(--color-surface-hover)] transition-all">
                  <div className="h-4" />

                  {/* VinFast badge */}
                  <span className="inline-block px-2 py-0.5 bg-[var(--color-accent-subtle)] text-[var(--color-accent)] text-[11px] font-medium rounded-full mb-2">
                    VinFast
                  </span>

                  <h3 className="font-[family-name:var(--font-heading)] font-semibold text-base text-[var(--color-foreground)] mb-3">
                    {car.model}
                  </h3>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[var(--color-muted)]">{t('landing_models_range')}</span>
                      <p className="text-[var(--color-foreground)] font-medium">{car.rangeKm} km</p>
                    </div>
                    <div>
                      <span className="text-[var(--color-muted)]">{t('landing_models_battery')}</span>
                      <p className="text-[var(--color-foreground)] font-medium">{car.batteryKwh} kWh</p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[var(--color-muted)]">{t('landing_models_charge')}</span>
                      <p className="text-[var(--color-foreground)] font-medium">{car.dcChargeMin} min (10-80%)</p>
                    </div>
                  </div>
                </div>
              </ScrollAnimator>
            ))}
          </div>

          <ScrollAnimator>
            <div className="text-center mt-8">
              <a
                href="/plan"
                className="inline-flex items-center gap-2 text-[var(--color-muted)] hover:text-[var(--color-foreground)] text-sm font-medium transition-colors"
              >
                {t('landing_models_add')}
                <span aria-hidden>→</span>
              </a>
            </div>
          </ScrollAnimator>
        </div>
      </section>

      {/* ─── Stats / Coverage ───────────────────────────── */}
      <section className="py-12 md:py-32 bg-[var(--color-landing-navy)]">
        <div className="max-w-[1200px] mx-auto px-6">
          <ScrollAnimator>
            <h2 className="font-[family-name:var(--font-heading)] font-semibold text-2xl md:text-[40px] text-[var(--color-foreground)] text-center mb-16">
              {t('landing_stats_title')}
            </h2>
          </ScrollAnimator>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
            <StatCounter value={stationStats.count} suffix="+" label={t('landing_stats_stations')} />
            <StatCounter value={VIETNAM_PROVINCE_COUNT} label={t('landing_stats_provinces')} />
            <StatCounter value={VINFAST_MODELS.length} suffix="+" label={t('landing_stats_models')} />
            <div className="text-center">
              <div className="font-[family-name:var(--font-heading)] font-bold text-4xl md:text-[56px] text-[var(--color-accent)] leading-tight">
                24/7
              </div>
              <div className="text-[var(--color-muted)] text-base mt-2">{t('landing_stats_free')}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FAQ ────────────────────────────────────────── */}
      <section className="py-12 md:py-32 bg-[var(--color-background)]">
        <div className="max-w-[1200px] mx-auto px-6">
          <ScrollAnimator>
            <h2 className="font-[family-name:var(--font-heading)] font-semibold text-2xl md:text-[40px] text-[var(--color-foreground)] text-center mb-16">
              {t('landing_faq_title')}
            </h2>
          </ScrollAnimator>

          <ScrollAnimator>
            <FAQAccordion items={faqItems} />
          </ScrollAnimator>
        </div>
      </section>

      {/* ─── Built with AI ───────────────────────────────── */}
      <section className="py-12 md:py-32 bg-[var(--color-landing-alt)]">
        <div className="max-w-[800px] mx-auto px-6">
          <ScrollAnimator>
            <div className="text-center mb-10">
              <span className="inline-block px-4 py-1.5 bg-[var(--color-info)]/10 text-[var(--color-info)] text-sm font-medium rounded-full border border-[var(--color-info)]/20 mb-6">
                Transparency
              </span>
              <h2 className="font-[family-name:var(--font-heading)] font-semibold text-2xl md:text-[40px] text-[var(--color-foreground)] mb-4">
                {t('landing_built_with_ai_title')}
              </h2>
              <p className="text-[var(--color-muted)] text-base md:text-lg leading-relaxed max-w-2xl mx-auto">
                {t('landing_built_with_ai_desc')}
              </p>
            </div>
          </ScrollAnimator>

          <ScrollAnimator>
            <div className="grid grid-cols-3 gap-4 md:gap-6">
              {([
                { role: t('landing_built_with_ai_role_pm'), name: t('landing_built_with_ai_role_pm_desc'), color: 'var(--color-accent)' },
                { role: t('landing_built_with_ai_role_dev'), name: t('landing_built_with_ai_role_dev_desc'), color: 'var(--color-info)' },
                { role: t('landing_built_with_ai_role_infra'), name: t('landing_built_with_ai_role_infra_desc'), color: 'var(--color-muted)' },
              ] as const).map((item) => (
                <div
                  key={item.role}
                  className="bg-[var(--color-surface)] rounded-2xl p-4 md:p-6 border border-[var(--color-surface-hover)] text-center"
                >
                  <div className="text-[var(--color-muted)] text-xs uppercase tracking-wider mb-2">
                    {item.role}
                  </div>
                  <div className="font-semibold text-sm md:text-base" style={{ color: item.color }}>
                    {item.name}
                  </div>
                </div>
              ))}
            </div>
          </ScrollAnimator>
        </div>
      </section>

      {/* ─── Final CTA ──────────────────────────────────── */}
      <section className="py-12 md:py-32 bg-gradient-to-b from-[var(--color-landing-navy)] to-[var(--color-background)]">
        <div className="max-w-[1200px] mx-auto px-6 text-center">
          <ScrollAnimator>
            <h2 className="font-[family-name:var(--font-heading)] font-semibold text-2xl md:text-[40px] text-[var(--color-foreground)] mb-4">
              {t('landing_cta_h2')}
            </h2>
            <p className="text-[var(--color-muted)] text-base md:text-lg mb-10">
              {t('landing_cta_subtitle')}
            </p>
            <a
              href="/plan"
              className="inline-block px-12 py-4 bg-[var(--color-accent)] text-[var(--color-background)] font-semibold text-base md:text-lg rounded-xl hover:bg-[var(--color-accent-dim)] transition-all cta-glow"
            >
              {t('landing_cta_button')}
            </a>
          </ScrollAnimator>
        </div>
      </section>

      {/* ─── Footer ─────────────────────────────────────── */}
      </main>

      <footer className="bg-[var(--color-landing-footer)] border-t border-[var(--color-surface)]">
        <div className="max-w-[1200px] mx-auto px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Logo & tagline */}
            <div>
              <div className="font-[family-name:var(--font-heading)] font-bold text-2xl tracking-tight mb-2">
                <span className="text-[var(--color-accent)] italic">e</span>
                <span className="text-[var(--color-foreground)]">Voyage</span>
              </div>
              <p className="text-[var(--color-muted)] text-sm font-light">
                {t('landing_footer_tagline')}
              </p>
            </div>

            {/* Links */}
            <div>
              <h4 className="text-[var(--color-muted)] text-xs font-medium uppercase tracking-wider mb-4">Links</h4>
              <div className="flex flex-col gap-2">
                <a href="/plan" className="text-[var(--color-foreground)] text-sm hover:text-[var(--color-accent)] transition-colors py-3 inline-block">
                  {t('landing_footer_start')}
                </a>
                <a
                  href="https://github.com/duypham9895/evoyage"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-foreground)] text-sm hover:text-[var(--color-accent)] transition-colors py-3 inline-block"
                >
                  {t('landing_footer_github')}
                </a>
              </div>
            </div>

            {/* Built with */}
            <div>
              <h4 className="text-[var(--color-muted)] text-xs font-medium uppercase tracking-wider mb-4">
                {t('landing_footer_built')}
              </h4>
              <div className="flex flex-col gap-2 text-sm text-[var(--color-muted)]">
                <span>Claude Code</span>
                <span>Next.js</span>
                <span>Mapbox</span>
                <span>VinFast API</span>
              </div>
            </div>
          </div>

          {/* Copyright */}
          <div className="border-t border-[var(--color-surface)] mt-8 pt-6">
            <p className="text-[var(--color-muted)] text-[13px] text-center">
              &copy; {new Date().getFullYear()} {t('landing_footer_copyright')}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─── Exported wrapper ──────────────────────────────────── */

export default function LandingPageContent() {
  return (
    <LandingWrapper>
      <LandingContent />
    </LandingWrapper>
  );
}
