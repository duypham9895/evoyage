'use client';

import { useLocale } from '@/lib/locale';
import { useMapMode } from '@/lib/map-mode';

export default function Header() {
  const { locale, toggleLocale, t } = useLocale();
  const { mode, setMode } = useMapMode();

  return (
    <header className="flex items-center justify-between px-4 py-3 bg-[var(--color-surface)] border-b border-[var(--color-surface-hover)]">
      <div className="flex items-center gap-2">
        <span className="text-xl font-bold font-[family-name:var(--font-heading)] text-[var(--color-accent)]">
          ⚡ EVoyage
        </span>
      </div>
      <div className="flex items-center gap-3">
        {/* Map mode toggle */}
        <div className="flex items-center gap-1.5 bg-[var(--color-background)] rounded-lg border border-[var(--color-surface-hover)] p-0.5">
          <button
            onClick={() => setMode('leaflet')}
            className={`px-2.5 py-1 text-xs rounded-md transition-all ${
              mode === 'leaflet'
                ? 'bg-[var(--color-accent)] text-[var(--color-background)] font-bold'
                : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)]'
            }`}
            aria-label="Use Leaflet map"
          >
            {t('Bản đồ', 'Map')}
          </button>
          <button
            onClick={() => setMode('google')}
            className={`px-2.5 py-1 text-xs rounded-md transition-all ${
              mode === 'google'
                ? 'bg-[var(--color-accent)] text-[var(--color-background)] font-bold'
                : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)]'
            }`}
            aria-label="Use Google Maps"
          >
            Google
          </button>
        </div>

        {/* Language toggle */}
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
