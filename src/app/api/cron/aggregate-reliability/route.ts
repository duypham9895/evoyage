import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyCronSecret } from '@/lib/cron-auth';
import { aggregateReliability } from '@/lib/station/aggregate-reliability';
import { checkObservationFreshness } from '@/lib/station/observation-freshness';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/cron/aggregate-reliability
 *
 * Daily aggregation that rebuilds the StationReliability score from the
 * rolling 30-day window of StationStatusObservation rows. Companion to
 * aggregate-popularity (which owns observation pruning); this job does
 * not delete from StationStatusObservation.
 *
 * Idempotent: re-running on the same day overwrites identical numbers.
 *
 * `ok` also requires fresh observations: an empty 30-day window upserts 0 rows
 * without any SQL error, which kept this job green while the poller was dead
 * (docs/bugs/2026-11-01-p2-cron-silent-noops-and-observability.md). The sibling
 * workflow fails the run on '"ok":false'.
 *
 * See docs/adr/0007-station-reliability-ranking.md.
 */
export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const result = await aggregateReliability({ prisma });
  const freshness = await checkObservationFreshness({ prisma });

  // Placed after the spread so the job's own flag cannot override it.
  return NextResponse.json({
    ...result,
    ok: result.ok && freshness.ok,
    freshness,
    durationMs: Date.now() - startedAt,
  });
}
