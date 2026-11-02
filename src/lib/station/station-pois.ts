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
import { queryNearbyPois, type OsmPoi } from './overpass-client';
import { categorizePoi, type AmenityCategory } from './categorize-poi';
import { haversineMeters, walkingTimeMinutes, drivingTimeMinutes } from './walking-distance';
import { dedupePois } from './dedupe-pois';

const WALK_RADIUS_METERS = 500;
const WALK_MAX_ROUND_TRIP_MIN = 7;
const DRIVE_RADIUS_METERS = 1500;
export const POIS_SCHEMA_VERSION = 2;

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

export function readCachedRows(json: string): readonly AmenityRow[] | null {
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

export function envelope(rows: readonly AmenityRow[]): string {
  const payload: CachedEnvelope = { schemaVersion: POIS_SCHEMA_VERSION, rows };
  return JSON.stringify(payload);
}

/**
 * Stage 1 (walk band) always; Stage 2 (drive band) only when Stage 1 is empty.
 * A Stage 1 failure throws (caller decides the fallback); a Stage 2 failure
 * yields the empty Stage 1 result so it can be cached.
 */
export async function fetchAmenityRows(lat: number, lng: number): Promise<AmenityRow[]> {
  const walkOsm = await queryNearbyPois({ lat, lng, radiusMeters: WALK_RADIUS_METERS });
  const walkRows = dedupePois(walkOsm)
    .map(decorateWalk(lat, lng))
    .filter((r): r is AmenityRow => r !== null)
    .sort((a, b) => a.walkingMinutes - b.walkingMinutes);
  if (walkRows.length > 0) return walkRows;

  try {
    const driveOsm = await queryNearbyPois({ lat, lng, radiusMeters: DRIVE_RADIUS_METERS });
    return dedupePois(driveOsm)
      .map(decorateDrive(lat, lng))
      .filter((r): r is AmenityRow => r !== null)
      .sort((a, b) => (a.drivingMinutes ?? 0) - (b.drivingMinutes ?? 0));
  } catch {
    // Stage 1 already returned []; persist the empty result so we don't
    // hammer Overpass on every load. The 30-day TTL will retry naturally.
    return [];
  }
}
