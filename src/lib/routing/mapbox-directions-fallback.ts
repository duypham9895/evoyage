/**
 * Mapbox Directions API client used as a FALLBACK when OSRM (the primary
 * routing engine) returns 5xx or fails the network. This client mirrors the
 * OSRM client's return shape so it slots into the same downstream pipeline
 * with no normalization required.
 *
 * Differences from `mapbox-directions.ts` (the explicit Mapbox-provider
 * client used for the user-selected Mapbox map mode):
 *   - Requests precision-5 polylines (`geometries=polyline`) so callers do
 *     NOT need to decode/re-encode. Output drops directly into the OSRM
 *     pipeline which expects precision-5.
 *   - Takes the original address strings as parameters and preserves them as
 *     `startAddress` / `endAddress` (matching the OSRM client's contract that
 *     surfaces the user-visible labels, not the resolved coordinates).
 *   - Profile is `driving` (NOT `driving-traffic`, which requires a paid
 *     Mapbox tier).
 *
 * The caller is responsible for supplying the access token (read once from
 * `process.env.MAPBOX_ACCESS_TOKEN`).
 */

interface DirectionsResult {
  readonly polyline: string;
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly startAddress: string;
  readonly endAddress: string;
  /** Origin coordinate (already known on this path — passed as input). */
  readonly startCoord: { readonly lat: number; readonly lng: number };
  /** Destination coordinate (already known on this path — passed as input). */
  readonly endCoord: { readonly lat: number; readonly lng: number };
}

const DIRECTIONS_BASE = 'https://api.mapbox.com/directions/v5/mapbox/driving';

/**
 * Fetch driving directions from Mapbox Directions API v5 using already-known
 * coordinates. Returns precision-5 polyline (matches OSRM contract).
 *
 * Throws on non-2xx response with the HTTP status code in the message.
 */
export async function fetchDirectionsMapboxFromCoords(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  accessToken: string,
  startAddress: string,
  endAddress: string,
): Promise<DirectionsResult> {
  // Mapbox uses lng,lat order (GeoJSON standard)
  const coordinates = `${originLng},${originLat};${destLng},${destLat}`;

  const params = new URLSearchParams({
    access_token: accessToken,
    geometries: 'polyline', // precision-5 — slots into OSRM pipeline directly
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
    throw new Error('Mapbox Directions: No route found');
  }

  const route = data.routes[0];

  return {
    polyline: route.geometry,
    distanceMeters: Math.round(route.distance),
    durationSeconds: Math.round(route.duration),
    startAddress,
    endAddress,
    startCoord: { lat: originLat, lng: originLng },
    endCoord: { lat: destLat, lng: destLng },
  };
}
