import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyCronSecret } from '@/lib/cron-auth';
import { aggregatePopularity } from '@/lib/station/aggregate-popularity';
import { pruneStaleCaches } from '@/lib/maintenance/prune-stale-caches';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/cron/aggregate-popularity
 *
 * Daily maintenance, scheduled at 19:00 UTC (02:00 AM Vietnam) via the
 * sibling GHA workflow .github/workflows/aggregate-popularity.yml. Does two
 * things:
 *   1. Rebuilds the StationPopularity heatmap from the rolling 60-day
 *      observation window + prunes raw observations >90 days.
 *   2. Prunes RouteCache (>30d) and VinFastStationDetail (>30d) to keep two
 *      otherwise-unbounded tables in check (EVOYAGE_AUDIT_PLAN.md C12 + C16).
 *
 * Both steps are idempotent. The second step is delegated to a separate
 * pure function so that aggregate-popularity proper stays focused.
 *
 * See docs/specs/2026-05-03-station-status-data-collection-design.md §6.
 */
export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const popularity = await aggregatePopularity({ prisma });
  const caches = await pruneStaleCaches({ prisma });

  return NextResponse.json({
    ...popularity,
    routeCachePruned: caches.routeCachePruned,
    vinfastDetailPruned: caches.vinfastDetailPruned,
    cacheErrors: caches.errors,
    durationMs: Date.now() - startedAt,
  });
}
