'use client';

import { useLocale } from '@/lib/locale';
import { useMapMode } from '@/lib/map-mode';
import type { MapMode } from '@/types';

const MAP_MODES: readonly { readonly mode: MapMode; readonly label: string }[] = [
  { mode: 'osm', label: 'OSM' },
  { mode: 'mapbox', label: 'Mapbox' },
  { mode: 'google', label: 'Google' },
];

export default function Header() {
  const { locale, toggleLocale, t } = useLocale();
  const { mode, setMode } = useMapMode();

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  return (
    <header className="flex items-center justify-between px-4 py-3 bg-[var(--color-surface)] border-b border-[var(--color-surface-hover)]">
      <div className="flex items-center gap-2">
        <span className="text-xl font-bold font-[family-name:var(--font-heading)] text-[var(--color-accent)]">
          ⚡ EVoyage
        </span>
      </div>
      <div className="flex items-center gap-3">
        {/* Map mode toggle */}
        <div className="flex items-center gap-1 bg-[var(--color-background)] rounded-lg border border-[var(--color-surface-hover)] p-0.5">
          {MAP_MODES.map(({ mode: m, label }) => {
            const isDisabled = m === 'mapbox' && !mapboxToken;
            return (
              <button
                key={m}
                onClick={() => !isDisabled && setMode(m)}
                disabled={isDisabled}
                title={isDisabled ? 'Mapbox token not configured' : undefined}
                className={`px-2.5 py-1 text-xs rounded-md transition-all ${
                  mode === m
                    ? 'bg-[var(--color-accent)] text-[var(--color-background)] font-bold'
                    : isDisabled
                      ? 'text-[var(--color-muted)] opacity-40 cursor-not-allowed'
                      : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)]'
                }`}
                aria-label={`Use ${label} map`}
              >
                {label}
              </button>
            );
          })}
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
