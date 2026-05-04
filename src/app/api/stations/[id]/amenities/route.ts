import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, getClientIp, stationsLimiter } from '@/lib/rate-limit';
import { queryNearbyPois, OverpassError, type OsmPoi } from '@/lib/station/overpass-client';
import { categorizePoi, type AmenityCategory } from '@/lib/station/categorize-poi';
import {
  haversineMeters,
  walkingTimeMinutes,
  drivingTimeMinutes,
} from '@/lib/station/walking-distance';
import { dedupePois } from '@/lib/station/dedupe-pois';

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

const WALK_RADIUS_METERS = 500;
const WALK_MAX_ROUND_TRIP_MIN = 7;
const DRIVE_RADIUS_METERS = 1500;
const CACHE_TTL_DAYS = 30;
const POIS_SCHEMA_VERSION = 2;

type Tier = 'walk' | 'drive';

interface AmenityRow {
  readonly id: number;
  readonly name: string | null;
  readonly amenity: string;
  readonly category: AmenityCategory;
  readonly tier: Tier;
  readonly walkingMinutes: number;
  readonly drivingMinutes?: number;
  readonly distanceMeters: number;
  readonly lat: number;
  readonly lng: number;
}

interface CachedEnvelope {
  readonly schemaVersion: number;
  readonly rows: readonly AmenityRow[];
}

function decorateWalk(stationLat: number, stationLng: number) {
  return (poi: OsmPoi): AmenityRow | null => {
    const category = categorizePoi(poi);
    if (!category) return null;
    const distance = haversineMeters(
      { lat: stationLat, lng: stationLng },
      { lat: poi.lat, lng: poi.lng },
    );
    const oneWayMin = walkingTimeMinutes(distance);
    if (oneWayMin * 2 > WALK_MAX_ROUND_TRIP_MIN) return null;
    return {
      id: poi.id,
      name: poi.name,
      amenity: poi.amenity,
      category,
      tier: 'walk',
      walkingMinutes: oneWayMin,
      distanceMeters: Math.round(distance),
      lat: poi.lat,
      lng: poi.lng,
    };
  };
}

function decorateDrive(stationLat: number, stationLng: number) {
  return (poi: OsmPoi): AmenityRow | null => {
    const category = categorizePoi(poi);
    if (!category) return null;
    const distance = haversineMeters(
      { lat: stationLat, lng: stationLng },
      { lat: poi.lat, lng: poi.lng },
    );
    return {
      id: poi.id,
      name: poi.name,
      amenity: poi.amenity,
      category,
      tier: 'drive',
      walkingMinutes: walkingTimeMinutes(distance),
      drivingMinutes: drivingTimeMinutes(distance),
      distanceMeters: Math.round(distance),
      lat: poi.lat,
      lng: poi.lng,
    };
  };
}

function readCachedRows(json: string): readonly AmenityRow[] | null {
  try {
    const parsed = JSON.parse(json) as CachedEnvelope | readonly AmenityRow[];
    // Older v1 cache rows were a bare array (no envelope) → schema-mismatch
    // by definition; force a refetch so tuning changes propagate naturally.
    if (Array.isArray(parsed)) return null;
    const env = parsed as CachedEnvelope;
    if (env.schemaVersion !== POIS_SCHEMA_VERSION) return null;
    return env.rows;
  } catch {
    return null;
  }
}

function envelope(rows: readonly AmenityRow[]): string {
  const payload: CachedEnvelope = { schemaVersion: POIS_SCHEMA_VERSION, rows };
  return JSON.stringify(payload);
}

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

  // Stage 1 — walking band (always)
  let walkRows: AmenityRow[];
  try {
    const osm = await queryNearbyPois({
      lat: station.latitude,
      lng: station.longitude,
      radiusMeters: WALK_RADIUS_METERS,
    });
    walkRows = dedupePois(osm)
      .map(decorateWalk(station.latitude, station.longitude))
      .filter((r): r is AmenityRow => r !== null)
      .sort((a, b) => a.walkingMinutes - b.walkingMinutes);
  } catch (err) {
    return overpassFallback(cached, err);
  }

  // Stage 2 — drive band, only when walking band came up empty
  let driveRows: AmenityRow[] = [];
  if (walkRows.length === 0) {
    try {
      const osm = await queryNearbyPois({
        lat: station.latitude,
        lng: station.longitude,
        radiusMeters: DRIVE_RADIUS_METERS,
      });
      driveRows = dedupePois(osm)
        .map(decorateDrive(station.latitude, station.longitude))
        .filter((r): r is AmenityRow => r !== null)
        .sort((a, b) => (a.drivingMinutes ?? 0) - (b.drivingMinutes ?? 0));
    } catch {
      // Stage 1 already returned []; persist the empty result so we don't
      // hammer Overpass on every load. The 30-day TTL will retry naturally.
      driveRows = [];
    }
  }

  const allRows = [...walkRows, ...driveRows];
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
