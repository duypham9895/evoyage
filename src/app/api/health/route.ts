import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkObservationFreshness } from '@/lib/station/observation-freshness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 *
 * Public, unauthenticated liveness + data-freshness probe (Finding C of
 * docs/bugs/2026-11-01-p2-cron-silent-noops-and-observability.md). Used by the
 * post-deploy smoke step in .github/workflows/deploy.yml.
 *
 * - 200 when the DB answers. Stale observations are reported, not failed on:
 *   a data outage must not fail a code deploy. The crons alert on staleness.
 * - 503 when the DB does not answer. The body carries no error detail.
 *
 * Only timestamps and an age leave this route, never row contents. A healthy
 * answer is CDN-cached for 30 s so anonymous traffic cannot drive DB load.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const [freshness, crawl] = await Promise.all([
      checkObservationFreshness({ prisma }),
      prisma.chargingStation.aggregate({ _max: { scrapedAt: true } }),
    ]);

    return NextResponse.json(
      {
        ok: true,
        db: 'up',
        observations: {
          stale: !freshness.ok,
          lastObservedAt: freshness.lastObservedAt,
          ageHours: freshness.ageHours,
        },
        lastCrawledAt: crawl._max.scrapedAt,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=30' } },
    );
  } catch (err) {
    console.error('[health] database check failed:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, db: 'down' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
