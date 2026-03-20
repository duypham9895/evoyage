import type { LatLng } from '@/types';
import { decodePolyline, encodePolyline } from '@/lib/geo/polyline';

/**
 * Perpendicular distance from a point to the line segment (start, end).
 * Uses a simplified cross-product approach on lat/lng coordinates.
 */
function perpendicularDistance(
  point: LatLng,
  lineStart: LatLng,
  lineEnd: LatLng,
): number {
  const dx = lineEnd.lng - lineStart.lng;
  const dy = lineEnd.lat - lineStart.lat;

  if (dx === 0 && dy === 0) {
    // lineStart and lineEnd are the same point
    const pdx = point.lng - lineStart.lng;
    const pdy = point.lat - lineStart.lat;
    return Math.sqrt(pdx * pdx + pdy * pdy);
  }

  const numerator = Math.abs(
    dy * point.lng - dx * point.lat + lineEnd.lng * lineStart.lat - lineEnd.lat * lineStart.lng,
  );
  const denominator = Math.sqrt(dx * dx + dy * dy);
  return numerator / denominator;
}

/**
 * Ramer-Douglas-Peucker polyline simplification.
 * Recursively removes points that are within epsilon distance
 * of the line segment between start and end points.
 */
export function rdpSimplify(
  points: readonly LatLng[],
  epsilon: number,
): readonly LatLng[] {
  if (points.length <= 2) {
    return points;
  }

  let maxDistance = 0;
  let maxIndex = 0;

  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  if (maxDistance > epsilon) {
    const left = rdpSimplify(points.slice(0, maxIndex + 1), epsilon);
    const right = rdpSimplify(points.slice(maxIndex), epsilon);

    // Combine, removing duplicate point at the join
    return [...left.slice(0, -1), ...right];
  }

  // All points are within epsilon — keep only endpoints
  return [start, end];
}

/**
 * Simplify an encoded polyline to reduce URL length.
 * Uses Ramer-Douglas-Peucker algorithm with increasing epsilon
 * until the encoded result fits within maxUrlChars.
 */
export function simplifyPolyline(
  encoded: string,
  maxUrlChars: number = 4000,
): string {
  if (encoded.length <= maxUrlChars) {
    return encoded;
  }

  const points = decodePolyline(encoded);

  if (points.length <= 2) {
    return encoded;
  }

  const MAX_ITERATIONS = 10;
  let epsilon = 0.00005;
  let result = encoded;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const simplified = rdpSimplify(points, epsilon);
    result = encodePolyline(simplified);

    if (result.length <= maxUrlChars) {
      return result;
    }

    epsilon *= 2;
  }

  // Return best effort even if still over limit
  return result;
}
