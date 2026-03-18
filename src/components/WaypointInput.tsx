'use client';

import { useCallback } from 'react';
import { useLocale } from '@/lib/locale';
import PlaceAutocomplete from './PlaceAutocomplete';
import type { NominatimResult } from '@/lib/nominatim';

export interface WaypointData {
  readonly name: string;
  readonly coords: { readonly lat: number; readonly lng: number } | null;
}

interface WaypointInputProps {
  readonly waypoints: readonly WaypointData[];
  readonly onAdd: (afterIndex: number) => void;
  readonly onRemove: (index: number) => void;
  readonly onUpdate: (index: number, name: string, coords: { lat: number; lng: number } | null) => void;
  readonly onReorder: (fromIndex: number, toIndex: number) => void;
  readonly isLoopTrip: boolean;
  readonly onToggleLoop: () => void;
  readonly startName: string;
}

const MAX_WAYPOINTS = 5;

export default function WaypointInput({
  waypoints,
  onAdd,
  onRemove,
  onUpdate,
  isLoopTrip,
  onToggleLoop,
  startName,
}: WaypointInputProps) {
  const { t } = useLocale();

  const handleSelect = useCallback(
    (index: number, result: NominatimResult) => {
      onUpdate(index, result.displayName, { lat: result.lat, lng: result.lng });
    },
    [onUpdate],
  );

  const handleTextChange = useCallback(
    (index: number, value: string) => {
      onUpdate(index, value, null);
    },
    [onUpdate],
  );

  return (
    <div className="space-y-1">
      {/* Waypoint inputs */}
      {waypoints.map((wp, i) => (
        <div key={i}>
          {/* Add button before this waypoint */}
          {i === 0 && waypoints.length < MAX_WAYPOINTS && (
            <AddStopButton onClick={() => onAdd(-1)} label={t('waypoints_add')} />
          )}

          <div className="flex items-center gap-2">
            {/* Drag handle */}
            <div
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center cursor-grab active:cursor-grabbing text-[var(--color-muted)] hover:text-[var(--color-foreground)] touch-none select-none"
              title={t('waypoints_reorder')}
            >
              ⋮⋮
            </div>

            {/* Waypoint number */}
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#3b82f6] text-white text-xs font-bold flex items-center justify-center">
              {i + 1}
            </div>

            {/* Input */}
            <div className="flex-1">
              <PlaceAutocomplete
                value={wp.name}
                onChange={(v) => handleTextChange(i, v)}
                onSelect={(r) => handleSelect(i, r)}
                label=""
                placeholder={t('waypoints_search_placeholder')}
              />
            </div>

            {/* Remove button */}
            <button
              onClick={() => onRemove(i)}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--color-danger)]/10 text-[var(--color-muted)] hover:text-[var(--color-danger)] transition-colors"
              aria-label={t('waypoints_remove')}
            >
              ✕
            </button>
          </div>

          {/* Add button after this waypoint */}
          {waypoints.length < MAX_WAYPOINTS && (
            <AddStopButton onClick={() => onAdd(i)} label={t('waypoints_add')} />
          )}
        </div>
      ))}

      {/* Add first waypoint button (when none exist) */}
      {waypoints.length === 0 && (
        <AddStopButton onClick={() => onAdd(-1)} label={t('waypoints_add')} />
      )}

      {/* Max waypoints notice */}
      {waypoints.length >= MAX_WAYPOINTS && (
        <div className="text-xs text-[var(--color-muted)] text-center py-1">
          {t('waypoints_max')}
        </div>
      )}

      {/* Loop trip toggle */}
      <button
        onClick={onToggleLoop}
        className={`w-full py-2 text-xs rounded-lg border transition-colors flex items-center justify-center gap-2 ${
          isLoopTrip
            ? 'border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/5'
            : 'border-[var(--color-surface-hover)] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]'
        }`}
      >
        <span>↻</span>
        <span>{isLoopTrip ? t('waypoints_return_to', { name: startName || '...' }) : t('waypoints_loop')}</span>
      </button>
    </div>
  );
}

function AddStopButton({ onClick, label }: { readonly onClick: () => void; readonly label: string }) {
  return (
    <div className="flex justify-center py-1">
      <button
        onClick={onClick}
        className="flex items-center gap-1 px-3 py-1 text-[10px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/5 rounded-full border border-dashed border-[var(--color-accent)]/30 hover:border-[var(--color-accent)] transition-colors"
      >
        <span>+</span>
        <span>{label}</span>
      </button>
    </div>
  );
}
