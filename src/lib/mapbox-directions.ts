/**
 * Mapbox Directions API v5 client.
 * Uses api.mapbox.com/directions/v5/mapbox/driving (precision-6 polylines).
 *
 * IMPORTANT: Mapbox uses lng,lat coordinate order (GeoJSON standard),
 * and precision-6 polylines. The caller MUST normalize the polyline to
 * precision-5 before downstream use (see route API).
 */

interface DirectionsResult {
  readonly polyline: string;
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly startAddress: string;
  readonly endAddress: string;
}

const DIRECTIONS_BASE = 'https://api.mapbox.com/directions/v5/mapbox/driving';

/**
 * Fetch driving directions from Mapbox Directions API v5.
 * Returns a precision-6 encoded polyline — caller must normalize.
 */
export async function fetchDirectionsMapbox(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  accessToken: string,
): Promise<DirectionsResult> {
  // Mapbox uses lng,lat order
  const coordinates = `${originLng},${originLat};${destLng},${destLat}`;

  const params = new URLSearchParams({
    access_token: accessToken,
    geometries: 'polyline6',
    overview: 'full',
  });

  const response = await fetch(`${DIRECTIONS_BASE}/${coordinates}?${params}`, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Mapbox Directions API error: ${response.status}`);
  }

  const data = await response.json();

  if (!data.routes?.length) {
    throw new Error(`Mapbox Directions: No route found — ${data.message ?? 'Unknown error'}`);
  }

  const route = data.routes[0];

  return {
    polyline: route.geometry,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    startAddress: `${originLat.toFixed(4)},${originLng.toFixed(4)}`,
    endAddress: `${destLat.toFixed(4)},${destLng.toFixed(4)}`,
  };
}
