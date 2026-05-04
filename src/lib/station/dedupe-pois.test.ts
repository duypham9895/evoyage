import { describe, it, expect } from 'vitest';
import { dedupePois } from './dedupe-pois';
import type { OsmPoi } from './overpass-client';

function poi(over: Partial<OsmPoi> & Pick<OsmPoi, 'id' | 'lat' | 'lng' | 'amenity'>): OsmPoi {
  return {
    name: null,
    tags: {},
    ...over,
  };
}

describe('dedupePois', () => {
  it('returns input unchanged when no duplicates', () => {
    const input: OsmPoi[] = [
      poi({ id: 1, lat: 11.388, lng: 107.542, amenity: 'restaurant', name: 'Phở 24' }),
      poi({ id: 2, lat: 11.389, lng: 107.543, amenity: 'fuel', name: 'Saigon Petro' }),
    ];
    expect(dedupePois(input)).toHaveLength(2);
  });

  it('collapses the "Ba phương 20k" / "ba phương 20k" OSM duplicate (case + whitespace insensitive)', () => {
    const input: OsmPoi[] = [
      poi({ id: 1, lat: 11.3886, lng: 107.5421, amenity: 'restaurant', name: 'Ba phương 20k' }),
      poi({ id: 2, lat: 11.3886, lng: 107.5421, amenity: 'restaurant', name: 'ba phương 20k' }),
    ];
    const out = dedupePois(input);
    expect(out).toHaveLength(1);
    // Keeps the first occurrence (stable, predictable for ranked input)
    expect(out[0].id).toBe(1);
  });

  it('treats names with diacritics + ASCII as equivalent', () => {
    const input: OsmPoi[] = [
      poi({ id: 1, lat: 11.3886, lng: 107.5421, amenity: 'restaurant', name: 'Phở 24' }),
      poi({ id: 2, lat: 11.3886, lng: 107.5421, amenity: 'restaurant', name: 'Pho 24' }),
    ];
    expect(dedupePois(input)).toHaveLength(1);
  });

  it('does not collapse same name across DIFFERENT categories', () => {
    // A Saigon Petro fuel station can have a co-located convenience cafe of
    // the same brand — distinct categories the driver would want to see
    // separately ("can I gas up?" vs "can I get a coffee?").
    const input: OsmPoi[] = [
      poi({ id: 1, lat: 11.3886, lng: 107.5421, amenity: 'fuel', name: 'Saigon Petro' }),
      poi({ id: 2, lat: 11.3886, lng: 107.5421, amenity: 'cafe', name: 'Saigon Petro' }),
    ];
    expect(dedupePois(input)).toHaveLength(2);
  });

  it('does not collapse same name 200m apart (different chain locations)', () => {
    // Bach hoa XANH at two different street numbers along a QL highway —
    // both legitimate destinations.
    const input: OsmPoi[] = [
      poi({ id: 1, lat: 11.3886, lng: 107.5421, amenity: 'fuel', name: 'Saigon Petro' }),
      // ~200m away
      poi({ id: 2, lat: 11.39044, lng: 107.5421, amenity: 'fuel', name: 'Saigon Petro' }),
    ];
    expect(dedupePois(input)).toHaveLength(2);
  });

  it('collapses same name within ~30m (typical OSM tagger jitter)', () => {
    // Two nodes for the same restaurant tagged a few meters apart — a single
    // physical place, deduped.
    const input: OsmPoi[] = [
      poi({ id: 1, lat: 11.3886, lng: 107.5421, amenity: 'restaurant', name: 'Thung lũng xanh' }),
      // ~10m away — same place, jittered tag
      poi({ id: 2, lat: 11.38869, lng: 107.5421, amenity: 'restaurant', name: 'Thung lũng xanh' }),
    ];
    expect(dedupePois(input)).toHaveLength(1);
  });

  it('handles unnamed POIs without crashing (no name → no name-based collapse)', () => {
    // Two unnamed ATMs at near-identical coords — we don't dedupe these
    // since we have no name signal; coord-only collapse would risk false
    // merges of distinct services.
    const input: OsmPoi[] = [
      poi({ id: 1, lat: 11.3886, lng: 107.5421, amenity: 'atm', name: null }),
      poi({ id: 2, lat: 11.3886, lng: 107.5421, amenity: 'atm', name: null }),
    ];
    expect(dedupePois(input)).toHaveLength(2);
  });

  it('preserves original ordering of kept rows', () => {
    const input: OsmPoi[] = [
      poi({ id: 1, lat: 11.3886, lng: 107.5421, amenity: 'restaurant', name: 'Phở A' }),
      poi({ id: 2, lat: 11.3890, lng: 107.5430, amenity: 'fuel', name: 'Petro' }),
      poi({ id: 3, lat: 11.3886, lng: 107.5421, amenity: 'restaurant', name: 'phở a' }),
    ];
    const out = dedupePois(input);
    expect(out.map((p) => p.id)).toEqual([1, 2]);
  });
});
