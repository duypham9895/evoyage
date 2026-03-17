/**
 * Nominatim (OpenStreetMap) geocoding client.
 * Free, no API key, consistent with Leaflet/OSM map tiles.
 * Rate limit: 1 request/second — enforced via debounce in UI.
 */

export interface NominatimResult {
  readonly placeId: number;
  readonly displayName: string;
  readonly lat: number;
  readonly lng: number;
  readonly type: string;
}

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<readonly NominatimResult[]> {
  if (query.trim().length < 2) return [];

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    countrycodes: 'vn',
    limit: '5',
    addressdetails: '1',
    'accept-language': 'vi,en',
  });

  const response = await fetch(`${NOMINATIM_BASE}/search?${params}`, {
    signal,
    headers: {
      'User-Agent': 'EVoyage/1.0 (https://evoyagevn.vercel.app)',
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim error: ${response.status}`);
  }

  const data: readonly Record<string, unknown>[] = await response.json();

  return data.map((item) => ({
    placeId: Number(item.place_id),
    displayName: String(item.display_name),
    lat: parseFloat(String(item.lat)),
    lng: parseFloat(String(item.lon)),
    type: String(item.type),
  }));
}