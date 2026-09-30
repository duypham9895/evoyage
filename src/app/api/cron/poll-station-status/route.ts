import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyCronSecret } from '@/lib/cron-auth';
import { pollStationStatus, makeDefaultDeps } from '@/lib/station/poll-status';

export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel Hobby ceiling

/**
 * POST /api/cron/poll-station-status
 *
 * Manual-recovery endpoint — NOT the live poller. Since PR #30 (2026-05-25)
 * .github/workflows/poll-station-status.yml runs
 * scripts/poll-vinfast-station-status.ts from a Chromium context on the runner,
 * because Cloudflare can 403 Vercel's server-side replay of the cached cookies.
 * This route replays them server-side, so it may fail for that same reason.
 * Nothing in this repo calls it.
 *
 * Not deleted yet only because the cron-job.org account — which
 * docs/specs/2026-05-03-station-status-data-collection-design.md §8 says still
 * has an hourly job pointed at this URL — cannot be inspected from the repo.
 * Confirm that job is gone, then delete this route.
 *
 * Pulls VinFast station statuses with cached Cloudflare cookies, dedupes
 * against the last observation per station, and inserts only the changed rows.
 *
 * Returns 200 with a result envelope even on partial failure so the
 * external cron service does not retry-storm — failure modes are signaled
 * via the `ok` and `reason` fields, not via HTTP status. The single 4xx
 * returned is 401 for invalid cron secrets.
 *
 * See docs/specs/2026-05-03-station-status-data-collection-design.md §5.
 */
export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const result = await pollStationStatus(makeDefaultDeps(prisma));

  return NextResponse.json({
    ...result,
    durationMs: Date.now() - startedAt,
  });
}
