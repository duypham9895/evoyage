import { describe, it, expect } from 'vitest';
import { categorizePoi } from './categorize-poi';
import type { OsmPoi } from './overpass-client';

function poi(amenity: string, tags: Record<string, string> = {}): OsmPoi {
  return {
    id: 1,
    lat: 10.78,
    lng: 106.7,
    name: 'Test',
    amenity,
    tags: { amenity, ...tags },
  };
}

describe('categorizePoi', () => {
  it('classifies restaurant as sit-down', () => {
    expect(categorizePoi(poi('restaurant'))).toBe('sit-down');
  });

  it('classifies fast_food as quick-bite', () => {
    expect(categorizePoi(poi('fast_food'))).toBe('quick-bite');
  });

  it('classifies cafe WITHOUT cuisine tag as quick-bite (espresso bar style)', () => {
    expect(categorizePoi(poi('cafe'))).toBe('quick-bite');
  });

  it('classifies cafe WITH cuisine tag as sit-down (full menu)', () => {
    expect(categorizePoi(poi('cafe', { cuisine: 'vietnamese' }))).toBe('sit-down');
  });

  it('classifies atm as essentials', () => {
    expect(categorizePoi(poi('atm'))).toBe('essentials');
  });

  it('classifies toilets as essentials', () => {
    expect(categorizePoi(poi('toilets'))).toBe('essentials');
  });

  it('classifies pharmacy as essentials', () => {
    expect(categorizePoi(poi('pharmacy'))).toBe('essentials');
  });

  it('classifies fuel as fuel', () => {
    expect(categorizePoi(poi('fuel'))).toBe('fuel');
  });

  it('returns null for unrecognized amenity types', () => {
    expect(categorizePoi(poi('library'))).toBeNull();
    expect(categorizePoi(poi('cinema'))).toBeNull();
  });
});
