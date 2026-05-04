/**
 * Phase 3b — Station popularity prediction query.
 *
 * Reads the nightly-aggregated `StationPopularity` heatmap and returns a
 * verdict for the user's expected arrival hour at this station. The
 * heatmap is built by `aggregate-popularity` from the rolling 60-day
 * window of `StationStatusObservation`.
 *
 * Calibration thresholds chosen to be HONEST about uncertainty:
 *  - 20 samples per (station, dayOfWeek, hour) cell before predicting
 *  - 0.6 probability separates "ready busy" from "ready free"
 *  - +0.15 boost inside a travel-heavy holiday window (capped at 1.0)
 *
 * Pure-ish: takes Prisma as a dep so tests don't need a real DB.
 */
import type { PrismaClient } from '@prisma/client';
import { isHoliday } from '@/lib/trip/vietnam-holidays';

export const POPULARITY_SAMPLE_THRESHOLD = 20;
export const POPULARITY_BUSY_THRESHOLD = 0.6;
const HOLIDAY_BOOST = 0.15;

export interface QueryStationPopularityArgs {
  readonly prisma: PrismaClient;
  readonly stationId: string;
  readonly arrivalAtIso: string;
}

export interface ReadyVerdict {
  readonly kind: 'ready';
  readonly busyProbability: number;
  readonly sampleCount: number;
  readonly dayOfWeek: number;
  readonly hour: number;
  readonly isHolidayBoosted: boolean;
}

export interface InsufficientDataVerdict {
  readonly kind: 'insufficient-data';
}

export type PopularityVerdict = ReadyVerdict | InsufficientDataVerdict;

const VN_DOW_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Ho_Chi_Minh',
  weekday: 'short',
});
const VN_HOUR_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  hour12: false,
});

const DOW_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function vnDayOfWeek(date: Date): number {
  return DOW_MAP[VN_DOW_FORMATTER.format(date)] ?? 0;
}

function vnHour(date: Date): number {
  // Some locales render '24' for midnight; normalize to 0
  const raw = parseInt(VN_HOUR_FORMATTER.format(date), 10);
  return raw === 24 ? 0 : raw;
}

export async function queryStationPopularity(
  args: QueryStationPopularityArgs,
): Promise<PopularityVerdict> {
  const { prisma, stationId, arrivalAtIso } = args;
  const arrivalAt = new Date(arrivalAtIso);
  const dayOfWeek = vnDayOfWeek(arrivalAt);
  const hour = vnHour(arrivalAt);

  const row = await prisma.stationPopularity.findUnique({
    where: {
      stationId_dayOfWeek_hour: {
        stationId,
        dayOfWeek,
        hour,
      },
    },
  });

  if (!row || row.sampleCount < POPULARITY_SAMPLE_THRESHOLD) {
    return { kind: 'insufficient-data' };
  }

  // Decimal columns from Prisma serialize as strings/Decimal — coerce safely
  const baseProbability = Number(row.busyProbability);

  let busyProbability = baseProbability;
  let isHolidayBoosted = false;
  const holiday = isHoliday(arrivalAt);
  if (holiday && holiday.kind === 'travel-heavy') {
    busyProbability = Math.min(1.0, baseProbability + HOLIDAY_BOOST);
    isHolidayBoosted = true;
  }

  return {
    kind: 'ready',
    busyProbability: Math.round(busyProbability * 100) / 100,
    sampleCount: row.sampleCount,
    dayOfWeek,
    hour,
    isHolidayBoosted,
  };
}
