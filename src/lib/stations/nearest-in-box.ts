import { Prisma, type ChargingStation } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export interface NearestInBoxQuery {
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLng: number;
  readonly maxLng: number;
  /** Rows are ordered by distance from this point before the limit applies. */
  readonly center: { readonly lat: number; readonly lng: number };
  /** undefined = no filter. */
  readonly vinFastOnly?: boolean;
  /** Must already be allowlisted by the caller; null/undefined = no filter. */
  readonly provider?: string | null;
  readonly limit: number;
}

/**
 * Stations inside a lat/lng box, nearest to `center` first, capped at `limit`.
 *
 * The cap must apply AFTER the distance ordering: a 10-25 km box in HCMC or
 * Hanoi holds more than 500 stations, and capping first (by name, or in storage
 * order) dropped the nearest ones. Equirectangular distance is exact enough to
 * order rows inside a box of at most 5°. Every value is a bound parameter.
 */
export async function findStationsInBoxNearest(q: NearestInBoxQuery): Promise<ChargingStation[]> {
  const { lat, lng } = q.center;
  return prisma.$queryRaw<ChargingStation[]>(Prisma.sql`
    SELECT * FROM "ChargingStation"
    WHERE "latitude" BETWEEN ${q.minLat} AND ${q.maxLat}
      AND "longitude" BETWEEN ${q.minLng} AND ${q.maxLng}
      ${q.vinFastOnly === undefined ? Prisma.empty : Prisma.sql`AND "isVinFastOnly" = ${q.vinFastOnly}`}
      ${q.provider ? Prisma.sql`AND "provider" = ${q.provider}` : Prisma.empty}
    ORDER BY POWER("latitude" - ${lat}, 2) + POWER(("longitude" - ${lng}) * COS(RADIANS(${lat})), 2) ASC, "name" ASC
    LIMIT ${q.limit}
  `);
}
