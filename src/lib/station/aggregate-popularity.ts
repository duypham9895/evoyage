/**
 * Daily aggregation job that rebuilds the StationPopularity heatmap from
 * the rolling 60-day window of StationStatusObservation rows, then prunes
 * observations older than 90 days.
 *
 * Pure UPSERT (no TRUNCATE) so live readers never see an empty popularity
 * table mid-run. Idempotent — re-running within the same day overwrites
 * with identical numbers.
 *
 * Aggregation timezone: Asia/Ho_Chi_Minh — Vietnamese drivers reason in
 * VN local time, so a "5 PM busy" cell must reflect 17:00 VN, not UTC.
 */
import type { PrismaClient } from '@prisma/client';

export interface AggregatePopularityDeps {
  readonly prisma: PrismaClient;
}

export interface AggregatePopularityResult {
  readonly ok: boolean;
  readonly popularityRowsUpserted: number;
  readonly observationsPruned: number;
  readonly errors: readonly string[];
}

export async function aggregatePopularity(
  deps: AggregatePopularityDeps,
): Promise<AggregatePopularityResult> {
  const { prisma } = deps;
  const errors: string[] = [];

  let popularityRowsUpserted = 0;
  try {
    popularityRowsUpserted = await prisma.$executeRaw`
      INSERT INTO "StationPopularity" (
        "stationId", "dayOfWeek", "hour",
        "busyProbability", "sampleCount", "updatedAt"
      )
      SELECT
        "stationId",
        EXTRACT(DOW  FROM "observedAt" AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS "dayOfWeek",
        EXTRACT(HOUR FROM "observedAt" AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS "hour",
        ROUND(AVG(CASE WHEN "status" = 'BUSY' THEN 1.0 ELSE 0.0 END)::numeric, 2) AS "busyProbability",
        COUNT(*)::int AS "sampleCount",
        NOW() AS "updatedAt"
      FROM "StationStatusObservation"
      WHERE "observedAt" > NOW() - INTERVAL '60 days'
      GROUP BY "stationId", "dayOfWeek", "hour"
      ON CONFLICT ("stationId", "dayOfWeek", "hour") DO UPDATE SET
        "busyProbability" = EXCLUDED."busyProbability",
        "sampleCount"     = EXCLUDED."sampleCount",
        "updatedAt"       = EXCLUDED."updatedAt"
    `;
  } catch (err) {
    return {
      ok: false,
      popularityRowsUpserted: 0,
      observationsPruned: 0,
      errors: [
        `aggregation failed: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }

  let observationsPruned = 0;
  try {
    observationsPruned = await prisma.$executeRaw`
      DELETE FROM "StationStatusObservation"
      WHERE "observedAt" < NOW() - INTERVAL '90 days'
    `;
  } catch (err) {
    errors.push(
      `prune failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return {
    ok: true,
    popularityRowsUpserted,
    observationsPruned,
    errors,
  };
}
