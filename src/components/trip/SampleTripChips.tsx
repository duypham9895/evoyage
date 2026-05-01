'use client';

import { useLocale } from '@/lib/locale';

interface SampleTripChipsProps {
  readonly start: string;
  readonly end: string;
  readonly onPick: (trip: { start: string; end: string }) => void;
}

const SAMPLE_TRIPS = [
  { startKey: 'sample_trip_hcm_dalat_start', endKey: 'sample_trip_hcm_dalat_end' },
  { startKey: 'sample_trip_hcm_vungtau_start', endKey: 'sample_trip_hcm_vungtau_end' },
  { startKey: 'sample_trip_hanoi_halong_start', endKey: 'sample_trip_hanoi_halong_end' },
  { startKey: 'sample_trip_danang_hue_start', endKey: 'sample_trip_danang_hue_end' },
] as const;

export default function SampleTripChips({ start, end, onPick }: SampleTripChipsProps) {
  const { t } = useLocale();

  if (start.trim().length > 0 || end.trim().length > 0) {
    return null;
  }

  const sectionLabel = t('sample_trip_chips_label');

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--color-muted)] font-medium">{sectionLabel}</p>
      <div
        className="flex flex-nowrap gap-2 overflow-x-auto -mx-1 px-1 pb-1"
        aria-label={sectionLabel}
        style={{ scrollbarWidth: 'none' }}
      >
        {SAMPLE_TRIPS.map(({ startKey, endKey }) => {
          const startLabel = t(startKey as Parameters<typeof t>[0]);
          const endLabel = t(endKey as Parameters<typeof t>[0]);
          return (
            <button
              key={startKey}
              type="button"
              onClick={() => onPick({ start: startLabel, end: endLabel })}
              className="flex-shrink-0 inline-flex items-center min-h-[40px] px-3.5 py-2 rounded-full bg-[var(--color-accent-subtle)] border border-[var(--color-accent)]/20 text-[var(--color-accent)] text-sm font-medium hover:bg-[var(--color-accent)]/20 active:scale-[0.98] transition-all whitespace-nowrap"
            >
              {startLabel} → {endLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}
