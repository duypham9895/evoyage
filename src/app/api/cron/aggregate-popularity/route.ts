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
 *   2. Prunes the retention-bounded tables — RouteCache, VinFastStationDetail,
 *      expired ShortUrl rows and aged StationStatusReport rows — to keep
 *      otherwise-unbounded tables in check (EVOYAGE_AUDIT_PLAN.md C12 + C16).
 *
 * Both steps are idempotent. The second step is delegated to a separate
 * pure function so that aggregate-popularity proper stays focused.
 *
 * The response body is the job's only health gate: the sibling workflow greps
 * it for '"ok":false' and this route always answers HTTP 200. So `ok` is
 * composed from every step here rather than inherited from the aggregation.
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

  // aggregatePopularity keeps ok=true when only its own observation prune
  // failed — the aggregation still succeeded and must not be reported as a
  // failed rebuild. That makes its flag the wrong one to return as the job's,
  // so fold every step's errors in. Placed after the spread to override it.
  const ok = popularity.ok && popularity.errors.length === 0 && caches.ok;

  return NextResponse.json({
    ...popularity,
    ok,
    routeCachePruned: caches.routeCachePruned,
    vinfastDetailPruned: caches.vinfastDetailPruned,
    shortUrlPruned: caches.shortUrlPruned,
    statusReportPruned: caches.statusReportPruned,
    cacheErrors: caches.errors,
    durationMs: Date.now() - startedAt,
  });
}
