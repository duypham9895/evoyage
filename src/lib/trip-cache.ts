import type { TripPlan } from '@/types';

interface CachedTrip {
  readonly data: TripPlan;
  readonly expiresAt: number;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour

const tripCache = new Map<string, CachedTrip>();

/**
 * Store a trip plan in the in-memory cache with a 1-hour TTL.
 */
export function cacheTripPlan(tripId: string, plan: TripPlan): void {
  // Clean expired entries periodically (every 100 writes)
  if (tripCache.size > 0 && tripCache.size % 100 === 0) {
    pruneExpired();
  }

  tripCache.set(tripId, {
    data: plan,
    expiresAt: Date.now() + TTL_MS,
  });
}

/**
 * Retrieve a cached trip plan by ID. Returns null if not found or expired.
 */
export function getCachedTripPlan(tripId: string): TripPlan | null {
  const entry = tripCache.get(tripId);

  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    tripCache.delete(tripId);
    return null;
  }

  return entry.data;
}

/**
 * Remove all expired entries from the cache.
 */
function pruneExpired(): void {
  const now = Date.now();
  for (const [key, entry] of tripCache) {
    if (now > entry.expiresAt) {
      tripCache.delete(key);
    }
  }
}
