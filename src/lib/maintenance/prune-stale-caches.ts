/**
 * Nightly retention prune for the tables that otherwise grow without bound.
 * Started as the two caches the audit flagged in EVOYAGE_AUDIT_PLAN.md C12 +
 * C16; extended for the three tables NEW-OPS-8 found in the same class.
 *
 * - RouteCache: read-side is gated by a 24h TTL in src/lib/routing/route-cache.ts,
 *   so anything older than ~1 day is already dead weight. 30-day prune is
 *   intentionally generous — gives a buffer if a future TTL bump lands.
 * - VinFastStationDetail: cached SSE detail blobs from VinFast. No read-side
 *   TTL; we trust upstream and re-fetch on demand. Prune anything not
 *   touched in 30 days so the table doesn't drift toward XL.
 * - ShortUrl: backs links people may still be opening, so only rows the
 *   resolver already refuses are eligible — resolveShortUrl() returns null
 *   once expiresAt has passed (src/lib/short-url.ts:105), which makes deleting
 *   an expired row observationally identical to keeping it. The extra 30-day
 *   grace leaves room to raise the 1-year TTL retroactively before rows go.
 *   Rows with expiresAt = NULL are the pre-Phase-2 legacy links that never
 *   expire on read; deleting one WOULD break a live link, so they are excluded
 *   and still need a manual decision.
 * - StationStatusReport: crowdsourced 1-tap reports. Nothing reads the rows —
 *   the only consumer is ChargingStation.lastVerifiedAt, denormalized at write
 *   time (src/app/api/stations/[id]/status-report/route.ts:139) — so this is
 *   trend history only. 180 days keeps two full observation windows.
 *
 * - StationReliability / StationPopularity: derived aggregates, rebuilt nightly
 *   by aggregate-reliability.ts (30-day window) and aggregate-popularity.ts
 *   (60-day window). Both upserts set their freshness column to NOW(), so a row
 *   the latest run did not touch is one whose station produced no observations
 *   inside the window — its score is frozen evidence the aggregation itself no
 *   longer has. Two eligibility rules, both conservative:
 *     1. the station no longer exists (orphan) — unusable either way;
 *     2. the row is behind the NEWEST row in its own table by more than the
 *        grace window. Measured against MAX(freshness), not NOW(), on purpose:
 *        if the cron stalls, every row ages together, none falls behind the
 *        newest, and the prune deletes nothing. A wall-clock window would empty
 *        both tables during an outage and silently strip ADR-0007 ranking and
 *        the heatmap of their input.
 *   Tradeoff to be aware of: poll-status.ts only records status *changes*, so a
 *   station that is stably broken also stops emitting and will eventually lose
 *   its bad score along with its penalty. That is consistent with ADR-0007's own
 *   definition (reliability is the 30-day window, and an absent station has no
 *   window), but it is a behavior change, not just cleanup.
 *
 * Deliberately NOT pruned: Feedback. It is user-submitted correspondence with
 * a status lifecycle, not a cache, and deleting it destroys the record of what
 * someone reported. Its cost is the Vercel Blob images behind `imageUrl`, which
 * need a blob-side cleanup rather than a row DELETE — out of scope here.
 *
 * Retention windows are a product decision, not a technical one: confirm the
 * 30-day ShortUrl grace, the 180-day StationStatusReport window, and the
 * 60-day StationReliability / 90-day StationPopularity grace windows (each one
 * aggregation window plus 30 days) before treating them as settled.
 *
 * Every step is independent: one failure is recorded and the rest still run,
 * and `ok` is false if any step failed. Callers must surface that flag — it is
 * the nightly job's only health signal.
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
  readonly shortUrlPruned: number;
  readonly statusReportPruned: number;
  readonly reliabilityPruned: number;
  readonly popularityPruned: number;
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

  let shortUrlPruned = 0;
  try {
    shortUrlPruned = await prisma.$executeRaw`
      DELETE FROM "ShortUrl"
      WHERE "expiresAt" IS NOT NULL
        AND "expiresAt" < NOW() - INTERVAL '30 days'
    `;
  } catch (err) {
    errors.push(
      `ShortUrl prune failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let statusReportPruned = 0;
  try {
    statusReportPruned = await prisma.$executeRaw`
      DELETE FROM "StationStatusReport"
      WHERE "createdAt" < NOW() - INTERVAL '180 days'
    `;
  } catch (err) {
    errors.push(
      `StationStatusReport prune failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let reliabilityPruned = 0;
  try {
    reliabilityPruned = await prisma.$executeRaw`
      DELETE FROM "StationReliability" AS r
      WHERE NOT EXISTS (
              SELECT 1 FROM "ChargingStation" AS s WHERE s."id" = r."stationId"
            )
         OR r."computedAt" <
              (SELECT MAX("computedAt") FROM "StationReliability")
              - INTERVAL '60 days'
    `;
  } catch (err) {
    errors.push(
      `StationReliability prune failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let popularityPruned = 0;
  try {
    popularityPruned = await prisma.$executeRaw`
      DELETE FROM "StationPopularity" AS p
      WHERE NOT EXISTS (
              SELECT 1 FROM "ChargingStation" AS s WHERE s."id" = p."stationId"
            )
         OR p."updatedAt" <
              (SELECT MAX("updatedAt") FROM "StationPopularity")
              - INTERVAL '90 days'
    `;
  } catch (err) {
    errors.push(
      `StationPopularity prune failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return {
    ok: errors.length === 0,
    routeCachePruned,
    vinfastDetailPruned,
    shortUrlPruned,
    statusReportPruned,
    reliabilityPruned,
    popularityPruned,
    errors,
  };
}
