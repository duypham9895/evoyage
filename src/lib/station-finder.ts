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
