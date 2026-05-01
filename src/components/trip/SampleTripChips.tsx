'use client';

import { useLocale } from '@/lib/locale';

interface SampleTripChipsProps {
  readonly start: string;
  readonly end: string;
  readonly onPick: (trip: { start: string; end: string }) => void;
}

interface SampleTrip {
  readonly startVi: string;
  readonly endVi: string;
  readonly startEn: string;
  readonly endEn: string;
}

// Sample trips chosen for first-time visitor familiarity:
// HCMC pair (Đà Lạt + Vũng Tàu) — most-searched outbound routes from the south.
// Hà Nội → Hạ Long — the iconic northern weekend trip.
// Đà Nẵng → Huế — central region, shortest of the four.
const SAMPLE_TRIPS: readonly SampleTrip[] = [
  {
    startVi: 'Quận 1, TP.HCM',
    endVi: 'Đà Lạt',
    startEn: 'District 1, HCMC',
    endEn: 'Da Lat',
  },
  {
    startVi: 'Quận 1, TP.HCM',
    endVi: 'Vũng Tàu',
    startEn: 'District 1, HCMC',
    endEn: 'Vung Tau',
  },
  {
    startVi: 'Hà Nội',
    endVi: 'Hạ Long',
    startEn: 'Hanoi',
    endEn: 'Ha Long',
  },
  {
    startVi: 'Đà Nẵng',
    endVi: 'Huế',
    startEn: 'Da Nang',
    endEn: 'Hue',
  },
];

// Hardcoded copy pending orchestrator integration into en.json/vi.json.
// See LOCALE_KEYS_TO_ADD.md at repo root.
const LABEL_COPY = {
  vi: 'Gợi ý cho bạn',
  en: 'Try a sample trip',
};

export default function SampleTripChips({ start, end, onPick }: SampleTripChipsProps) {
  const { locale } = useLocale();

  // Hide as soon as the user types meaningful content in either field.
  // `trim()` so that pure whitespace doesn't suppress the helper.
  if (start.trim().length > 0 || end.trim().length > 0) {
    return null;
  }

  const sectionLabel = LABEL_COPY[locale];

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--color-muted)] font-medium">{sectionLabel}</p>
      <div
        className="flex flex-nowrap gap-2 overflow-x-auto -mx-1 px-1 pb-1"
        aria-label={sectionLabel}
        style={{ scrollbarWidth: 'none' }}
      >
        {SAMPLE_TRIPS.map((trip) => {
          const startLabel = locale === 'vi' ? trip.startVi : trip.startEn;
          const endLabel = locale === 'vi' ? trip.endVi : trip.endEn;
          const display = `${startLabel} → ${endLabel}`;
          return (
            <button
              key={`${trip.startVi}-${trip.endVi}`}
              type="button"
              onClick={() =>
                onPick({
                  start: locale === 'vi' ? trip.startVi : trip.startEn,
                  end: locale === 'vi' ? trip.endVi : trip.endEn,
                })
              }
              className="flex-shrink-0 inline-flex items-center min-h-[40px] px-3.5 py-2 rounded-full bg-[var(--color-accent-subtle)] border border-[var(--color-accent)]/20 text-[var(--color-accent)] text-sm font-medium hover:bg-[var(--color-accent)]/20 active:scale-[0.98] transition-all whitespace-nowrap"
            >
              {display}
            </button>
          );
        })}
      </div>
    </div>
  );
}
