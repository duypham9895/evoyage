'use client';

import { useLocale } from '@/lib/locale';
import { useMapMode } from '@/lib/map-mode';
import type { MapMode } from '@/types';

const MAP_MODES: readonly { readonly mode: MapMode; readonly label: string }[] = [
  { mode: 'osm', label: 'OSM' },
  { mode: 'mapbox', label: 'Mapbox' },
];

export default function Header() {
  const { locale, toggleLocale } = useLocale();
  const { mode, setMode } = useMapMode();

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  return (
    <header className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3 bg-[var(--color-surface)] border-b border-[var(--color-surface-hover)] z-50 relative">
      {/* Logo */}
      <a href="/" className="flex items-center gap-1.5 shrink-0">
        <span className="text-lg sm:text-xl font-bold font-[family-name:var(--font-heading)] tracking-tight">
          <span className="text-[var(--color-safe)] italic">e</span>
          <span className="text-[var(--color-foreground)]">Voyage</span>
        </span>
      </a>

      {/* Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Map mode toggle */}
        <div className="flex items-center gap-0.5 bg-[var(--color-background)] rounded-lg border border-[var(--color-surface-hover)] p-0.5">
          {MAP_MODES.map(({ mode: m, label }) => {
            const isDisabled = m === 'mapbox' && !mapboxToken;
            return (
              <button
                key={m}
                onClick={() => !isDisabled && setMode(m)}
                disabled={isDisabled}
                title={isDisabled ? 'Mapbox token not configured' : undefined}
                className={`px-2 py-1.5 sm:px-2.5 sm:py-1 text-xs rounded-md transition-all min-w-[40px] ${
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
