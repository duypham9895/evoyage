/**
 * Cross-source station deduplication.
 *
 * Each data source (VinFast, EVPower, OSM, manual) has its own ID space, so
 * we cannot rely on stable external IDs alone to avoid duplicates. Instead we
 * match by physical proximity plus a coarse name-similarity check to avoid
 * collapsing two genuinely distinct stations that sit close together (the
 * "dual-side highway" case).
 */

const EARTH_RADIUS_M = 6_371_000;

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

interface ExistingStation {
  readonly latitude: number;
  readonly longitude: number;
  readonly name: string;
}

interface CandidateStation {
  readonly lat: number;
  readonly lng: number;
  readonly name: string;
}

/**
 * Cheap ASCII-folding + lowercasing for Vietnamese-vs-Vietnamese name compare.
 * We don't need full collation — just enough to match "V-GREEN Vincom" against
 * "v-green vincom đồng khởi dc" reliably.
 */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sharesNameRoot(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return true; // ambiguous — defer to coord-only match
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Token overlap: ≥2 shared tokens of length ≥3
  const tokensA = new Set(na.split(' ').filter((t) => t.length >= 3));
  const tokensB = nb.split(' ').filter((t) => t.length >= 3);
  let shared = 0;
  for (const t of tokensB) if (tokensA.has(t)) shared += 1;
  return shared >= 2;
}

export function isDuplicateCandidate(
  existing: ExistingStation,
  candidate: CandidateStation,
  radiusMeters: number,
): boolean {
  const distance = haversineMeters(
    { lat: existing.latitude, lng: existing.longitude },
    { lat: candidate.lat, lng: candidate.lng },
  );
  if (distance > radiusMeters) return false;
  return sharesNameRoot(existing.name, candidate.name);
}

/**
 * Returns approximate degree deltas covering `radiusMeters` for use in a SQL
 * bounding-box pre-filter. Latitude is uniform; longitude shrinks toward the
 * poles, so we scale by cos(lat). Vietnam sits in 8°–23° N, so cos is
 * ≥ 0.92 — the bbox is conservative enough to never miss a true match.
 */
export function bboxDelta(latDeg: number, radiusMeters: number): { dLat: number; dLng: number } {
  const dLat = radiusMeters / 111_000;
  const cosLat = Math.cos((latDeg * Math.PI) / 180);
  const dLng = radiusMeters / (111_000 * Math.max(cosLat, 0.5));
  return { dLat, dLng };
}
