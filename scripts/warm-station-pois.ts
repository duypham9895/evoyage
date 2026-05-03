/**
 * Daily warmer for the StationPois cache (Phase 4).
 *
 * Picks the top N most-recently-verified VinFast stations, queries Overpass
 * for each, decorates with walking-time, and upserts into StationPois so
 * first-time-user latency on those stations is <50ms (cache hit) instead of
 * ~1.5s (Overpass round-trip).
 *
 * Selection rule: most recently `lastVerifiedAt` (proxy for "active"
 * stations users care about); fall back to most-recently `scrapedAt` when
 * verification data is sparse.
 *
 * Run: npx tsx scripts/warm-station-pois.ts
 */
import { PrismaClient } from '@prisma/client';
import { queryNearbyPois, OverpassError, type OsmPoi } from '../src/lib/station/overpass-client';
import { categorizePoi, type AmenityCategory } from '../src/lib/station/categorize-poi';
import { haversineMeters, walkingTimeMinutes } from '../src/lib/station/walking-distance';

const prisma = new PrismaClient();

const TOP_N = 50;
const SEARCH_RADIUS_METERS = 500;
const MAX_WALKING_TIME_MIN = 7;
const CACHE_TTL_DAYS = 30;
const REQUEST_PAUSE_MS = 3000; // be polite to Overpass: ~20 req/min

interface AmenityRow {
  readonly id: number;
  readonly name: string | null;
  readonly amenity: string;
  readonly category: AmenityCategory;
  readonly walkingMinutes: number;
  readonly distanceMeters: number;
  readonly lat: number;
  readonly lng: number;
}

function decorate(stationLat: number, stationLng: number) {
  return (poi: OsmPoi): AmenityRow | null => {
    const category = categorizePoi(poi);
    if (!category) return null;
    const distance = haversineMeters(
      { lat: stationLat, lng: stationLng },
      { lat: poi.lat, lng: poi.lng },
    );
    const walkRoundTrip = walkingTimeMinutes(distance) * 2;
    if (walkRoundTrip > MAX_WALKING_TIME_MIN) return null;
    return {
      id: poi.id,
      name: poi.name,
      amenity: poi.amenity,
      category,
      walkingMinutes: walkingTimeMinutes(distance),
      distanceMeters: Math.round(distance),
      lat: poi.lat,
      lng: poi.lng,
    };
  };
}

async function main(): Promise<void> {
  console.log(`=== StationPois cache warmer ===\nTarget: top ${TOP_N} stations\n`);

  const stations = await prisma.chargingStation.findMany({
    where: { provider: 'VinFast' },
    orderBy: [{ lastVerifiedAt: { sort: 'desc', nulls: 'last' } }, { scrapedAt: 'desc' }],
    take: TOP_N,
    select: { id: true, name: true, latitude: true, longitude: true },
  });

  console.log(`Selected ${stations.length} stations.\n`);

  let warmed = 0;
  let failed = 0;
  let skipped = 0;

  for (const [i, st] of stations.entries()) {
    const label = `[${i + 1}/${stations.length}] ${st.name}`;
    try {
      const pois = await queryNearbyPois({
        lat: st.latitude,
        lng: st.longitude,
        radiusMeters: SEARCH_RADIUS_METERS,
      });

      const rows = pois
        .map(decorate(st.latitude, st.longitude))
        .filter((r): r is AmenityRow => r !== null)
        .sort((a, b) => a.walkingMinutes - b.walkingMinutes);

      const expiresAt = new Date(Date.now() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);
      await prisma.stationPois.upsert({
        where: { stationId: st.id },
        create: { stationId: st.id, poisJson: JSON.stringify(rows), expiresAt },
        update: { poisJson: JSON.stringify(rows), fetchedAt: new Date(), expiresAt },
      });

      if (rows.length === 0) {
        console.log(`${label}: 0 POIs (cached empty)`);
        skipped++;
      } else {
        console.log(`${label}: ${rows.length} POIs`);
        warmed++;
      }
    } catch (err) {
      const kind = err instanceof OverpassError ? err.kind : 'unknown';
      console.warn(`${label}: FAILED (${kind})`);
      failed++;
      // Backoff harder on rate limit
      if (err instanceof OverpassError && err.kind === 'rate_limited') {
        console.log('  Backing off 30s on rate limit...');
        await new Promise((r) => setTimeout(r, 30_000));
      }
    }

    // Politeness pause between requests (skip last)
    if (i < stations.length - 1) {
      await new Promise((r) => setTimeout(r, REQUEST_PAUSE_MS));
    }
  }

  console.log(`\nDone. Warmed ${warmed}, empty ${skipped}, failed ${failed}.`);
}

main()
  .catch((err) => {
    console.error('Cache warmer failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
