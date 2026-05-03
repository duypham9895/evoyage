/**
 * Pure geo helpers for the Phase 4 amenities feature.
 *
 * - haversineMeters: great-circle distance between two points in meters
 * - walkingTimeMinutes: minutes-to-walk a given meter distance at a
 *   conservative 80 m/min reference pace, rounded up so we never under-promise
 *
 * Used by the API route to filter Overpass POIs to "within walking distance
 * of the charging station" and by the UI to render "~3 phút đi bộ" labels.
 *
 * No I/O; safe to import in both server and client code.
 */

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

const EARTH_RADIUS_METERS = 6_371_000;
const WALKING_METERS_PER_MIN = 80; // conservative pace, accommodates older drivers

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function walkingTimeMinutes(meters: number): number {
  if (meters <= 0) return 0;
  return Math.ceil(meters / WALKING_METERS_PER_MIN);
}
