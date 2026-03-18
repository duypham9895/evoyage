import type { LatLng } from '@/types';

/**
 * Decode an encoded polyline string into an array of LatLng points.
 * Supports both precision-5 (Google/OSRM) and precision-6 (Mapbox).
 *
 * Algorithm: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export function decodePolyline(encoded: string, precision: 5 | 6 = 5): readonly LatLng[] {
  const factor = precision === 6 ? 1e6 : 1e5;
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / factor, lng: lng / factor });
  }

  return points;
}

/**
 * Encode an array of LatLng points into a polyline string.
 * Used to normalize Mapbox precision-6 polylines to precision-5.
 */
export function encodePolyline(points: readonly LatLng[], precision: 5 | 6 = 5): string {
  const factor = precision === 6 ? 1e6 : 1e5;
  let encoded = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const point of points) {
    const lat = Math.round(point.lat * factor);
    const lng = Math.round(point.lng * factor);

    encoded += encodeValue(lat - prevLat);
    encoded += encodeValue(lng - prevLng);

    prevLat = lat;
    prevLng = lng;
  }

  return encoded;
}

function encodeValue(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let encoded = '';

  while (v >= 0x20) {
    encoded += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }

  encoded += String.fromCharCode(v + 63);
  return encoded;
}

/**
 * Calculate cumulative distances along a polyline.
 * Returns an array of distances (in km) from the start to each point.
 */
export function cumulativeDistances(
  points: readonly LatLng[],
  haversine: (a: LatLng, b: LatLng) => number,
): readonly number[] {
  const distances: number[] = [0];

  for (let i = 1; i < points.length; i++) {
    const segmentDist = haversine(points[i - 1], points[i]);
    distances.push(distances[i - 1] + segmentDist);
  }

  return distances;
}
