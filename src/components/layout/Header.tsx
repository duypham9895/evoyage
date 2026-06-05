'use client';

import Link from 'next/link';
import { useLocale } from '@/lib/locale';

export default function Header() {
  const { locale, toggleLocale } = useLocale();

  return (
    <header className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3 bg-[var(--color-surface)] border-b border-[var(--color-surface-hover)] z-50 relative">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-1.5 shrink-0">
        <span className="text-lg sm:text-xl font-bold font-[family-name:var(--font-heading)] tracking-tight">
          <span className="text-[var(--color-safe)] italic">e</span>
          <span className="text-[var(--color-foreground)]">Voyage</span>
        </span>
      </Link>

      {/* Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Language toggle */}
        <button
          onClick={toggleLocale}
          className="px-3 py-2.5 sm:px-3 sm:py-1.5 min-h-[44px] min-w-[44px] text-xs sm:text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors rounded-lg border border-[var(--color-surface-hover)] hover:border-[var(--color-muted)]"
          aria-label="Toggle language"
        >
          {locale === 'vi' ? 'EN' : 'VI'}
        </button>
      </div>
    </header>
  );
}
