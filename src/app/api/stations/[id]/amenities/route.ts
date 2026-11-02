import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, getClientIp, stationsLimiter } from '@/lib/rate-limit';
import {
  cacheExpiresAt,
  envelope,
  failureKind,
  fetchAmenityRows,
  readCachedPois,
  type AmenityFetchResult,
} from '@/lib/station/station-pois';

/**
 * GET /api/stations/[id]/amenities
 *
 * Phase 4 + 2026-05-04 tiered-radius patch. Returns categorized OSM POIs
 * around a charging station in two tiers:
 *
 *   walk  — within 500m, round-trip walk ≤ 7 min
 *   drive — within 1500m (only queried if walk tier is empty)
 *
 * Cached in Postgres for 30 days; an Overpass failure is cached for 1 hour
 * with a `failure` marker so the UI can say "unavailable", not "nothing
 * nearby". Tuning changes invalidate cache via the POIS_SCHEMA_VERSION
 * envelope (mismatch ⇒ refetch); no DB migration needed.
 *
 * See docs/specs/2026-05-04-amenities-tiered-radius.md.
 */

// Interactive budget: one try per stage, 8s each (the warmer keeps 30s + retry).
const OVERPASS_OPTIONS = { timeoutMs: 8_000, retries: 0 } as const;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: stationId } = await params;

  const ip = getClientIp(request);
  const limit = await checkRateLimit(`amenities:${ip}`, 30, 60_000, stationsLimiter);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests', retryAfter: limit.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  const station = await prisma.chargingStation.findUnique({
    where: { id: stationId },
    select: { latitude: true, longitude: true },
  });
  if (!station) {
    return NextResponse.json({ error: 'Station not found' }, { status: 404 });
  }

  // Cache hit (with schema-version match) → short-circuit
  const cached = await prisma.stationPois.findUnique({ where: { stationId } });
  if (cached && cached.expiresAt > new Date()) {
    const hit = readCachedPois(cached.poisJson);
    if (hit) {
      return NextResponse.json({
        pois: hit.rows,
        cachedAt: cached.fetchedAt.toISOString(),
        fromCache: true,
        ...(hit.failure ? { error: hit.failure } : {}),
      });
    }
    // Schema mismatch → fall through to refetch (and overwrite the row).
  }

  // Stage 1 walk band, Stage 2 drive band (see station-pois.ts).
  let result: AmenityFetchResult;
  try {
    result = await fetchAmenityRows(station.latitude, station.longitude, OVERPASS_OPTIONS);
  } catch (err) {
    return overpassFallback(stationId, cached, err);
  }

  const { rows: allRows, failure } = result;
  const expiresAt = cacheExpiresAt(failure);
  await prisma.stationPois.upsert({
    where: { stationId },
    create: { stationId, poisJson: envelope(allRows, failure), expiresAt },
    update: { poisJson: envelope(allRows, failure), fetchedAt: new Date(), expiresAt },
  });

  return NextResponse.json({
    pois: allRows,
    cachedAt: new Date().toISOString(),
    fromCache: false,
    ...(failure ? { error: failure } : {}),
  });
}

async function overpassFallback(
  stationId: string,
  cached: { poisJson: string; fetchedAt: Date } | null,
  err: unknown,
): Promise<NextResponse> {
  const kind = failureKind(err);
  // Stage 1 failure: surface stale rows if any so the user still sees
  // *something*, and keep that row for the next successful fetch to replace.
  const stale = cached ? readCachedPois(cached.poisJson) : null;
  if (cached && stale && !stale.failure && stale.rows.length > 0) {
    return NextResponse.json({
      pois: stale.rows,
      cachedAt: cached.fetchedAt.toISOString(),
      fromCache: true,
      staleReason: kind,
    });
  }

  // Nothing worth serving: cache the failure briefly so the next views don't
  // each wait on Overpass again. A DB error here must not turn into a 500.
  const poisJson = envelope([], kind);
  const expiresAt = cacheExpiresAt(kind);
  try {
    await prisma.stationPois.upsert({
      where: { stationId },
      create: { stationId, poisJson, expiresAt },
      update: { poisJson, fetchedAt: new Date(), expiresAt },
    });
  } catch (dbErr) {
    console.error('[amenities] failed to cache Overpass failure', dbErr);
  }
  return NextResponse.json({
    pois: [],
    cachedAt: null,
    fromCache: false,
    error: kind,
  });
}
