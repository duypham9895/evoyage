import { describe, it, expect } from 'vitest';
import { buildStaticMapUrl } from '../static-map';
import type { StaticMapMarker } from '../static-map';

const BASE_OPTIONS = {
  polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
  markers: [
    { lng: 106.6, lat: 10.8, label: 'a', color: '22c55e' },
    { lng: 108.4, lat: 11.9, label: 'b', color: 'ef4444' },
  ] as readonly StaticMapMarker[],
  width: 1200,
  height: 380,
  accessToken: 'pk.test_token_123',
};

describe('buildStaticMapUrl', () => {
  it('builds a valid URL with path and markers', () => {
    const url = buildStaticMapUrl(BASE_OPTIONS);
    expect(url).toContain('https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/');
    expect(url).toContain('path-3+3b82f6-0.8(');
    expect(url).toContain('pin-s-a+22c55e(106.6,10.8)');
    expect(url).toContain('pin-s-b+ef4444(108.4,11.9)');
    expect(url).toContain('auto/1200x380@2x');
    expect(url).toContain('access_token=pk.test_token_123');
    expect(url).toContain('padding=40');
  });

  it('uses default dark-v11 style', () => {
    const url = buildStaticMapUrl(BASE_OPTIONS);
    expect(url).toContain('mapbox/dark-v11');
  });

  it('accepts custom style', () => {
    const url = buildStaticMapUrl({
      ...BASE_OPTIONS,
      style: 'mapbox/streets-v12',
    });
    expect(url).toContain('mapbox/streets-v12');
    expect(url).not.toContain('dark-v11');
  });

  it('formats charging stop markers correctly', () => {
    const markers: readonly StaticMapMarker[] = [
      { lng: 106.5, lat: 10.5, label: 'a', color: '22c55e' },
      { lng: 107.0, lat: 11.0, label: 'lightning', color: 'eab308' },
      { lng: 108.0, lat: 11.5, label: 'b', color: 'ef4444' },
    ];
    const url = buildStaticMapUrl({ ...BASE_OPTIONS, markers });
    expect(url).toContain('pin-s-lightning+eab308(107,11)');
  });

  it('throws if URL exceeds 8192 characters', () => {
    // Create an extremely long polyline
    const longPolyline = 'a'.repeat(8200);
    expect(() =>
      buildStaticMapUrl({
        ...BASE_OPTIONS,
        polyline: longPolyline,
      }),
    ).toThrow(/exceeds maximum length/);
  });

  it('handles empty markers array', () => {
    const url = buildStaticMapUrl({
      ...BASE_OPTIONS,
      markers: [],
    });
    expect(url).toContain('path-3+3b82f6-0.8(');
    expect(url).toContain('auto/1200x380@2x');
  });
});
