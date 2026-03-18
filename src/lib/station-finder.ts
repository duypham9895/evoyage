import type { ChargingStationData, LatLng } from '@/types';

const EARTH_RADIUS_KM = 6371;

/**
 * Haversine distance between two lat/lng points in kilometers.
 */
export function haversineDistance(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Minimum distance from a point to a line segment using projection.
 * Uses linear approximation (valid for short segments < 10km).
 */
export function distanceToSegment(
  point: LatLng,
  segStart: LatLng,
  segEnd: LatLng,
): number {
  const dx = segEnd.lng - segStart.lng;
  const dy = segEnd.lat - segStart.lat;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return haversineDistance(point, segStart);
  }

  // Project point onto segment, clamped to [0, 1]
  const t = Math.max(0, Math.min(1,
    ((point.lng - segStart.lng) * dx + (point.lat - segStart.lat) * dy) / lenSq,
  ));

  const closest: LatLng = {
    lat: segStart.lat + t * dy,
    lng: segStart.lng + t * dx,
  };

  return haversineDistance(point, closest);
}

// ── Route-corridor station search ──

export interface StationWithRouteInfo extends ChargingStationData {
  readonly distanceToRouteKm: number;
  readonly nearestRouteKm: number;
  readonly nearestRouteIdx: number;
}

/**
 * Find stations within a corridor along the route polyline.
 *
 * Searches only the portion of the route between fromKm and toKm
 * (cumulative distance along route). Returns stations sorted by
 * distance to route (closest first).
 */
export function findStationsAlongRoute(
  routePoints: readonly LatLng[],
  cumDist: readonly number[],
  stations: readonly ChargingStationData[],
  fromKm: number,
  toKm: number,
  corridorWidthKm: number,
): readonly StationWithRouteInfo[] {
  // Find polyline index range for the distance window
  let fromIdx = 0;
  for (let i = 0; i < cumDist.length; i++) {
    if (cumDist[i] >= fromKm) {
      fromIdx = Math.max(0, i - 1);
      break;
    }
  }
  let toIdx = cumDist.length - 1;
  for (let i = fromIdx; i < cumDist.length; i++) {
    if (cumDist[i] >= toKm) {
      toIdx = Math.min(i, cumDist.length - 1);
      break;
    }
  }

  // Bounding box pre-filter (generous conversion: 1° ≈ 80-111 km)
  const degBuffer = corridorWidthKm / 80;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (let i = fromIdx; i <= toIdx; i++) {
    const p = routePoints[i];
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  minLat -= degBuffer;
  maxLat += degBuffer;
  minLng -= degBuffer;
  maxLng += degBuffer;

  const result: StationWithRouteInfo[] = [];

  for (const station of stations) {
    // Quick bounding box rejection
    if (
      station.latitude < minLat || station.latitude > maxLat ||
      station.longitude < minLng || station.longitude > maxLng
    ) {
      continue;
    }

    const stationPoint: LatLng = { lat: station.latitude, lng: station.longitude };
    let minDist = Infinity;
    let nearestIdx = fromIdx;

    for (let i = fromIdx; i < toIdx && i < routePoints.length - 1; i++) {
      const dist = distanceToSegment(stationPoint, routePoints[i], routePoints[i + 1]);
      if (dist < minDist) {
        minDist = dist;
        nearestIdx = i;
      }
    }

    if (minDist <= corridorWidthKm) {
      result.push({
        ...station,
        distanceToRouteKm: minDist,
        nearestRouteKm: cumDist[nearestIdx],
        nearestRouteIdx: nearestIdx,
      });
    }
  }

  return result.sort((a, b) => a.distanceToRouteKm - b.distanceToRouteKm);
}

/**
 * Estimate round-trip detour time (seconds) from distance to route.
 * Assumes 30 km/h average for local roads to/from highway.
 */
export function estimateDetourTimeSec(distanceToRouteKm: number): number {
  const MIN_DETOUR_SEC = 60; // Minimum 1 minute for pulling off highway
  const LOCAL_SPEED_KMH = 30;
  const detourSec = (2 * distanceToRouteKm / LOCAL_SPEED_KMH) * 3600;
  return Math.max(MIN_DETOUR_SEC, detourSec);
}

/**
 * Filter stations by brand compatibility.
 *
 * VinFast vehicles can use ALL stations (VinFast-exclusive + universal).
 * Non-VinFast vehicles can ONLY use universal stations (isVinFastOnly = false).
 */
export function filterCompatibleStations(
  stations: readonly ChargingStationData[],
  isVinFastVehicle: boolean,
): readonly ChargingStationData[] {
  if (isVinFastVehicle) {
    return stations;
  }
  return stations.filter((s) => !s.isVinFastOnly);
}

interface NearestStationResult {
  readonly station: ChargingStationData;
  readonly distanceKm: number;
}

/**
 * Find the nearest compatible charging station to a given point,
 * searching with expanding radii (5km, 10km, 15km).
 *
 * Returns null if no station found within any radius.
 */
export function findNearestStation(
  point: LatLng,
  compatibleStations: readonly ChargingStationData[],
  searchRadii: readonly number[] = [5, 10, 15],
): NearestStationResult | null {
  for (const radius of searchRadii) {
    let nearest: NearestStationResult | null = null;

    for (const station of compatibleStations) {
      const dist = haversineDistance(point, {
        lat: station.latitude,
        lng: station.longitude,
      });

      if (dist <= radius && (nearest === null || dist < nearest.distanceKm)) {
        nearest = { station, distanceKm: dist };
      }
    }

    if (nearest !== null) {
      return nearest;
    }
  }

  return null;
}

/**
 * Find all stations within a given radius of a point.
 */
export function findStationsNearPoint(
  point: LatLng,
  stations: readonly ChargingStationData[],
  radiusKm: number,
): readonly (ChargingStationData & { readonly distanceKm: number })[] {
  return stations
    .map((station) => ({
      ...station,
      distanceKm: haversineDistance(point, {
        lat: station.latitude,
        lng: station.longitude,
      }),
    }))
    .filter((s) => s.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}
