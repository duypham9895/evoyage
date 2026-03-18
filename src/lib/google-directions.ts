/**
 * Google Directions API v1 client.
 * Uses maps.googleapis.com/maps/api/directions/json (precision-5 polylines).
 * DO NOT use Routes API v2 (routes.googleapis.com) — it uses precision-6 polylines
 * incompatible with our decodePolyline() function.
 */

interface DirectionsResult {
  readonly polyline: string;
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly startAddress: string;
  readonly endAddress: string;
}

const DIRECTIONS_BASE = 'https://maps.googleapis.com/maps/api/directions/json';

/**
 * Fetch driving directions from Google Directions API v1.
 * Accepts lat/lng directly to avoid Nominatim/Google geocoding mismatches.
 */
export async function fetchDirectionsGoogle(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  apiKey: string,
): Promise<DirectionsResult> {
  const params = new URLSearchParams({
    origin: `${originLat},${originLng}`,
    destination: `${destLat},${destLng}`,
    mode: 'driving',
    key: apiKey,
  });

  const response = await fetch(`${DIRECTIONS_BASE}?${params}`, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Google Directions API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.status !== 'OK' || !data.routes?.length) {
    throw new Error(`Google Directions: ${data.status} — No route found`);
  }

  const route = data.routes[0];
  const leg = route.legs[0];

  return {
    polyline: route.overview_polyline.points,
    distanceMeters: leg.distance.value,
    durationSeconds: leg.duration.value,
    startAddress: leg.start_address,
    endAddress: leg.end_address,
  };
}
