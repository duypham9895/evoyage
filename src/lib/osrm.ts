/**
 * OSRM (Open Source Routing Machine) client.
 * Free, no API key, uses OpenStreetMap data.
 * Consistent with Leaflet/OSM map and Nominatim geocoding.
 */

interface DirectionsResult {
  readonly polyline: string;
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly startAddress: string;
  readonly endAddress: string;
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

/**
 * Fetch driving directions from OSRM.
 * Returns encoded polyline (Google format), distance, and duration.
 */
export async function fetchDirections(
  origin: string,
  destination: string,
): Promise<DirectionsResult> {
  // Geocode both addresses to coordinates
  const [startCoord, endCoord] = await Promise.all([
    geocodeAddress(origin),
    geocodeAddress(destination),
  ]);

  // OSRM expects lng,lat order
  const coordinates = `${startCoord.lng},${startCoord.lat};${endCoord.lng},${endCoord.lat}`;

  const response = await fetch(
    `${OSRM_BASE}/route/v1/driving/${coordinates}?overview=full&geometries=polyline`,
    { signal: AbortSignal.timeout(10000) },
  );

  if (!response.ok) {
    throw new Error(`OSRM routing error: ${response.status}`);
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
    startAddress: origin,
    endAddress: destination,
  };
}

/**
 * Fetch driving directions from OSRM with intermediate waypoints.
 * Waypoints are inserted between origin and destination in the coordinate string.
 * Origin and destination are geocoded from address strings; waypoints use lat/lng directly.
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

  const response = await fetch(
    `${OSRM_BASE}/route/v1/driving/${coordinates}?overview=full&geometries=polyline`,
    { signal: AbortSignal.timeout(10000) },
  );

  if (!response.ok) {
    throw new Error(`OSRM routing error: ${response.status}`);
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
    startAddress: origin,
    endAddress: destination,
  };
}