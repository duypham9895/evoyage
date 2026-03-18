import { prisma } from '@/lib/prisma';

const CACHE_TTL_HOURS = 24;

interface CachedRoute {
  readonly polyline: string;
  readonly distanceMeters: number;
  readonly durationSeconds: number;
}

/**
 * Generate a cache key from start/end coordinates and provider.
 * Uses rounded coords (4 decimal places ~11m precision) for better cache hits.
 */
function makeCacheKey(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  provider: string,
): { startPlaceId: string; endPlaceId: string } {
  return {
    startPlaceId: `${provider}:${startLat.toFixed(4)},${startLng.toFixed(4)}`,
    endPlaceId: `${provider}:${endLat.toFixed(4)},${endLng.toFixed(4)}`,
  };
}

/** Look up a cached route. Returns null if not found or expired. */
export async function getCachedRoute(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  provider: string,
): Promise<CachedRoute | null> {
  const { startPlaceId, endPlaceId } = makeCacheKey(startLat, startLng, endLat, endLng, provider);
  const cutoff = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000);

  const cached = await prisma.routeCache.findUnique({
    where: { startPlaceId_endPlaceId: { startPlaceId, endPlaceId } },
  });

  if (!cached || cached.createdAt < cutoff) {
    return null;
  }

  return {
    polyline: cached.polyline,
    distanceMeters: cached.distanceMeters,
    durationSeconds: cached.durationSeconds,
  };
}

/** Store a route in the cache. */
export async function setCachedRoute(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  provider: string,
  route: CachedRoute,
): Promise<void> {
  const { startPlaceId, endPlaceId } = makeCacheKey(startLat, startLng, endLat, endLng, provider);

  await prisma.routeCache.upsert({
    where: { startPlaceId_endPlaceId: { startPlaceId, endPlaceId } },
    update: {
      polyline: route.polyline,
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      createdAt: new Date(),
    },
    create: {
      startPlaceId,
      endPlaceId,
      polyline: route.polyline,
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
    },
  });
}
