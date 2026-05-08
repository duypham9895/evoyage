/**
 * Daily aggregation job that rebuilds the StationReliability score from the
 * rolling 30-day window of StationStatusObservation rows.
 *
 * reliability = (count of status ∈ {ACTIVE, BUSY}) / (total observations)
 *
 * Pure UPSERT (no TRUNCATE) so live readers never see an empty reliability
 * table mid-run. Idempotent — re-running with the same data produces the
 * same result. Companion to aggregate-popularity (which owns observation
 * pruning); this job does not delete from StationStatusObservation.
 *
 * See ADR-0007 for the design and ADR-0006 for the consumer (scoreStation).
 */
import type { PrismaClient } from '@prisma/client';

export interface AggregateReliabilityDeps {
  readonly prisma: PrismaClient;
}

export interface AggregateReliabilityResult {
  readonly ok: boolean;
  readonly stationsUpserted: number;
  readonly errors: readonly string[];
}

export async function aggregateReliability(
  deps: AggregateReliabilityDeps,
): Promise<AggregateReliabilityResult> {
  const { prisma } = deps;

  try {
    const stationsUpserted = await prisma.$executeRaw`
      INSERT INTO "StationReliability" (
        "stationId", "reliability", "observationCount", "computedAt"
      )
      SELECT
        "stationId",
        ROUND(
          AVG(CASE WHEN "status" IN ('ACTIVE', 'BUSY') THEN 1.0 ELSE 0.0 END)::numeric,
          2
        ) AS "reliability",
        COUNT(*)::int AS "observationCount",
        NOW() AS "computedAt"
      FROM "StationStatusObservation"
      WHERE "observedAt" > NOW() - INTERVAL '30 days'
      GROUP BY "stationId"
      ON CONFLICT ("stationId") DO UPDATE SET
        "reliability"      = EXCLUDED."reliability",
        "observationCount" = EXCLUDED."observationCount",
        "computedAt"       = EXCLUDED."computedAt"
    `;
    return { ok: true, stationsUpserted, errors: [] };
  } catch (err) {
    return {
      ok: false,
      stationsUpserted: 0,
      errors: [
        `aggregation failed: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
}
