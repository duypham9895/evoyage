'use client';

import { useCallback } from 'react';
import { useLocale } from '@/lib/locale';
import PlaceAutocomplete from './PlaceAutocomplete';
import type { NominatimResult } from '@/lib/nominatim';

interface TripInputProps {
  readonly start: string;
  readonly end: string;
  readonly onStartChange: (value: string) => void;
  readonly onEndChange: (value: string) => void;
  readonly onStartSelect?: (result: NominatimResult) => void;
  readonly onEndSelect?: (result: NominatimResult) => void;
  readonly isLoaded: boolean;
}

export default function TripInput({
  start,
  end,
  onStartChange,
  onEndChange,
  onStartSelect,
  onEndSelect,
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

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold font-[family-name:var(--font-heading)] text-[var(--color-muted)] uppercase tracking-wider">
        {t('trip_route')}
      </h2>

      <div className="space-y-2">
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

        <PlaceAutocomplete
          value={end}
          onChange={onEndChange}
          onSelect={handleEndSelect}
          label={t('destination')}
          placeholder={t('destination_placeholder')}
        />
      </div>
    </div>
  );
}
