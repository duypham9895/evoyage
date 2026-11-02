/**
 * Shared StationPois cache shape + tiered Overpass fetch.
 *
 * Used by both GET /api/stations/[id]/amenities and scripts/warm-station-pois.ts
 * so the warmer writes exactly the envelope the route reads. Tuning changes
 * invalidate cache via POIS_SCHEMA_VERSION (mismatch ⇒ refetch).
 *
 * Relative imports on purpose: the warmer script runs under tsx.
 *
 * See docs/specs/2026-05-04-amenities-tiered-radius.md.
 */
import {
  OverpassError,
  queryNearbyPois,
  type OsmPoi,
  type OverpassRequestOptions,
} from './overpass-client';
import { categorizePoi, type AmenityCategory } from './categorize-poi';
import { haversineMeters, walkingTimeMinutes, drivingTimeMinutes } from './walking-distance';
import { dedupePois } from './dedupe-pois';

const WALK_RADIUS_METERS = 500;
const WALK_MAX_ROUND_TRIP_MIN = 7;
const DRIVE_RADIUS_METERS = 1500;
export const POIS_SCHEMA_VERSION = 2;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// An Overpass failure is cached briefly so an outage doesn't make every view
// wait on Overpass again, without hiding amenities for 30 days.
const FAILURE_CACHE_TTL_MS = 60 * 60 * 1000;

type Tier = 'walk' | 'drive';

export interface AmenityRow {
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
  /** Set when the rows are empty because Overpass failed (not "nothing nearby"). */
  readonly failure?: string;
}

export interface CachedPois {
  readonly rows: readonly AmenityRow[];
  readonly failure?: string;
}

export interface AmenityFetchResult {
  readonly rows: AmenityRow[];
  /** Stage 2 failed after an empty Stage 1: rows are empty for an unknown reason. */
  readonly failure?: string;
}

export function failureKind(err: unknown): string {
  return err instanceof OverpassError ? err.kind : 'overpass_unknown';
}

export function cacheExpiresAt(failure?: string): Date {
  return new Date(Date.now() + (failure ? FAILURE_CACHE_TTL_MS : CACHE_TTL_MS));
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

export function readCachedPois(json: string): CachedPois | null {
  try {
    const parsed = JSON.parse(json) as CachedEnvelope | readonly AmenityRow[];
    // Older v1 cache rows were a bare array (no envelope) → schema-mismatch
    // by definition; force a refetch so tuning changes propagate naturally.
    if (Array.isArray(parsed)) return null;
    const env = parsed as CachedEnvelope;
    if (env.schemaVersion !== POIS_SCHEMA_VERSION) return null;
    return env.failure ? { rows: env.rows, failure: env.failure } : { rows: env.rows };
  } catch {
    return null;
  }
}

export function envelope(rows: readonly AmenityRow[], failure?: string): string {
  const payload: CachedEnvelope = failure
    ? { schemaVersion: POIS_SCHEMA_VERSION, rows, failure }
    : { schemaVersion: POIS_SCHEMA_VERSION, rows };
  return JSON.stringify(payload);
}

/**
 * Stage 1 (walk band) always; Stage 2 (drive band) only when Stage 1 is empty.
 * A Stage 1 failure throws (caller decides the fallback); a Stage 2 failure
 * yields the empty Stage 1 result plus its failure kind so it can be cached
 * briefly as a failure.
 */
export async function fetchAmenityRows(
  lat: number,
  lng: number,
  overpass: OverpassRequestOptions = {},
): Promise<AmenityFetchResult> {
  const walkOsm = await queryNearbyPois({ ...overpass, lat, lng, radiusMeters: WALK_RADIUS_METERS });
  const walkRows = dedupePois(walkOsm)
    .map(decorateWalk(lat, lng))
    .filter((r): r is AmenityRow => r !== null)
    .sort((a, b) => a.walkingMinutes - b.walkingMinutes);
  if (walkRows.length > 0) return { rows: walkRows };

  try {
    const driveOsm = await queryNearbyPois({ ...overpass, lat, lng, radiusMeters: DRIVE_RADIUS_METERS });
    const rows = dedupePois(driveOsm)
      .map(decorateDrive(lat, lng))
      .filter((r): r is AmenityRow => r !== null)
      .sort((a, b) => (a.drivingMinutes ?? 0) - (b.drivingMinutes ?? 0));
    return { rows };
  } catch (err) {
    // Stage 1 already returned []; persist the empty result so we don't
    // hammer Overpass on every load, marked as a failure (short TTL).
    return { rows: [], failure: failureKind(err) };
  }
}
