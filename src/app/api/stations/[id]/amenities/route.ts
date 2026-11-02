import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, getClientIp, stationsLimiter } from '@/lib/rate-limit';
import { OverpassError } from '@/lib/station/overpass-client';
import {
  envelope,
  fetchAmenityRows,
  readCachedRows,
  type AmenityRow,
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
 * Cached in Postgres for 30 days. Tuning changes invalidate cache via the
 * POIS_SCHEMA_VERSION envelope (mismatch ⇒ refetch); no DB migration needed.
 *
 * See docs/specs/2026-05-04-amenities-tiered-radius.md.
 */

const CACHE_TTL_DAYS = 30;

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
    const rows = readCachedRows(cached.poisJson);
    if (rows) {
      return NextResponse.json({
        pois: rows,
        cachedAt: cached.fetchedAt.toISOString(),
        fromCache: true,
      });
    }
    // Schema mismatch → fall through to refetch (and overwrite the row).
  }

  // Stage 1 walk band, Stage 2 drive band (see station-pois.ts).
  let allRows: AmenityRow[];
  try {
    allRows = await fetchAmenityRows(station.latitude, station.longitude);
  } catch (err) {
    return overpassFallback(cached, err);
  }

  const expiresAt = new Date(Date.now() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.stationPois.upsert({
    where: { stationId },
    create: { stationId, poisJson: envelope(allRows), expiresAt },
    update: { poisJson: envelope(allRows), fetchedAt: new Date(), expiresAt },
  });

  return NextResponse.json({
    pois: allRows,
    cachedAt: new Date().toISOString(),
    fromCache: false,
  });
}

function overpassFallback(
  cached: { poisJson: string; fetchedAt: Date } | null,
  err: unknown,
): NextResponse {
  // Stage 1 failure: surface stale cache if any so the user still sees
  // *something*; otherwise return empty for the UI to render the empty state.
  if (cached) {
    const rows = readCachedRows(cached.poisJson) ?? [];
    return NextResponse.json({
      pois: rows,
      cachedAt: cached.fetchedAt.toISOString(),
      fromCache: true,
      staleReason: err instanceof OverpassError ? err.kind : 'unknown',
    });
  }
  return NextResponse.json({
    pois: [],
    cachedAt: null,
    fromCache: false,
    error: err instanceof OverpassError ? err.kind : 'overpass_unknown',
  });
}
