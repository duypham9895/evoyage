'use client';

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import Link from 'next/link';

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
          ? 'bg-[var(--color-background)]/90 backdrop-blur-xl border-b border-[var(--color-surface)]'
          : 'bg-transparent'
      }`}
    >
      {/* Logo */}
      <Link href="/" className="font-[family-name:var(--font-heading)] font-bold text-2xl tracking-tight flex items-center gap-0.5">
        <span className="text-[var(--color-accent)] italic">e</span>
        <span className="text-[var(--color-foreground)]">Voyage</span>
      </Link>

      {/* Desktop right side */}
      <div className="hidden md:flex items-center gap-4">
        <button
          onClick={onLocaleChangeAction}
          className="px-3 py-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors rounded-lg border border-[var(--color-surface-hover)] hover:border-[var(--color-muted)]"
        >
          {locale === 'vi' ? 'EN' : 'VI'}
        </button>
        <a
          href="/plan"
          className="px-5 py-2.5 bg-[var(--color-accent)] text-[var(--color-background)] font-semibold text-sm rounded-xl hover:bg-[var(--color-accent-dim)] transition-all cta-glow"
        >
          {translations.navCta}
        </a>
      </div>

      {/* Mobile right side */}
      <div className="flex md:hidden items-center gap-3">
        <button
          onClick={onLocaleChangeAction}
          className="px-2 py-1 text-xs text-[var(--color-muted)] border border-[var(--color-surface-hover)] rounded-lg"
        >
          {locale === 'vi' ? 'EN' : 'VI'}
        </button>
        <a
          href="/plan"
          className="px-4 py-2 bg-[var(--color-accent)] text-[var(--color-background)] font-semibold text-sm rounded-xl"
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
        <div key={i} className="border-b border-[var(--color-surface-hover)]">
          <button
            onClick={() => toggle(i)}
            className="w-full flex items-center justify-between py-5 text-left group"
          >
            <span className="font-[family-name:var(--font-sans)] font-medium text-base text-[var(--color-foreground)] pr-4 group-hover:text-[var(--color-accent)] transition-colors">
              {item.question}
            </span>
            <span
              className={`text-[var(--color-muted)] text-xl transition-transform duration-200 flex-shrink-0 ${
                openIndex === i ? 'rotate-45' : ''
              }`}
            >
              +
            </span>
          </button>
          <div
            className={`overflow-hidden transition-all duration-300 ${
              openIndex === i ? 'max-h-[500px] pb-5' : 'max-h-0'
            }`}
          >
            <p className="text-[var(--color-muted)] text-[15px] leading-relaxed">
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
  // Lazy initializer reads prefers-reduced-motion at mount so we can snap
  // straight to the final value without a setState-in-effect (which the
  // react-hooks lint rule flags as a cascading-render anti-pattern).
  const [displayed, setDisplayed] = useState(() => {
    if (typeof window === 'undefined') return 0;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? value : 0;
  });
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (hasAnimated.current) return;

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
      <div className="font-[family-name:var(--font-heading)] font-bold text-4xl md:text-[56px] text-[var(--color-accent)] leading-tight">
        {displayed}{suffix}
      </div>
      <div className="text-[var(--color-muted)] text-base mt-2">{label}</div>
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
