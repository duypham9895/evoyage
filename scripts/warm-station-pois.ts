/**
 * Daily warmer for the StationPois cache (Phase 4).
 *
 * Picks the top N most-recently-verified VinFast stations, fetches tiered
 * amenities for each (shared with the amenities route via station-pois.ts, so
 * the cached envelope is one the route can read), and upserts into StationPois so
 * first-time-user latency on those stations is <50ms (cache hit) instead of
 * ~1.5s (Overpass round-trip).
 *
 * Selection rule: most recently `lastVerifiedAt` (proxy for "active"
 * stations users care about); fall back to most-recently `scrapedAt` when
 * verification data is sparse.
 *
 * Run: npx tsx scripts/warm-station-pois.ts
 */
import { createPrismaClient } from '../src/lib/prisma';
import { OverpassError } from '../src/lib/station/overpass-client';
import { cacheExpiresAt, envelope, fetchAmenityRows } from '../src/lib/station/station-pois';

const prisma = createPrismaClient();

const TOP_N = 50;
const REQUEST_PAUSE_MS = 3000; // be polite to Overpass: ~20 req/min
// Stop before the workflow's 15-minute timeout kills the job, so the run
// ends with a summary instead of "cancelled".
const RUN_BUDGET_MS = 12 * 60 * 1000;

async function main(): Promise<void> {
  console.log(`=== StationPois cache warmer ===\nTarget: top ${TOP_N} stations\n`);

  const stations = await prisma.chargingStation.findMany({
    where: { provider: 'VinFast' },
    orderBy: [{ lastVerifiedAt: { sort: 'desc', nulls: 'last' } }, { scrapedAt: 'desc' }],
    take: TOP_N,
    select: { id: true, name: true, latitude: true, longitude: true },
  });

  console.log(`Selected ${stations.length} stations.\n`);

  const startedAt = Date.now();
  let warmed = 0;
  let failed = 0;
  let skipped = 0;
  let notReached = 0;

  for (const [i, st] of stations.entries()) {
    const label = `[${i + 1}/${stations.length}] ${st.name}`;
    try {
      const { rows, failure } = await fetchAmenityRows(st.latitude, st.longitude);

      const expiresAt = cacheExpiresAt(failure);
      await prisma.stationPois.upsert({
        where: { stationId: st.id },
        create: { stationId: st.id, poisJson: envelope(rows, failure), expiresAt },
        update: { poisJson: envelope(rows, failure), fetchedAt: new Date(), expiresAt },
      });

      if (failure) {
        console.warn(`${label}: 0 POIs (drive band FAILED: ${failure}; cached 1h)`);
        failed++;
      } else if (rows.length === 0) {
        console.log(`${label}: 0 POIs (cached empty)`);
        skipped++;
      } else {
        console.log(`${label}: ${rows.length} POIs`);
        warmed++;
      }
    } catch (err) {
      const kind = err instanceof OverpassError ? err.kind : 'unknown';
      const status = err instanceof OverpassError && err.statusCode ? ` HTTP ${err.statusCode}` : '';
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`${label}: FAILED (${kind}${status}) ${message}`);
      failed++;
      // Backoff harder on rate limit
      if (err instanceof OverpassError && err.kind === 'rate_limited') {
        console.log('  Backing off 30s on rate limit...');
        await new Promise((r) => setTimeout(r, 30_000));
      }
    }

    if (Date.now() - startedAt >= RUN_BUDGET_MS) {
      notReached = stations.length - i - 1;
      if (notReached > 0) {
        console.log(`\nRun budget (${RUN_BUDGET_MS / 60_000} min) used up; stopping early.`);
      }
      break;
    }

    // Politeness pause between requests (skip last)
    if (i < stations.length - 1) {
      await new Promise((r) => setTimeout(r, REQUEST_PAUSE_MS));
    }
  }

  console.log(
    `\nDone. Warmed ${warmed}, empty ${skipped}, failed ${failed}, not reached ${notReached}.`,
  );
}

main()
  .catch((err) => {
    console.error('Cache warmer failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
