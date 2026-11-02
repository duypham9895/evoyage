/**
 * Freshness check on the station-status pipeline: how old is the newest
 * StationStatusObservation row?
 *
 * The aggregate crons report `ok` from their own SQL only, so a dead poller
 * left them green for weeks (docs/bugs/2026-11-01-p2-cron-silent-noops-and-observability.md,
 * Finding A). This check catches a stall even when a trickle of rows exists.
 *
 * Never throws: a failed query is reported as unhealthy.
 */
import type { PrismaClient } from '@prisma/client';

/**
 * The poller runs every 2 h, so 24 h is about 12 missed polls. Deliberately
 * loose so VinFast-side skips do not page; the bug doc suggests ~4 h.
 */
export const OBSERVATION_MAX_AGE_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

export interface ObservationFreshnessDeps {
  readonly prisma: PrismaClient;
  readonly now?: Date;
  readonly maxAgeHours?: number;
}

export interface ObservationFreshness {
  readonly ok: boolean;
  readonly lastObservedAt: Date | null;
  readonly ageHours: number | null;
  readonly error?: string;
}

export async function checkObservationFreshness(
  deps: ObservationFreshnessDeps,
): Promise<ObservationFreshness> {
  const { prisma, now = new Date(), maxAgeHours = OBSERVATION_MAX_AGE_HOURS } = deps;

  try {
    const { _max } = await prisma.stationStatusObservation.aggregate({
      _max: { observedAt: true },
    });
    const lastObservedAt = _max.observedAt;
    if (!lastObservedAt) {
      return { ok: false, lastObservedAt: null, ageHours: null, error: 'no observations at all' };
    }

    const ageHours = Math.round(((now.getTime() - lastObservedAt.getTime()) / HOUR_MS) * 10) / 10;
    if (ageHours > maxAgeHours) {
      return {
        ok: false,
        lastObservedAt,
        ageHours,
        error: `newest observation is ${ageHours}h old, older than the ${maxAgeHours}h limit`,
      };
    }
    return { ok: true, lastObservedAt, ageHours };
  } catch (err) {
    return {
      ok: false,
      lastObservedAt: null,
      ageHours: null,
      error: `freshness check failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
