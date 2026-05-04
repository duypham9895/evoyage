'use client';

/**
 * Phase 3b — Per-stop popularity callout.
 *
 * Three visual states (per spec §3c):
 *   - insufficient-data: muted "chưa đủ dữ liệu"
 *   - ready + busy ≥ 0.6: warning chip "Thường đông Thứ 6 17h" + reservation
 *     CTA when the station has a VinFast storeId
 *   - ready + busy < 0.6: subtle "Thường rảnh Thứ 6 17h"
 *
 * Pure presentational: parent supplies the verdict + station identifiers
 * + i18n bag with format functions. Tests don't need a locale provider.
 */
import { buildVinfastReservationUrl } from '@/lib/station/vinfast-reservation-url';
import { POPULARITY_BUSY_THRESHOLD } from '@/lib/station/popularity-query';
import type { PopularityVerdict } from '@/types';

export interface StopPopularityI18n {
  readonly insufficient: string;
  readonly formatBusy: (
    probability: number,
    dayOfWeek: number,
    hour: number,
    isHolidayBoosted: boolean,
  ) => string;
  readonly formatFree: (dayOfWeek: number, hour: number) => string;
  readonly reserveCta: string;
}

interface StopPopularityProps {
  readonly verdict: PopularityVerdict | undefined;
  readonly station: { readonly storeId?: string | null; readonly stationCode?: string | null };
  readonly i18n: StopPopularityI18n;
}

export default function StopPopularity({ verdict, station, i18n }: StopPopularityProps) {
  if (!verdict) return null;

  if (verdict.kind === 'insufficient-data') {
    return (
      <div
        data-testid="stop-popularity-insufficient"
        className="text-[11px] text-[var(--color-muted)] italic"
      >
        {i18n.insufficient}
      </div>
    );
  }

  const isBusy = verdict.busyProbability >= POPULARITY_BUSY_THRESHOLD;
  const reservationUrl = isBusy
    ? buildVinfastReservationUrl({
        storeId: station.storeId ?? null,
        stationCode: station.stationCode ?? null,
      })
    : null;

  return (
    <div
      data-testid={isBusy ? 'stop-popularity-busy' : 'stop-popularity-free'}
      className={`text-xs space-y-1 ${
        isBusy ? 'text-[var(--color-warn)]' : 'text-[var(--color-muted)]'
      }`}
    >
      <div>
        {isBusy
          ? i18n.formatBusy(
              verdict.busyProbability,
              verdict.dayOfWeek,
              verdict.hour,
              verdict.isHolidayBoosted,
            )
          : i18n.formatFree(verdict.dayOfWeek, verdict.hour)}
      </div>
      {reservationUrl && (
        <a
          href={reservationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-[var(--color-accent)] hover:underline"
        >
          {i18n.reserveCta}
        </a>
      )}
    </div>
  );
}
