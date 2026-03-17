import type { LatLng } from '@/types';

/**
 * Decode a Google Maps encoded polyline string into an array of LatLng points.
 *
 * Algorithm: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export function decodePolyline(encoded: string): readonly LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    // Decode latitude
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lat += result & 1 ? ~(result >> 1) : result >> 1;

    // Decode longitude
    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
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
