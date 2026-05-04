'use client';

/**
 * Phase 4 — Charging Stop Amenities panel.
 *
 * Lazy-fetched POI list nested inside the existing stop expand pane.
 * Per project DESIGN.md "Less Icons, More Humanity": no decorative
 * icons; category is signaled by a colored dot and a text label.
 *
 * UX states:
 *   loading → skeleton text "Finding nearby places..."
 *   empty   → "No nearby place data" + Google Maps fallback link
 *   ready   → up to N rows, sorted by walking minutes ascending
 *   error   → same as empty (fail-soft, never block the user)
 *
 * Each row is a tappable <a> that opens Google Maps at the POI's
 * coordinates — works on iOS/Android natively without any platform
 * detection logic.
 */
import { useEffect, useState } from 'react';
import { useLocale } from '@/lib/locale';
import { trackAmenitiesViewed, trackAmenityTapped } from '@/lib/analytics';
import type { AmenityCategory } from '@/lib/station/categorize-poi';

type Tier = 'walk' | 'drive';

interface AmenityRow {
  readonly id: number;
  readonly name: string | null;
  readonly amenity: string;
  readonly category: AmenityCategory;
  readonly tier: Tier;
  readonly walkingMinutes: number;
  readonly drivingMinutes?: number;
  readonly distanceMeters: number;
  readonly lat: number;
  readonly lng: number;
}

interface ApiResponse {
  readonly pois: readonly AmenityRow[];
  readonly cachedAt: string | null;
  readonly fromCache: boolean;
}

interface StationAmenitiesProps {
  readonly stationId: string;
  readonly stationLat: number;
  readonly stationLng: number;
}

type State =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'ready'; pois: readonly AmenityRow[] };

const CATEGORY_DOT_COLOR: Record<AmenityCategory, string> = {
  'quick-bite': 'bg-[var(--color-accent)]',
  'sit-down': 'bg-[var(--color-safe)]',
  essentials: 'bg-[var(--color-warn)]',
  fuel: 'bg-[var(--color-muted)]',
};

function googleMapsPoiUrl(lat: number, lng: number, name: string | null): string {
  const q = name ? `${name} @${lat},${lng}` : `${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function googleMapsAreaUrl(lat: number, lng: number): string {
  // Generic "look around this point" search — works as the empty-state fallback
  return `https://www.google.com/maps/@${lat},${lng},17z`;
}

export default function StationAmenities({
  stationId,
  stationLat,
  stationLng,
}: StationAmenitiesProps) {
  const { t } = useLocale();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    // Don't use cache: 'force-cache' — when the server cache row content
    // changes (e.g. tiered-radius patch invalidating the v1 envelope), a
    // browser-cached empty response would mask the new data forever for
    // returning users. Server-side Postgres cache already gives 30-day TTL.
    fetch(`/api/stations/${stationId}/amenities`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return (await res.json()) as ApiResponse;
      })
      .then((data) => {
        if (cancelled) return;
        trackAmenitiesViewed(stationId, data.fromCache, data.pois?.length ?? 0);
        if (!data.pois || data.pois.length === 0) {
          setState({ kind: 'empty' });
        } else {
          setState({ kind: 'ready', pois: data.pois });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setState({ kind: 'empty' });
      });
    return () => {
      cancelled = true;
    };
  }, [stationId]);

  if (state.kind === 'loading') {
    return (
      <div className="text-xs text-[var(--color-muted)] pt-2">
        {t('amenities_loading' as Parameters<typeof t>[0])}
      </div>
    );
  }

  if (state.kind === 'empty') {
    return (
      <div className="text-xs text-[var(--color-muted)] pt-2 space-y-1">
        <div>{t('amenities_empty' as Parameters<typeof t>[0])}</div>
        <a
          href={googleMapsAreaUrl(stationLat, stationLng)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--color-accent)] hover:underline"
        >
          {t('amenities_google_maps_fallback' as Parameters<typeof t>[0])}
        </a>
      </div>
    );
  }

  function handleReportMissing() {
    window.dispatchEvent(new CustomEvent('evoyage:open-feedback'));
  }

  function renderRow(poi: AmenityRow) {
    const fallbackKey = (
      poi.category === 'sit-down'
        ? 'amenities_unnamed_sit_down'
        : poi.category === 'quick-bite'
          ? 'amenities_unnamed_quick_bite'
          : poi.category === 'essentials'
            ? 'amenities_unnamed_essentials'
            : 'amenities_unnamed_fuel'
    ) as Parameters<typeof t>[0];
    const displayName = poi.name ?? t(fallbackKey);
    const dotCls = CATEGORY_DOT_COLOR[poi.category];
    const timeKey = (
      poi.tier === 'drive' ? 'amenities_driving_minutes' : 'amenities_walking_minutes'
    ) as Parameters<typeof t>[0];
    const minutes = poi.tier === 'drive' ? (poi.drivingMinutes ?? 1) : poi.walkingMinutes;
    return (
      <li key={poi.id}>
        <a
          href={googleMapsPoiUrl(poi.lat, poi.lng, poi.name)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackAmenityTapped(poi.category, poi.walkingMinutes)}
          className="flex items-center gap-2 py-1 text-xs hover:underline"
        >
          <span className={`w-2 h-2 rounded-full ${dotCls} shrink-0`} aria-hidden="true" />
          <span className="flex-1 truncate text-[var(--color-foreground)]">{displayName}</span>
          <span className="text-[var(--color-muted)] font-[family-name:var(--font-mono)] text-[10px] shrink-0">
            {t(timeKey, { minutes: String(minutes) })}
          </span>
        </a>
      </li>
    );
  }

  const walkPois = state.pois.filter((p) => p.tier === 'walk');
  const drivePois = state.pois.filter((p) => p.tier === 'drive');

  return (
    <div className="pt-2 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          {t('amenities_heading' as Parameters<typeof t>[0])}
        </h4>
        <button
          type="button"
          onClick={handleReportMissing}
          className="text-[10px] text-[var(--color-muted)] hover:text-[var(--color-accent)]"
        >
          {t('amenities_report_missing' as Parameters<typeof t>[0])}
        </button>
      </div>
      {walkPois.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-medium text-[var(--color-muted)]">
            {t('amenities_section_walk' as Parameters<typeof t>[0])}
          </div>
          <ol role="list" className="space-y-1">
            {walkPois.map(renderRow)}
          </ol>
        </div>
      )}
      {drivePois.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-medium text-[var(--color-muted)]">
            {t('amenities_section_drive' as Parameters<typeof t>[0])}
          </div>
          <ol role="list" className="space-y-1">
            {drivePois.map(renderRow)}
          </ol>
        </div>
      )}
    </div>
  );
}
