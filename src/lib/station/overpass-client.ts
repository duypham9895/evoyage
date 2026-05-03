/**
 * Overpass API client for the Phase 4 Charging Stop Amenities feature.
 *
 * Overpass is OpenStreetMap's read-only query API. We hit the public endpoint
 * at overpass-api.de — free for non-commercial use, ~10k requests/day soft
 * limit per IP. With the 30-day Postgres cache and the daily warmer for top
 * 50 stations, projected hits are ≪ limit even at 1000s of users/day.
 *
 * Returns nodes only (we don't care about ways/relations for POIs).
 *
 * See docs/specs/2026-05-03-phase-4-charging-stop-amenities-design.md §3a.
 */

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const REQUEST_TIMEOUT_MS = 30_000;

// Amenity types we surface to drivers — aligned with the categorization in §3b.
const AMENITY_TYPES = [
  'restaurant',
  'cafe',
  'fast_food',
  'atm',
  'toilets',
  'fuel',
  'pharmacy',
] as const;

export interface OsmPoi {
  readonly id: number;
  readonly lat: number;
  readonly lng: number;
  readonly name: string | null;
  readonly amenity: string;
  readonly tags: Readonly<Record<string, string>>;
}

export interface QueryNearbyPoisOptions {
  readonly lat: number;
  readonly lng: number;
  readonly radiusMeters: number;
}

export type OverpassErrorKind =
  | 'rate_limited'
  | 'network_error'
  | 'parse_error'
  | 'timeout';

export class OverpassError extends Error {
  public readonly kind: OverpassErrorKind;
  public readonly statusCode?: number;

  constructor(kind: OverpassErrorKind, message: string, statusCode?: number) {
    super(message);
    this.name = 'OverpassError';
    this.kind = kind;
    this.statusCode = statusCode;
  }
}

interface OverpassNode {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
}

function buildQuery(opts: QueryNearbyPoisOptions): string {
  const amenityRegex = AMENITY_TYPES.join('|');
  return [
    '[out:json][timeout:25];',
    `node[amenity~"^(${amenityRegex})$"](around:${opts.radiusMeters},${opts.lat},${opts.lng});`,
    'out body;',
  ].join('\n');
}

export async function queryNearbyPois(
  opts: QueryNearbyPoisOptions,
): Promise<readonly OsmPoi[]> {
  const body = buildQuery(opts);

  let response: Response;
  try {
    response = await fetch(OVERPASS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new OverpassError('timeout', `Request exceeded ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw new OverpassError(
      'network_error',
      err instanceof Error ? err.message : 'unknown network failure',
    );
  }

  if (response.status === 429) {
    throw new OverpassError('rate_limited', 'Overpass rate limit hit', 429);
  }
  if (!response.ok) {
    throw new OverpassError(
      'network_error',
      `Overpass returned ${response.status}`,
      response.status,
    );
  }

  const text = await response.text();
  let json: { elements?: OverpassNode[] };
  try {
    json = JSON.parse(text) as { elements?: OverpassNode[] };
  } catch {
    throw new OverpassError('parse_error', 'Response was not valid JSON');
  }

  const elements = json.elements ?? [];
  return elements
    .filter(
      (el): el is Required<Pick<OverpassNode, 'type' | 'id' | 'lat' | 'lon'>> & OverpassNode =>
        el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number',
    )
    .map((node) => ({
      id: node.id,
      lat: node.lat,
      lng: node.lon,
      name: node.tags?.name ?? null,
      amenity: node.tags?.amenity ?? 'unknown',
      tags: node.tags ?? {},
    }));
}
