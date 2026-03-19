import { prisma } from '@/lib/prisma';

/**
 * Resolve a charging station's VinFast entity_id from the database.
 * The entity_id is populated by the daily refresh-vinfast cron job
 * which syncs all stations from vinfastauto.com/vn_vi/get-locators.
 */
export async function resolveEntityId(stationId: string): Promise<{
  readonly entityId: string | null;
  readonly storeId: string | null;
}> {
  const station = await prisma.chargingStation.findUnique({
    where: { id: stationId },
    select: { entityId: true, storeId: true, ocmId: true },
  });

  if (!station) return { entityId: null, storeId: null };

  const storeId = station.ocmId?.startsWith('vinfast-')
    ? station.ocmId.replace('vinfast-', '')
    : station.storeId ?? null;

  if (station.entityId) {
    return { entityId: station.entityId, storeId };
  }

  return { entityId: null, storeId };
}
