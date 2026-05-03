import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyCronSecret } from '@/lib/cron-auth';
import { aggregatePopularity } from '@/lib/station/aggregate-popularity';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/cron/aggregate-popularity
 *
 * Daily aggregation, scheduled at 19:00 UTC (02:00 AM Vietnam) by
 * cron-job.org. Rebuilds the StationPopularity heatmap from the rolling
 * 60-day observation window and prunes raw observations older than 90 days.
 *
 * Idempotent: re-running on the same day overwrites identical numbers.
 *
 * See docs/specs/2026-05-03-station-status-data-collection-design.md §6.
 */
export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const result = await aggregatePopularity({ prisma });

  return NextResponse.json({
    ...result,
    durationMs: Date.now() - startedAt,
  });
}
