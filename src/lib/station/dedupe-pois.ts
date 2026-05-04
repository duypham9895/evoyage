/**
 * Collapse OSM duplicates from an Overpass result.
 *
 * OSM has frequent low-quality duplicates: the same physical place mapped
 * twice with slight tagger differences (case, whitespace, diacritics) or
 * jittered coordinates a few meters apart. The most common case in VN is
 * "Ba phương 20k" / "ba phương 20k" tagged at the same lat/lng.
 *
 * Dedupe key: (categorize-poi-derived bucket, normalized-name) within a
 * 30m radius. We deliberately:
 *   - Do NOT dedupe across categories (a "Vietcombank" ATM and "Vietcombank"
 *     pharmacy can legitimately co-exist; the user wants both surfaced).
 *   - Do NOT dedupe by coordinates alone when names are absent (two unnamed
 *     ATMs at the same coords could be a real branch + a freestanding ATM).
 *
 * Stable: preserves the input order of the rows that survive, so callers
 * who pre-sort by walking time keep that ordering.
 *
 * Pure, no I/O.
 */
import type { OsmPoi } from './overpass-client';
import { categorizePoi } from './categorize-poi';
import { haversineMeters } from './walking-distance';

const DUPLICATE_RADIUS_METERS = 30;

function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function dedupePois(pois: readonly OsmPoi[]): OsmPoi[] {
  const kept: OsmPoi[] = [];
  const keys: Array<{ category: string; normalizedName: string; lat: number; lng: number }> = [];

  for (const poi of pois) {
    if (!poi.name) {
      // No name → no reliable dedupe signal; keep as-is.
      kept.push(poi);
      continue;
    }
    const category = categorizePoi(poi);
    if (!category) {
      // Uncategorized → not surfaced anyway, but pass through; keeps this
      // helper independent of the downstream filter.
      kept.push(poi);
      continue;
    }
    const normalizedName = normalizeName(poi.name);
    const isDuplicate = keys.some(
      (k) =>
        k.category === category &&
        k.normalizedName === normalizedName &&
        haversineMeters({ lat: k.lat, lng: k.lng }, { lat: poi.lat, lng: poi.lng }) <=
          DUPLICATE_RADIUS_METERS,
    );
    if (isDuplicate) continue;
    kept.push(poi);
    keys.push({ category, normalizedName, lat: poi.lat, lng: poi.lng });
  }

  return kept;
}
