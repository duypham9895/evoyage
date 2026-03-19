'use client';

import {
  LandingNavbar,
  ScrollAnimator,
  FAQAccordion,
  StatCounter,
  LandingWrapper,
  useLandingLocale,
} from './LandingClient';
import vi from '@/locales/vi.json';
import en from '@/locales/en.json';

const dictionaries = { vi, en } as const;

function useT() {
  const { locale } = useLandingLocale();
  const dict = dictionaries[locale] as Record<string, string>;
  return (key: string) => dict[key] ?? key;
}

/* ─── Route Visualization SVG ───────────────────────────── */

function RouteVisualization() {
  return (
    <div
      className="relative w-full max-w-[400px] mx-auto aspect-[2/3]"
      aria-hidden="true"
    >
      {/* Background glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(20,100,244,0.1)_0%,transparent_70%)]" />

      <svg
        viewBox="0 0 400 600"
        className="w-full h-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Simplified Vietnam outline */}
        <path
          d="M200 40 C220 60, 250 80, 260 120 C270 160, 240 200, 250 240 C260 280, 280 300, 270 340 C260 380, 230 400, 220 440 C210 480, 200 500, 180 520 C160 540, 150 550, 160 560"
          stroke="#2C2C2E"
          strokeWidth="2"
          fill="none"
        />
        {/* Western border hint */}
        <path
          d="M200 40 C180 60, 160 100, 170 140 C180 180, 160 220, 170 260 C180 300, 160 340, 170 380 C180 420, 160 460, 160 500 C160 530, 155 545, 160 560"
          stroke="#2C2C2E"
          strokeWidth="1.5"
          fill="none"
          opacity="0.5"
        />

        {/* Animated route from Ho Chi Minh to Ha Noi */}
        <path
          className="route-path"
          d="M190 530 C195 500, 210 470, 220 440 C230 410, 245 380, 250 350 C255 320, 260 290, 255 260 C250 230, 240 200, 245 170 C250 140, 240 110, 220 80 C210 60, 205 50, 200 45"
          stroke="#00D4AA"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />

        {/* Charging station dots */}
        <g>
          <circle className="charge-dot" cx="220" cy="440" r="6" fill="#00D26A" />
          <circle className="charge-dot" cx="250" cy="350" r="6" fill="#00D26A" />
          <circle className="charge-dot" cx="255" cy="260" r="6" fill="#1464F4" />
          <circle className="charge-dot" cx="245" cy="170" r="6" fill="#1464F4" />
          <circle className="charge-dot" cx="200" cy="45" r="6" fill="#1464F4" />
        </g>

        {/* City labels */}
        <text x="170" y="548" fill="#8E8E93" fontSize="11" fontFamily="var(--font-sans)">
          TP.HCM
        </text>
        <text x="175" y="38" fill="#8E8E93" fontSize="11" fontFamily="var(--font-sans)">
          Ha Noi
        </text>

        {/* Start/End markers */}
        <circle cx="190" cy="530" r="8" fill="#00D26A" opacity="0.3" />
        <circle cx="190" cy="530" r="4" fill="#00D26A" />
        <circle cx="200" cy="45" r="8" fill="#1464F4" opacity="0.3" />
        <circle cx="200" cy="45" r="4" fill="#1464F4" />
      </svg>
    </div>
  );
}

/* ─── Step Card Icons (inline SVG) ──────────────────────── */

function CarIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1464F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2" />
      <circle cx="6.5" cy="16.5" r="2.5" />
      <circle cx="16.5" cy="16.5" r="2.5" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#00D4AA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function ZapIcon({ color = '#00D26A' }: { readonly color?: string }) {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

/* ─── Feature Card Icons ────────────────────────────────── */

function RouteIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1464F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="19" r="3" /><circle cx="18" cy="5" r="3" />
      <path d="M12 19h4.5a3.5 3.5 0 0 0 0-7h-8a3.5 3.5 0 0 1 0-7H12" />
    </svg>
  );
}

function MountainIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1464F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
    </svg>
  );
}

function BatteryIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1464F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="16" height="10" x="2" y="7" rx="2" ry="2" /><line x1="22" x2="22" y1="11" y2="13" />
      <line x1="6" x2="6" y1="11" y2="13" /><line x1="10" x2="10" y1="11" y2="13" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1464F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" /><line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1464F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="2" x2="22" y1="12" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

const FEATURE_ICONS = [RouteIcon, ZapIcon, MountainIcon, BatteryIcon, ShareIcon, GlobeIcon] as const;

/* ─── Vehicle Data ──────────────────────────────────────── */

