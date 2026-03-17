'use client';

import { useLocale } from '@/lib/locale';

export default function Header() {
  const { locale, toggleLocale, t } = useLocale();

  return (
    <header className="flex items-center justify-between px-4 py-3 bg-[var(--color-surface)] border-b border-[var(--color-surface-hover)]">
      <div className="flex items-center gap-2">
        <span className="text-xl font-bold font-[family-name:var(--font-heading)] text-[var(--color-accent)]">
          ⚡ EVoyage
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-[var(--color-muted)]">
          {t('Ngôn ngữ', 'Language')}
        </span>
        <button
          onClick={toggleLocale}
          className="px-3 py-1.5 text-sm rounded-lg bg-[var(--color-background)] border border-[var(--color-surface-hover)] hover:border-[var(--color-accent)] transition-colors"
          aria-label="Toggle language"
        >
          {locale === 'vi' ? '🇻🇳 VI → 🇬🇧 EN' : '🇬🇧 EN → 🇻🇳 VI'}
        </button>
      </div>
    </header>
  );
}
