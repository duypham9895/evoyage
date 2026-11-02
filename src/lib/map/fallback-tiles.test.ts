import { describe, expect, it } from 'vitest';
import {
  FALLBACK_TILE_ATTRIBUTION,
  FALLBACK_TILE_CLASS,
  FALLBACK_TILE_URL,
} from './fallback-tiles';

describe('Leaflet fallback tiles', () => {
  it('does not use CARTO basemaps, which now return an "API KEY REQUIRED" image without a key', () => {
    expect(FALLBACK_TILE_URL).not.toContain('cartocdn');
  });

  it('uses the keyless OpenStreetMap standard tile server allowed by the CSP img-src', () => {
    expect(FALLBACK_TILE_URL).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  });

  it('credits OpenStreetMap and no longer credits CARTO', () => {
    expect(FALLBACK_TILE_ATTRIBUTION).toContain('OpenStreetMap');
    expect(FALLBACK_TILE_ATTRIBUTION).not.toContain('CARTO');
  });

  it('exposes a class name so the light OSM tiles can be darkened to match the app', () => {
    expect(FALLBACK_TILE_CLASS).toMatch(/^[a-z][a-z0-9-]+$/);
  });
});
