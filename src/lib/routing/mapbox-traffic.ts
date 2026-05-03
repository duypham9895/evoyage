/**
 * Mapbox Directions API v5 — `driving-traffic` profile.
 *
 * Phase 2 of the Trust Intelligence Roadmap. Returns a route whose
 * durationSeconds reflects predicted traffic at the given departure
 * time (Mapbox supports historical + predictive traffic up to 7 days out).
 *
 * Free-tier headroom: Mapbox includes 100,000 directions requests/month;
 * eVoyage's projected usage at peak is well below 5,000/month with the
 * 30-min route cache. See spec §5.
 *
 * Falls back to OSRM + heuristic via the caller when this throws.
 */

const TRAFFIC_BASE = 'https://api.mapbox.com/directions/v5/mapbox/driving-traffic';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_DEPART_LEAD_MS = 7 * 24 * 60 * 60 * 1000;

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

export interface FetchTrafficOptions {
  readonly origin: LatLng;
  readonly destination: LatLng;
  readonly accessToken: string;
  /** "now" → real-time traffic; Date → predicted traffic at that instant */
  readonly departAt: Date | 'now';
}

export interface TrafficAwareResult {
  readonly polyline: string; // precision-6 (Mapbox default)
  readonly distanceMeters: number;
  readonly durationSeconds: number; // traffic-aware
}

export type MapboxTrafficErrorKind =
  | 'depart_too_far'
  | 'depart_in_past'
  | 'upstream_error'
  | 'no_route'
  | 'network_error'
  | 'timeout';

export class MapboxTrafficError extends Error {
  public readonly kind: MapboxTrafficErrorKind;
  public readonly statusCode?: number;

  constructor(kind: MapboxTrafficErrorKind, message: string, statusCode?: number) {
    super(message);
    this.name = 'MapboxTrafficError';
    this.kind = kind;
    this.statusCode = statusCode;
  }
}

export async function fetchTrafficAwareDirections(
  opts: FetchTrafficOptions,
): Promise<TrafficAwareResult> {
  const { origin, destination, accessToken, departAt } = opts;

  // Mapbox supports depart_at only for "now" or up to ~7 days out
  if (departAt !== 'now') {
    const lead = departAt.getTime() - Date.now();
    if (lead < -60_000) {
      throw new MapboxTrafficError(
        'depart_in_past',
        `Departure ${departAt.toISOString()} is in the past`,
      );
    }
    if (lead > MAX_DEPART_LEAD_MS) {
      throw new MapboxTrafficError(
        'depart_too_far',
        `Departure ${departAt.toISOString()} exceeds Mapbox's 7-day predictive horizon`,
      );
    }
  }

  const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const params = new URLSearchParams({
    access_token: accessToken,
    geometries: 'polyline6',
    overview: 'full',
  });
  if (departAt !== 'now') {
    params.set('depart_at', departAt.toISOString());
  }

  const url = `${TRAFFIC_BASE}/${coords}?${params}`;

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new MapboxTrafficError('timeout', `Request exceeded ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw new MapboxTrafficError(
      'network_error',
      err instanceof Error ? err.message : 'unknown network failure',
    );
  }

  if (!response.ok) {
    throw new MapboxTrafficError(
      'upstream_error',
      `Mapbox returned ${response.status}`,
      response.status,
    );
  }

  const json = (await response.json()) as {
    routes?: ReadonlyArray<{
      geometry: string;
      distance: number;
      duration: number;
    }>;
  };

  const route = json.routes?.[0];
  if (!route) {
    throw new MapboxTrafficError('no_route', 'Response contained no routes');
  }

  return {
    polyline: route.geometry,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
  };
}
