'use client';

import { useCallback } from 'react';
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
  readonly isLoaded: boolean;
  // Waypoint props (optional for backward compatibility)
  readonly waypoints?: readonly WaypointData[];
  readonly onAddWaypoint?: (afterIndex: number) => void;
  readonly onRemoveWaypoint?: (index: number) => void;
  readonly onUpdateWaypoint?: (index: number, name: string, coords: { lat: number; lng: number } | null) => void;
  readonly onReorderWaypoints?: (fromIndex: number, toIndex: number) => void;
  readonly isLoopTrip?: boolean;
  readonly onToggleLoop?: () => void;
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
      onStartChange(result.displayName);
      onStartSelect?.(result);
    },
    [onStartChange, onStartSelect],
  );

  const handleEndSelect = useCallback(
    (result: NominatimResult) => {
      onEndChange(result.displayName);
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
    </div>
  );
}
