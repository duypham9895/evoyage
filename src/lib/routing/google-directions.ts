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
  waypoints?: readonly { lat: number; lng: number }[],
): Promise<DirectionsResult> {
  const params = new URLSearchParams({
    origin: `${originLat},${originLng}`,
    destination: `${destLat},${destLng}`,
    mode: 'driving',
    key: apiKey,
  });

  if (waypoints && waypoints.length > 0) {
    const waypointStr = waypoints
      .map(wp => `${wp.lat},${wp.lng}`)
      .join('|');
    params.set('waypoints', waypointStr);
  }

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

  // Sum distance and duration across all legs (multiple legs when waypoints used)
  const totalDistance = route.legs.reduce(
    (sum: number, leg: { distance: { value: number } }) => sum + leg.distance.value,
    0,
  );
  const totalDuration = route.legs.reduce(
    (sum: number, leg: { duration: { value: number } }) => sum + leg.duration.value,
    0,
  );

  return {
    polyline: route.overview_polyline.points,
    distanceMeters: totalDistance,
    durationSeconds: totalDuration,
    startAddress: route.legs[0].start_address,
    endAddress: route.legs[route.legs.length - 1].end_address,
  };
}
