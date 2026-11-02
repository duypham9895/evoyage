/**
 * Is a point in Laos or Cambodia? Used to catch OSRM routes (and stations)
 * that leave Vietnam through its western neighbours.
 *
 * Tests "inside a neighbour" rather than "outside Vietnam" so sea crossings
 * (Phu Quoc ferry) and simplified coastlines never trip it. A plain Vietnam
 * lat/lng bbox does not work: it contains most of Laos and Cambodia.
 * China is not included (no evidence of the bug there).
 *
 * Polygons: Natural Earth 1:50m admin-0 (public domain), see the JSON's _source.
 * Dependency-free so scripts/ can import it with a relative path.
 */

import borders from './neighbour-borders.json';

type Ring = readonly (readonly [number, number])[]; // [lng, lat]

interface Polygon {
  readonly ring: Ring;
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLng: number;
  readonly maxLng: number;
}

/** Foreign stretches shorter than this are border-road noise (Moc Bai, Lao Bao). */
export const FOREIGN_TOLERANCE_KM = 5;

const POLYGONS: readonly Polygon[] = Object.values(
  borders.countries as Record<string, number[][][]>,
).flatMap((rings) =>
  rings.map((raw) => {
    const ring = raw.map(([lng, lat]) => [lng, lat] as const);
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const [lng, lat] of ring) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
    return { ring, minLat, maxLat, minLng, maxLng };
  }),
);

function inRing(lat: number, lng: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function isInNeighbourCountry(lat: number, lng: number): boolean {
  for (const p of POLYGONS) {
    if (lat < p.minLat || lat > p.maxLat || lng < p.minLng || lng > p.maxLng) continue;
    if (inRing(lat, lng, p.ring)) return true;
  }
  return false;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Where a route first enters Laos/Cambodia, and how many km of it run there
 * (segments with at least one foreign end). Null when the foreign part is
 * under FOREIGN_TOLERANCE_KM. O(points); no spread into Math.min/max.
 */
export function findForeignSegment(
  points: readonly { lat: number; lng: number }[],
): { firstExitKm: number; foreignKm: number } | null {
  let km = 0;
  let foreignKm = 0;
  let firstExitKm: number | null = null;
  let prevForeign = points.length > 0 && isInNeighbourCountry(points[0].lat, points[0].lng);
  if (prevForeign) firstExitKm = 0;
  for (let i = 1; i < points.length; i++) {
    const seg = haversineKm(points[i - 1], points[i]);
    const foreign = isInNeighbourCountry(points[i].lat, points[i].lng);
    if (foreign && firstExitKm === null) firstExitKm = km + seg;
    if (foreign || prevForeign) foreignKm += seg;
    km += seg;
    prevForeign = foreign;
  }
  if (firstExitKm === null || foreignKm < FOREIGN_TOLERANCE_KM) return null;
  return { firstExitKm, foreignKm };
}

