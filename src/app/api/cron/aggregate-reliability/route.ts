import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyCronSecret } from '@/lib/cron-auth';
import { aggregateReliability } from '@/lib/station/aggregate-reliability';

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
 * See docs/adr/0007-station-reliability-ranking.md.
 */
export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const result = await aggregateReliability({ prisma });

  return NextResponse.json({
    ...result,
    durationMs: Date.now() - startedAt,
  });
}