const VINFAST_MODELS = [
  { model: 'VF 3', rangeKm: 215, batteryKwh: 18.6, dcChargeMin: 36 },
  { model: 'VF 5', rangeKm: 326, batteryKwh: 37.2, dcChargeMin: 30 },
  { model: 'VF 6', rangeKm: 399, batteryKwh: 59.6, dcChargeMin: 24 },
  { model: 'VF 7', rangeKm: 431, batteryKwh: 75.3, dcChargeMin: 24 },
  { model: 'VF 8', rangeKm: 471, batteryKwh: 87.7, dcChargeMin: 26 },
  { model: 'VF 9', rangeKm: 594, batteryKwh: 123, dcChargeMin: 26 },
] as const;

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
    <div className="min-h-screen bg-[#0A0A0B]">
      {/* ─── Navbar ─────────────────────────────────────── */}
      <LandingNavbar
        locale={locale}
        onLocaleChangeAction={toggleLocale}
        translations={{ navCta: t('landing_nav_cta') }}
      />

      {/* ─── Hero Section ───────────────────────────────── */}
      <section className="min-h-screen flex items-center pt-16 relative overflow-hidden bg-gradient-to-b from-[#0D1B3E] via-[#081428] to-[#0A0A0B]">
        <div className="max-w-[1200px] mx-auto px-6 w-full">
          <div className="flex flex-col md:flex-row items-center gap-12 md:gap-16">
            {/* Left: text */}
            <div className="flex-1 max-w-xl">
              {/* Badge */}
              <span className="inline-block px-4 py-1.5 bg-[#00D26A]/10 text-[#00D26A] text-sm font-medium rounded-full border border-[#00D26A]/20 mb-6">
                {t('landing_hero_badge')}
              </span>

              <h1 className="font-[family-name:var(--font-heading)] font-bold text-3xl sm:text-4xl md:text-[56px] md:leading-[1.1] text-[#F5F5F7] mb-6">
                {t('landing_hero_h1')}
              </h1>

              <p className="text-[#8E8E93] text-base md:text-lg leading-relaxed mb-8 max-w-lg">
                {t('landing_hero_subtitle')}
              </p>

              <a
                href="/plan"
                className="inline-block px-8 py-4 bg-[#00D26A] text-[#0A0A0B] font-semibold text-base md:text-lg rounded-xl hover:bg-[#00E87A] transition-all cta-glow"
              >
                {t('landing_hero_cta')}
              </a>

              {/* Stats row */}
              <div className="flex flex-wrap gap-6 md:gap-10 mt-10 text-sm">
                <div>
                  <span className="text-[#F5F5F7] font-bold text-xl font-[family-name:var(--font-heading)]">150+</span>
                  <span className="text-[#8E8E93] ml-2">{t('landing_hero_stat_stations')}</span>
                </div>
                <div>
                  <span className="text-[#F5F5F7] font-bold text-xl font-[family-name:var(--font-heading)]">15+</span>
                  <span className="text-[#8E8E93] ml-2">{t('landing_hero_stat_models')}</span>
                </div>
                <div>
                  <span className="text-[#F5F5F7] font-bold text-xl font-[family-name:var(--font-heading)]">63</span>
                  <span className="text-[#8E8E93] ml-2">{t('landing_hero_stat_provinces')}</span>
                </div>
              </div>
            </div>

            {/* Right: animated visualization */}
            <div className="flex-shrink-0 w-full md:w-[40%] max-w-[320px] md:max-w-[400px]">
              <RouteVisualization />
            </div>
          </div>
        </div>
      </section>

      {/* ─── How It Works ───────────────────────────────── */}
      <section className="py-12 md:py-32 bg-[#0A0A0B]">
        <div className="max-w-[1200px] mx-auto px-6">
          <ScrollAnimator>
            <h2 className="font-[family-name:var(--font-heading)] font-semibold text-2xl md:text-[40px] text-[#F5F5F7] text-center mb-16">
              {t('landing_how_title')}
            </h2>
          </ScrollAnimator>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {([
              { icon: <CarIcon />, color: '#1464F4', step: 1, title: t('landing_step1_title'), desc: t('landing_step1_desc') },
              { icon: <MapPinIcon />, color: '#00D4AA', step: 2, title: t('landing_step2_title'), desc: t('landing_step2_desc') },
              { icon: <ZapIcon />, color: '#00D26A', step: 3, title: t('landing_step3_title'), desc: t('landing_step3_desc') },
            ] as const).map((item) => (
              <ScrollAnimator key={item.step}>
                <div
                  className="relative bg-[#1C1C1E] rounded-2xl p-6 border border-[#2C2C2E] hover:border-[#2C2C2E] transition-all"
                  style={{ borderTopColor: item.color, borderTopWidth: '3px' }}
                >
                  {/* Step number */}
                  <span className="absolute top-4 right-4 font-[family-name:var(--font-heading)] text-[64px] font-bold leading-none text-[#1464F4] opacity-[0.08]">
                    {item.step}
                  </span>

                  <div className="mb-4">{item.icon}</div>
                  <h3 className="font-[family-name:var(--font-heading)] font-semibold text-lg md:text-[22px] text-[#F5F5F7] mb-3">
                    {item.title}
                  </h3>
                  <p className="text-[#8E8E93] text-sm md:text-[15px] leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </ScrollAnimator>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Key Features ───────────────────────────────── */}
      <section className="py-12 md:py-32 bg-[#111114]">
        <div className="max-w-[1200px] mx-auto px-6">
          <ScrollAnimator>
            <h2 className="font-[family-name:var(--font-heading)] font-semibold text-2xl md:text-[40px] text-[#F5F5F7] text-center mb-16">
              {t('landing_features_title')}
            </h2>
          </ScrollAnimator>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((n) => {
              const IconComponent = FEATURE_ICONS[n - 1];
              return (
                <ScrollAnimator key={n}>
                  <div className="bg-[#1C1C1E] rounded-2xl p-6 border border-[#2C2C2E] hover:border-[#1464F4]/40 hover:-translate-y-1 transition-all duration-200">
                    <div className="w-12 h-12 rounded-full bg-[#1464F4]/10 flex items-center justify-center mb-4">
                      <IconComponent color="#1464F4" />
                    </div>
                    <h3 className="font-[family-name:var(--font-heading)] font-semibold text-lg text-[#F5F5F7] mb-2">
                      {t(`landing_feat${n}_title`)}
                    </h3>
                    <p className="text-[#8E8E93] text-sm leading-relaxed">
                      {t(`landing_feat${n}_desc`)}
                    </p>
                  </div>
                </ScrollAnimator>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── Supported Vehicles ─────────────────────────── */}
      <section className="py-12 md:py-32 bg-[#0A0A0B]">
        <div className="max-w-[1200px] mx-auto px-6">
          <ScrollAnimator>
            <div className="text-center mb-12">
              <h2 className="font-[family-name:var(--font-heading)] font-semibold text-2xl md:text-[40px] text-[#F5F5F7] mb-3">
                {t('landing_models_title')}
              </h2>
              <p className="text-[#8E8E93] text-base">{t('landing_models_subtitle')}</p>
            </div>
          </ScrollAnimator>

          {/* Horizontal scroll on mobile, grid on desktop */}
          <div className="flex md:grid md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-x-auto pb-4 md:pb-0 snap-x snap-mandatory md:snap-none -mx-6 px-6 md:mx-0 md:px-0">
            {VINFAST_MODELS.map((car) => (
              <ScrollAnimator key={car.model} className="snap-start">
                <div className="min-w-[180px] bg-[#1C1C1E] rounded-2xl p-5 border border-[#2C2C2E] hover:border-[#2C2C2E] transition-all">
                  <div className="h-4" />

                  {/* VinFast badge */}
                  <span className="inline-block px-2 py-0.5 bg-[#00D26A]/10 text-[#00D26A] text-[11px] font-medium rounded-full mb-2">
                    VinFast
                  </span>

                  <h3 className="font-[family-name:var(--font-heading)] font-semibold text-base text-[#F5F5F7] mb-3">
                    {car.model}
                  </h3>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[#8E8E93]">{t('landing_models_range')}</span>
                      <p className="text-[#F5F5F7] font-medium">{car.rangeKm} km</p>
                    </div>
                    <div>
                      <span className="text-[#8E8E93]">{t('landing_models_battery')}</span>
                      <p className="text-[#F5F5F7] font-medium">{car.batteryKwh} kWh</p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[#8E8E93]">{t('landing_models_charge')}</span>
                      <p className="text-[#F5F5F7] font-medium">{car.dcChargeMin} min (10-80%)</p>
                    </div>
                  </div>
                </div>
              </ScrollAnimator>
            ))}

            {/* Add vehicle card */}
            <ScrollAnimator className="snap-start">
              <a
                href="/plan"
                className="min-w-[180px] h-full bg-transparent rounded-2xl p-5 border-2 border-dashed border-[#2C2C2E] hover:border-[#8E8E93] transition-all flex flex-col items-center justify-center gap-3 min-h-[240px]"
              >
                <div className="w-12 h-12 rounded-full border-2 border-dashed border-[#2C2C2E] flex items-center justify-center">
                  <span className="text-[#8E8E93] text-2xl">+</span>
                </div>
                <span className="text-[#8E8E93] text-sm text-center">{t('landing_models_add')}</span>
              </a>
            </ScrollAnimator>
          </div>
        </div>
      </section>

      {/* ─── Stats / Coverage ───────────────────────────── */}
      <section className="py-12 md:py-32 bg-[#0D1B3E]">
        <div className="max-w-[1200px] mx-auto px-6">
          <ScrollAnimator>
            <h2 className="font-[family-name:var(--font-heading)] font-semibold text-2xl md:text-[40px] text-[#F5F5F7] text-center mb-16">
              {t('landing_stats_title')}
            </h2>
          </ScrollAnimator>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
            <StatCounter value={150} suffix="+" label={t('landing_stats_stations')} />
            <StatCounter value={63} label={t('landing_stats_provinces')} />
            <StatCounter value={15} suffix="+" label={t('landing_stats_models')} />
            <div className="text-center">
              <div className="font-[family-name:var(--font-heading)] font-bold text-4xl md:text-[56px] text-[#00D26A] leading-tight">
                24/7
              </div>
              <div className="text-[#8E8E93] text-base mt-2">{t('landing_stats_free')}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FAQ ────────────────────────────────────────── */}
      <section className="py-12 md:py-32 bg-[#0A0A0B]">
        <div className="max-w-[1200px] mx-auto px-6">
          <ScrollAnimator>
            <h2 className="font-[family-name:var(--font-heading)] font-semibold text-2xl md:text-[40px] text-[#F5F5F7] text-center mb-16">
              {t('landing_faq_title')}
            </h2>
          </ScrollAnimator>

          <ScrollAnimator>
            <FAQAccordion items={faqItems} />
          </ScrollAnimator>
        </div>
      </section>

      {/* ─── Final CTA ──────────────────────────────────── */}
      <section className="py-12 md:py-32 bg-gradient-to-b from-[#0D1B3E] to-[#0A0A0B]">
        <div className="max-w-[1200px] mx-auto px-6 text-center">
          <ScrollAnimator>
            <h2 className="font-[family-name:var(--font-heading)] font-semibold text-2xl md:text-[40px] text-[#F5F5F7] mb-4">
              {t('landing_cta_h2')}
            </h2>
            <p className="text-[#8E8E93] text-base md:text-lg mb-10">
              {t('landing_cta_subtitle')}
            </p>
            <a
              href="/plan"
              className="inline-block px-12 py-4 bg-[#00D26A] text-[#0A0A0B] font-semibold text-base md:text-lg rounded-xl hover:bg-[#00E87A] transition-all cta-glow"
            >
              {t('landing_cta_button')}
            </a>
          </ScrollAnimator>
        </div>
      </section>

      {/* ─── Footer ─────────────────────────────────────── */}
      <footer className="bg-[#08080A] border-t border-[#1C1C1E]">
        <div className="max-w-[1200px] mx-auto px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Logo & tagline */}
            <div>
              <div className="font-[family-name:var(--font-heading)] font-bold text-2xl tracking-tight mb-2">
                <span className="text-[#00D26A] italic">e</span>
                <span className="text-[#F5F5F7]">Voyage</span>
              </div>
              <p className="text-[#8E8E93] text-sm font-light">
                {t('landing_footer_tagline')}
              </p>
            </div>

            {/* Links */}
            <div>
              <h4 className="text-[#8E8E93] text-xs font-medium uppercase tracking-wider mb-4">Links</h4>
              <div className="flex flex-col gap-2">
                <a href="/plan" className="text-[#F5F5F7] text-sm hover:text-[#00D4AA] transition-colors">
                  {t('landing_footer_start')}
                </a>
                <a
                  href="https://github.com/edwardpham94/evoyage"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#F5F5F7] text-sm hover:text-[#00D4AA] transition-colors"
                >
                  {t('landing_footer_github')}
                </a>
              </div>
            </div>

            {/* Built with */}
            <div>
              <h4 className="text-[#8E8E93] text-xs font-medium uppercase tracking-wider mb-4">
                {t('landing_footer_built')}
              </h4>
              <div className="flex flex-col gap-2 text-sm text-[#8E8E93]">
                <span>Next.js</span>
                <span>Mapbox</span>
                <span>VinFast API</span>
              </div>
            </div>
          </div>

          {/* Copyright */}
          <div className="border-t border-[#1C1C1E] mt-8 pt-6">
            <p className="text-[#8E8E93] text-[13px] text-center">
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
