'use client';

import { useCallback, useState, useEffect } from 'react';
import { useLocale } from '@/lib/locale';
import PlaceAutocomplete from './PlaceAutocomplete';
import WaypointInput from './WaypointInput';
import type { WaypointData } from './WaypointInput';
import type { NominatimResult } from '@/lib/nominatim';

interface TripInputProps {
  readonly start: string;
  readonly end: string;
  readonly onStartChange: (value: string) => void;
  readonly onEndChange: (value: string) => void;
  readonly onStartSelect?: (result: NominatimResult) => void;
  readonly onEndSelect?: (result: NominatimResult) => void;
  // Waypoint props (optional for backward compatibility)
  readonly waypoints?: readonly WaypointData[];
  readonly onAddWaypoint?: (afterIndex: number) => void;
  readonly onRemoveWaypoint?: (index: number) => void;
  readonly onUpdateWaypoint?: (index: number, name: string, coords: { lat: number; lng: number } | null) => void;
  readonly onReorderWaypoints?: (fromIndex: number, toIndex: number) => void;
  readonly isLoopTrip?: boolean;
  readonly onToggleLoop?: () => void;
}

/** Shorten Nominatim display name to first 2-3 meaningful parts */
function shortenDisplayName(name: string): string {
  const parts = name.split(', ');
  // Remove country (last part) and zip code-like parts
  const meaningful = parts.filter(p => !/^\d{4,}$/.test(p.trim()) && p.trim() !== 'Việt Nam' && p.trim() !== 'Vietnam');
  // Keep first 2-3 parts for a concise display
  return meaningful.slice(0, Math.min(meaningful.length, 3)).join(', ');
}

export default function TripInput({
  start,
  end,
  onStartChange,
  onEndChange,
  onStartSelect,
  onEndSelect,
  waypoints,
  onAddWaypoint,
  onRemoveWaypoint,
  onUpdateWaypoint,
  onReorderWaypoints,
  isLoopTrip = false,
  onToggleLoop,
}: TripInputProps) {
  const { t } = useLocale();

  const handleStartSelect = useCallback(
    (result: NominatimResult) => {
      onStartChange(shortenDisplayName(result.displayName));
      onStartSelect?.(result);
    },
    [onStartChange, onStartSelect],
  );

  const handleEndSelect = useCallback(
    (result: NominatimResult) => {
      onEndChange(shortenDisplayName(result.displayName));
      onEndSelect?.(result);
    },
    [onEndChange, onEndSelect],
  );

  const hasWaypoints = waypoints && onAddWaypoint && onRemoveWaypoint && onUpdateWaypoint && onReorderWaypoints && onToggleLoop;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold font-[family-name:var(--font-heading)] text-[var(--color-muted)] uppercase tracking-wider">
        {t('trip_route')}
      </h2>

      <div className="space-y-2">
        {/* Start point */}
        <PlaceAutocomplete
          value={start}
          onChange={onStartChange}
          onSelect={handleStartSelect}
          label={t('starting_point')}
          placeholder={t('starting_point_placeholder')}
          showGpsButton
        />

        <div className="flex justify-center">
          <div className="w-px h-4 bg-[var(--color-surface-hover)]" />
        </div>

        {/* Waypoints (if enabled) */}
        {hasWaypoints && (
          <>
            <WaypointInput
              waypoints={waypoints}
              onAdd={onAddWaypoint}
              onRemove={onRemoveWaypoint}
              onUpdate={onUpdateWaypoint}
              onReorder={onReorderWaypoints}
              isLoopTrip={isLoopTrip}
              onToggleLoop={onToggleLoop}
              startName={start}
            />
            <div className="flex justify-center">
              <div className="w-px h-4 bg-[var(--color-surface-hover)]" />
            </div>
          </>
        )}

        {/* End point */}
        {isLoopTrip && start ? (
          <div className="p-3 bg-[var(--color-surface)] rounded-lg border border-[var(--color-accent)]/30 text-sm text-[var(--color-accent)]">
            ↻ {t('waypoints_return_to', { name: start })}
          </div>
        ) : (
          <PlaceAutocomplete
            value={end}
            onChange={onEndChange}
            onSelect={handleEndSelect}
            label={t('destination')}
            placeholder={t('destination_placeholder')}
          />
        )}
      </div>

      {/* Recent trips — show when both inputs are empty */}
      {!start && !end && <RecentTrips onSelect={(s, e) => { onStartChange(s); onEndChange(e); }} />}
    </div>
  );
}

/** Recent trips saved in localStorage */
function RecentTrips({ onSelect }: { readonly onSelect: (start: string, end: string) => void }) {
  const { t } = useLocale();
  const [trips, setTrips] = useState<readonly { start: string; end: string; vehicleName?: string | null; timestamp: number }[]>([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('ev-recent-trips') ?? '[]');
      if (!Array.isArray(saved)) return;
      const valid = saved.filter(
        (t: unknown): t is { start: string; end: string; vehicleName?: string | null; timestamp: number } =>
          typeof t === 'object' && t !== null && typeof (t as Record<string, unknown>).start === 'string' && typeof (t as Record<string, unknown>).end === 'string'
      );
      if (valid.length > 0) {
        setTrips(valid.slice(0, 3));
      }
    } catch { /* ignore corrupted localStorage */ }
  }, []);

  if (trips.length === 0) return null;

  return (
    <div className="mt-3">
      <div className="text-xs text-[var(--color-muted)] mb-2">{t('recent_trips' as Parameters<typeof t>[0])}</div>
      <div className="space-y-1.5">
        {trips.map((trip, i) => (
          <button
            key={i}
            onClick={() => onSelect(trip.start, trip.end)}
            className="w-full text-left px-3 py-2.5 rounded-lg bg-[var(--color-background)] border border-[var(--color-surface-hover)] hover:border-[var(--color-accent)]/30 transition-colors"
          >
            <div className="text-sm truncate">
              {trip.start.split(',')[0]} → {trip.end.split(',')[0]}
            </div>
            {trip.vehicleName && (
              <div className="text-xs text-[var(--color-muted)] mt-0.5">{trip.vehicleName}</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
