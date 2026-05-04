/**
 * OSRM (Open Source Routing Machine) client.
 * Free, no API key, uses OpenStreetMap data.
 * Consistent with Leaflet/OSM map and Nominatim geocoding.
 *
 * Resilience: when the public OSRM service returns 5xx (502/503/504) or
 * fails the network, the route fetch transparently falls back to Mapbox
 * Directions (using `MAPBOX_ACCESS_TOKEN`). The returned object carries a
 * `provider` field so callers/UI can surface that the fallback was used.
 * 4xx errors propagate as-is — those are real client errors and Mapbox
 * would reject them too.
 */

import { fetchDirectionsMapboxFromCoords } from './mapbox-directions-fallback';

interface DirectionsResult {
  readonly polyline: string;
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly startAddress: string;
  readonly endAddress: string;
  /** Geocoded origin coordinate. Surfaced so downstream (GMaps handoff URL)
   *  can pass exact lat/lng instead of letting GMaps re-geocode the label. */
  readonly startCoord: { readonly lat: number; readonly lng: number };
  /** Geocoded destination coordinate. Same rationale as startCoord. */
  readonly endCoord: { readonly lat: number; readonly lng: number };
  /** Which routing engine produced this result. Present on the OSRM-default
   *  code path so the UI can show a fallback note when 'mapbox' was used. */
  readonly provider: 'osrm' | 'mapbox';
}

/** HTTP error from OSRM, carrying the status code so we can decide on fallback. */
class OsrmHttpError extends Error {
  constructor(public readonly status: number) {
    super(`OSRM routing error: ${status}`);
    this.name = 'OsrmHttpError';
  }
}

/**
 * Decide whether an OSRM failure should trigger a Mapbox fallback.
 *
 * Yes: 5xx from OSRM (502/503/504 etc), or any thrown error (network /
 *      timeout / DNS).
 * No:  4xx from OSRM (real client error — Mapbox would reject it too).
 */
function shouldFallback(error: unknown): boolean {
  if (error instanceof OsrmHttpError) {
    return error.status >= 500 && error.status < 600;
  }
  // Any non-HTTP throw (network, abort, DNS, JSON parse, "No route found")
  // is treated as a transient OSRM-side issue worth retrying via Mapbox.
  return true;
}

interface Coordinate {
  readonly lat: number;
  readonly lng: number;
}

const OSRM_BASE = 'https://router.project-osrm.org';
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

/**
 * Geocode an address string to lat/lng using Nominatim.
 */
