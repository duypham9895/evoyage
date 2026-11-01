import type { PrismaClient } from '@prisma/client';
import type { VinfastLocatorRaw } from './vinfast-api-client';

export interface OutOfServicePartition {
  /** Rows to send to the bulk upsert (everything except OUTOFSERVICE). */
  readonly toUpsert: readonly VinfastLocatorRaw[];
  /** DB ids of stations we already hold that the feed now reports OUTOFSERVICE. */
  readonly outOfServiceExistingIds: readonly string[];
  /** OUTOFSERVICE rows with no existing station: still skipped, never inserted. */
  readonly skippedNew: number;
}

/**
 * Splits the crawl feed so an existing station that goes OUTOFSERVICE gets its
 * status written instead of silently keeping the old one (#84). The route
 * planner excludes stations by ChargingStation.chargingStatus alone, so a
 * stale ACTIVE there keeps a broken charger routable.
 *
 * Matches on ocmId (`vinfast-<store_id>`) only: the upsert writes rows solely
 * through ON CONFLICT ("ocmId"), and entityId is not unique, so an
 * entityId-only match could hide a different, working station from routing.
 */
export function partitionOutOfService(
  stations: readonly VinfastLocatorRaw[],
  existingByOcmId: ReadonlyMap<string, string>,
): OutOfServicePartition {
  const toUpsert: VinfastLocatorRaw[] = [];
  const outOfServiceIds = new Set<string>();
  let skippedNew = 0;

  for (const s of stations) {
    if (s.charging_status !== 'OUTOFSERVICE') {
      toUpsert.push(s);
      continue;
    }
    const existingId = existingByOcmId.get(`vinfast-${s.store_id}`);
    if (existingId) {
      outOfServiceIds.add(existingId);
    } else {
      skippedNew++;
    }
  }

  return { toUpsert, outOfServiceExistingIds: [...outOfServiceIds], skippedNew };
}

/** Writes chargingStatus = 'OUTOFSERVICE' on the given VinFast station ids, in batches. */
export async function markExistingOutOfService(
  prisma: PrismaClient,
  ids: readonly string[],
  batchSize: number,
): Promise<number> {
  let marked = 0;
  for (let i = 0; i < ids.length; i += batchSize) {
    const { count } = await prisma.chargingStation.updateMany({
      where: { id: { in: ids.slice(i, i + batchSize) }, provider: 'VinFast' },
      data: { chargingStatus: 'OUTOFSERVICE' },
    });
    marked += count;
  }
  return marked;
}
