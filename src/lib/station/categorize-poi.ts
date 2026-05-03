/**
 * Map a raw OSM POI to a user-facing category aligned with the question
 * "what fits in my charge window?"
 *
 *   quick-bite   → < 25 min charge:  fast_food, cafe (no cuisine)
 *   sit-down     → ≥ 30 min charge:  restaurant, cafe with cuisine tag
 *   essentials   → always useful:    atm, toilets, pharmacy
 *   fuel         → for non-EV passengers: fuel
 *
 * Returns null for amenities outside this set (we filter before display).
 *
 * Per spec §3b. Pure function, no I/O.
 */
import type { OsmPoi } from './overpass-client';

export type AmenityCategory = 'quick-bite' | 'sit-down' | 'essentials' | 'fuel';

export function categorizePoi(poi: OsmPoi): AmenityCategory | null {
  switch (poi.amenity) {
    case 'restaurant':
      return 'sit-down';
    case 'fast_food':
      return 'quick-bite';
    case 'cafe':
      // OSM convention: a cafe with a `cuisine` tag tends to serve full meals
      // (e.g., "vietnamese", "italian"). One without is more of a coffee/light-
      // bite spot. The cuisine tag is the cleanest available signal.
      return poi.tags.cuisine ? 'sit-down' : 'quick-bite';
    case 'atm':
    case 'toilets':
    case 'pharmacy':
      return 'essentials';
    case 'fuel':
      return 'fuel';
    default:
      return null;
  }
}