async function geocodeAddress(address: string): Promise<Coordinate> {
  const params = new URLSearchParams({
    q: address,
    format: 'json',
    countrycodes: 'vn',
    limit: '1',
  });

  const response = await fetch(`${NOMINATIM_BASE}/search?${params}`, {
    headers: {
      'User-Agent': 'EVoyage/1.0 (https://evoyagevn.vercel.app)',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Nominatim geocoding error: ${response.status}`);
  }

  const results = await response.json();

  if (!results.length) {
    throw new Error(`Location not found: ${address}`);
  }

  return {
    lat: parseFloat(results[0].lat),
    lng: parseFloat(results[0].lon),
  };
}

/** Internal: call OSRM with a prebuilt coordinate string. Throws on any failure. */
async function callOsrm(coordinates: string): Promise<{
  polyline: string;
  distanceMeters: number;
  durationSeconds: number;
}> {
  const response = await fetch(
    `${OSRM_BASE}/route/v1/driving/${coordinates}?overview=full&geometries=polyline`,
    { signal: AbortSignal.timeout(10000) },
  );

  if (!response.ok) {
    throw new OsrmHttpError(response.status);
  }

  const data = await response.json();

  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(`OSRM: No route found (code: ${data.code})`);
  }

  const route = data.routes[0];
  return {
    polyline: route.geometry,
    distanceMeters: Math.round(route.distance),
    durationSeconds: Math.round(route.duration),
  };
}

/**
 * Fetch driving directions from OSRM, with transparent Mapbox fallback on
 * 5xx / network failure. See module header for the fallback policy.
 *
 * Returns encoded polyline (precision-5, Google/OSRM format), distance,
 * and duration. The `provider` field tells you which engine actually
 * produced the result.
 */
export async function fetchDirections(
  origin: string,
  destination: string,
): Promise<DirectionsResult> {
  // Geocode both addresses to coordinates (Nominatim — separate service from OSRM)
  const [startCoord, endCoord] = await Promise.all([
    geocodeAddress(origin),
    geocodeAddress(destination),
  ]);

  // OSRM expects lng,lat order
  const coordinates = `${startCoord.lng},${startCoord.lat};${endCoord.lng},${endCoord.lat}`;

  try {
    const route = await callOsrm(coordinates);
    return {
      ...route,
      startAddress: origin,
      endAddress: destination,
      startCoord,
      endCoord,
      provider: 'osrm',
    };
  } catch (osrmError) {
    if (!shouldFallback(osrmError)) throw osrmError;

    const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
    if (!mapboxToken) throw osrmError;

    // 5xx or network error — fall back to Mapbox Directions.
    // Note: waypoints are not supported in this path. Callers needing waypoints
    // use fetchDirectionsWithWaypoints (which has its own fallback below).
    const reason = osrmError instanceof Error ? osrmError.message : String(osrmError);
    console.warn(
      `[routing] OSRM failed (${reason}); falling back to Mapbox Directions.`,
    );

    const result = await fetchDirectionsMapboxFromCoords(
      startCoord.lat,
      startCoord.lng,
      endCoord.lat,
      endCoord.lng,
      mapboxToken,
      origin,
      destination,
    );
    return { ...result, startCoord, endCoord, provider: 'mapbox' };
  }
}

/**
 * Fetch driving directions from OSRM with intermediate waypoints.
 * Waypoints are inserted between origin and destination in the coordinate string.
 * Origin and destination are geocoded from address strings; waypoints use lat/lng directly.
 *
 * Uses the same Mapbox fallback policy as fetchDirections — Mapbox Directions
 * supports waypoints in the same coordinate-string format.
 */
export async function fetchDirectionsWithWaypoints(
  origin: string,
  destination: string,
  waypointCoords?: readonly { lat: number; lng: number }[],
): Promise<DirectionsResult> {
  // Geocode origin and destination addresses
  const [startCoord, endCoord] = await Promise.all([
    geocodeAddress(origin),
    geocodeAddress(destination),
  ]);

  // Build coordinate string: origin ; waypoints ; destination (OSRM uses lng,lat order)
  const coordParts = [`${startCoord.lng},${startCoord.lat}`];
  if (waypointCoords && waypointCoords.length > 0) {
    for (const wp of waypointCoords) {
      coordParts.push(`${wp.lng},${wp.lat}`);
    }
  }
  coordParts.push(`${endCoord.lng},${endCoord.lat}`);
  const coordinates = coordParts.join(';');

  try {
    const route = await callOsrm(coordinates);
    return {
      ...route,
      startAddress: origin,
      endAddress: destination,
      startCoord,
      endCoord,
      provider: 'osrm',
    };
  } catch (osrmError) {
    if (!shouldFallback(osrmError)) throw osrmError;

    const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
    if (!mapboxToken) throw osrmError;

    const reason = osrmError instanceof Error ? osrmError.message : String(osrmError);
    console.warn(
      `[routing] OSRM failed (${reason}); falling back to Mapbox Directions (with waypoints).`,
    );

    // For waypointed routes we send the same coordinate string to Mapbox.
    // The fallback client only supports start+end directly, so we pass them
    // and append the waypoints by reusing the same precision-5 + driving
    // parameters via a small inline call.
    const params = new URLSearchParams({
      access_token: mapboxToken,
      geometries: 'polyline',
      overview: 'full',
    });
    const response = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?${params}`,
      { signal: AbortSignal.timeout(10000) },
    );
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
      startAddress: origin,
      endAddress: destination,
      startCoord,
      endCoord,
      provider: 'mapbox',
    };
  }
}