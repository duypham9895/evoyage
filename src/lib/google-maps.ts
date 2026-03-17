/**
 * Server-side Google Maps API helpers.
 * Uses the Directions API to get route polylines and distances.
 */

interface DirectionsResult {
  readonly polyline: string;
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly startAddress: string;
  readonly endAddress: string;
  readonly startPlaceId: string;
  readonly endPlaceId: string;
}

/**
 * Fetch driving directions from Google Directions API (server-side).
 * Returns the encoded polyline, distance, and duration.
 */
export async function fetchDirections(
  origin: string,
  destination: string,
): Promise<DirectionsResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY environment variable is not set');
  }

  const params = new URLSearchParams({
    origin,
    destination,
    key: apiKey,
    language: 'vi',
    region: 'vn',
  });

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/directions/json?${params}`,
  );

  if (!response.ok) {
    throw new Error(`Google Directions API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.status !== 'OK' || !data.routes?.length) {
    throw new Error(`No route found: ${data.status} — ${data.error_message ?? 'Unknown error'}`);
  }

  const route = data.routes[0];
  const leg = route.legs[0];

  return {
    polyline: route.overview_polyline.points,
    distanceMeters: leg.distance.value,
    durationSeconds: leg.duration.value,
    startAddress: leg.start_address,
    endAddress: leg.end_address,
    startPlaceId: `${leg.start_location.lat},${leg.start_location.lng}`,
    endPlaceId: `${leg.end_location.lat},${leg.end_location.lng}`,
  };
}
