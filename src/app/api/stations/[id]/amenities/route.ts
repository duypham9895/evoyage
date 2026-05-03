import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, getClientIp, stationsLimiter } from '@/lib/rate-limit';
import { queryNearbyPois, OverpassError, type OsmPoi } from '@/lib/station/overpass-client';
import { categorizePoi, type AmenityCategory } from '@/lib/station/categorize-poi';
import { haversineMeters, walkingTimeMinutes } from '@/lib/station/walking-distance';

/**
 * GET /api/stations/[id]/amenities
 *
 * Phase 4 — Charging Stop Amenities. Returns categorized OSM POIs within
 * walking distance of the station, with walking-time labels. Uses
 * Postgres-cached results when available (30-day TTL); on cache miss,
 * queries Overpass live, persists, and returns.
 *
 * Response shape:
 *   {
 *     pois: Array<{
 *       id, name, amenity, category, walkingMinutes, distanceMeters
 *     }>
 *     cachedAt: string | null
 *     fromCache: boolean
 *   }
 */

const SEARCH_RADIUS_METERS = 500;
const MAX_WALKING_TIME_MIN = 7; // round-trip ≤ 7 min keeps it inside a charge window
const CACHE_TTL_DAYS = 30;

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
    const distance = haversineMeters({ lat: stationLat, lng: stationLng }, { lat: poi.lat, lng: poi.lng });
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

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: stationId } = await params;

  // Light rate limit shared with /api/stations/nearby — POI lookups are
  // similar in cost (mostly cache hits, occasional Overpass).
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

  // Try cache first
  const cached = await prisma.stationPois.findUnique({ where: { stationId } });
  if (cached && cached.expiresAt > new Date()) {
    try {
      const rows = JSON.parse(cached.poisJson) as AmenityRow[];
      return NextResponse.json({
        pois: rows,
        cachedAt: cached.fetchedAt.toISOString(),
        fromCache: true,
      });
    } catch {
      // Cache row corrupted; fall through to refetch
    }
  }

  // Cache miss / expired / corrupted — query Overpass
  let osmPois: readonly OsmPoi[];
  try {
    osmPois = await queryNearbyPois({
      lat: station.latitude,
      lng: station.longitude,
      radiusMeters: SEARCH_RADIUS_METERS,
    });
  } catch (err) {
    // On Overpass failure, surface the stale cache if any so the user gets
    // *something*; otherwise return empty so UI can show "Chưa có dữ liệu"
    if (cached) {
      const rows = (() => {
        try { return JSON.parse(cached.poisJson) as AmenityRow[]; }
        catch { return [] as AmenityRow[]; }
      })();
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

  const rows = osmPois
    .map(decorate(station.latitude, station.longitude))
    .filter((r): r is AmenityRow => r !== null)
    .sort((a, b) => a.walkingMinutes - b.walkingMinutes);

  const expiresAt = new Date(Date.now() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.stationPois.upsert({
    where: { stationId },
    create: { stationId, poisJson: JSON.stringify(rows), expiresAt },
    update: { poisJson: JSON.stringify(rows), fetchedAt: new Date(), expiresAt },
  });

  return NextResponse.json({
    pois: rows,
    cachedAt: new Date().toISOString(),
    fromCache: false,
  });
}
