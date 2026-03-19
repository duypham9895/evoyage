'use client';

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';

/* ─── Scroll Animation Observer ─────────────────────────── */

export function ScrollAnimator({ children, className = '' }: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('is-visible');
          observer.unobserve(el);
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -50px 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`section-animate ${className}`}>
      {children}
    </div>
  );
}

/* ─── Navbar with scroll effect ─────────────────────────── */

export function LandingNavbar({
  locale,
  onLocaleChangeAction,
  translations,
}: {
  readonly locale: 'vi' | 'en';
  readonly onLocaleChangeAction: () => void;
  readonly translations: { readonly navCta: string };
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 100);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-6 transition-all duration-300 ${
        scrolled
          ? 'bg-[#0A0A0B]/90 backdrop-blur-xl border-b border-[#1C1C1E]'
          : 'bg-transparent'
      }`}
    >
      {/* Logo */}
      <a href="/" className="font-[family-name:var(--font-heading)] font-bold text-2xl tracking-tight flex items-center gap-0.5">
        <span className="text-[#00D26A] italic">e</span>
        <span className="text-[#F5F5F7]">Voyage</span>
      </a>

      {/* Desktop right side */}
      <div className="hidden md:flex items-center gap-4">
        <button
          onClick={onLocaleChangeAction}
          className="px-3 py-1.5 text-sm text-[#8E8E93] hover:text-[#F5F5F7] transition-colors rounded-lg border border-[#2C2C2E] hover:border-[#8E8E93]"
        >
          {locale === 'vi' ? 'EN' : 'VI'}
        </button>
        <a
          href="/plan"
          className="px-5 py-2.5 bg-[#00D26A] text-[#0A0A0B] font-semibold text-sm rounded-xl hover:bg-[#00E87A] transition-all cta-glow"
        >
          {translations.navCta}
        </a>
      </div>

      {/* Mobile right side */}
      <div className="flex md:hidden items-center gap-3">
        <button
          onClick={onLocaleChangeAction}
          className="px-2 py-1 text-xs text-[#8E8E93] border border-[#2C2C2E] rounded-lg"
        >
          {locale === 'vi' ? 'EN' : 'VI'}
        </button>
        <a
          href="/plan"
          className="px-4 py-2 bg-[#00D26A] text-[#0A0A0B] font-semibold text-sm rounded-xl"
        >
          {translations.navCta}
        </a>
      </div>
    </nav>
  );
}

/* ─── FAQ Accordion ─────────────────────────────────────── */

interface FAQItemData {
  readonly question: string;
  readonly answer: string;
}

export function FAQAccordion({
  items,
}: {
  readonly items: readonly FAQItemData[];
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = useCallback((index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  }, []);

  return (
    <div className="max-w-3xl mx-auto">
      {items.map((item, i) => (
        <div key={i} className="border-b border-[#2C2C2E]">
          <button
            onClick={() => toggle(i)}
            className="w-full flex items-center justify-between py-5 text-left group"
          >
            <span className="font-[family-name:var(--font-sans)] font-medium text-base text-[#F5F5F7] pr-4 group-hover:text-[#00D4AA] transition-colors">
              {item.question}
            </span>
            <span
              className={`text-[#8E8E93] text-xl transition-transform duration-200 flex-shrink-0 ${
                openIndex === i ? 'rotate-45' : ''
              }`}
            >
              +
            </span>
          </button>
          <div
            className={`overflow-hidden transition-all duration-300 ${
              openIndex === i ? 'max-h-80 pb-5' : 'max-h-0'
            }`}
          >
            <p className="text-[#8E8E93] text-[15px] leading-relaxed">
              {item.answer}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Stat Counter with Intersection Observer ───────────── */

export function StatCounter({
  value,
  suffix = '',
  label,
}: {
  readonly value: number;
  readonly suffix?: string;
  readonly label: string;
}) {
  const [displayed, setDisplayed] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    // Respect prefers-reduced-motion: skip animation entirely
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      hasAnimated.current = true;
      setDisplayed(value);
      return;
    }

    const el = ref.current;
    if (!el) return;

    const runAnimation = () => {
      if (hasAnimated.current) return;
      hasAnimated.current = true;
      const duration = 2000;
      const start = performance.now();

      const animate = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayed(Math.round(eased * value));
        if (progress < 1) requestAnimationFrame(animate);
      };

      requestAnimationFrame(animate);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          runAnimation();
          observer.unobserve(el);
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(el);

    // Fallback: if animation hasn't started within 3s, snap to final value
    const fallbackTimer = setTimeout(() => {
      if (!hasAnimated.current) {
        hasAnimated.current = true;
        setDisplayed(value);
        observer.disconnect();
      }
    }, 3000);

    return () => {
      observer.disconnect();
      clearTimeout(fallbackTimer);
    };
  }, [value]);

  return (
    <div ref={ref} className="text-center">
      <div className="font-[family-name:var(--font-heading)] font-bold text-4xl md:text-[56px] text-[#00D26A] leading-tight">
        {displayed}{suffix}
      </div>
      <div className="text-[#8E8E93] text-base mt-2">{label}</div>
    </div>
  );
}

/* ─── Landing Page Wrapper (provides locale) ────────────── */

export function LandingWrapper({ children }: { readonly children: ReactNode }) {
  const [locale, setLocale] = useState<'vi' | 'en'>('vi');

  const toggleLocale = useCallback(() => {
    setLocale((prev) => (prev === 'vi' ? 'en' : 'vi'));
  }, []);

  return (
    <LandingLocaleContext.Provider value={{ locale, toggleLocale }}>
      {children}
    </LandingLocaleContext.Provider>
  );
}

import { createContext, useContext } from 'react';

interface LandingLocaleContextType {
  readonly locale: 'vi' | 'en';
  readonly toggleLocale: () => void;
}

const LandingLocaleContext = createContext<LandingLocaleContextType>({
  locale: 'vi',
  toggleLocale: () => {},
});

export function useLandingLocale() {
  return useContext(LandingLocaleContext);
}
