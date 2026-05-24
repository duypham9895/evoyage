/**
 * Nightly retention prune for two unbounded-growth caches the audit flagged
 * in EVOYAGE_AUDIT_PLAN.md C12 + C16:
 *
 * - RouteCache: read-side is gated by a 24h TTL in src/lib/routing/route-cache.ts,
 *   so anything older than ~1 day is already dead weight. 30-day prune is
 *   intentionally generous — gives a buffer if a future TTL bump lands.
 * - VinFastStationDetail: cached SSE detail blobs from VinFast. No read-side
 *   TTL; we trust upstream and re-fetch on demand. Prune anything not
 *   touched in 30 days so the table doesn't drift toward XL.
 *
 * Pure-ish: prisma is injected so tests can mock without touching real DB.
 * Aggregation timezone is irrelevant here (calendar-day boundaries don't
 * matter for cache retention).
 */
import type { PrismaClient } from '@prisma/client';

export interface PruneStaleCachesDeps {
  readonly prisma: PrismaClient;
}

export interface PruneStaleCachesResult {
  readonly ok: boolean;
  readonly routeCachePruned: number;
  readonly vinfastDetailPruned: number;
  readonly errors: readonly string[];
}

export async function pruneStaleCaches(
  deps: PruneStaleCachesDeps,
): Promise<PruneStaleCachesResult> {
  const { prisma } = deps;
  const errors: string[] = [];

  let routeCachePruned = 0;
  try {
    routeCachePruned = await prisma.$executeRaw`
      DELETE FROM "RouteCache"
      WHERE "createdAt" < NOW() - INTERVAL '30 days'
    `;
  } catch (err) {
    errors.push(
      `RouteCache prune failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let vinfastDetailPruned = 0;
  try {
    vinfastDetailPruned = await prisma.$executeRaw`
      DELETE FROM "VinFastStationDetail"
      WHERE "fetchedAt" < NOW() - INTERVAL '30 days'
    `;
  } catch (err) {
    errors.push(
      `VinFastStationDetail prune failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return {
    ok: errors.length === 0,
    routeCachePruned,
    vinfastDetailPruned,
    errors,
  };
}
