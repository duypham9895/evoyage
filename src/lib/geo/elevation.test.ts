import { describe, it, expect } from 'vitest';
import {
  samplePolylinePoints,
  calculateElevationProfile,
  smoothElevations,
} from './elevation';
import { encodePolyline } from './polyline';
import type { LatLng } from '@/types';

// Helper: create a straight polyline from HCM roughly north
function makeLinearPolyline(points: readonly LatLng[]): string {
  return encodePolyline(points);
}

// ~111km per degree of latitude
function makePointsAlongMeridian(
  startLat: number,
  lng: number,
  count: number,
  stepDegrees: number,
): readonly LatLng[] {
  return Array.from({ length: count }, (_, i) => ({
    lat: startLat + i * stepDegrees,
    lng,
  }));
}

describe('samplePolylinePoints', () => {
  it('returns empty for empty polyline', () => {
    expect(samplePolylinePoints('', 2)).toEqual([]);
  });

  it('returns single point for single-point polyline', () => {
    const poly = makeLinearPolyline([{ lat: 10, lng: 106 }]);
    const result = samplePolylinePoints(poly, 2);
    expect(result).toHaveLength(1);
    expect(result[0].distanceKm).toBe(0);
  });

  it('returns zero interval as empty', () => {
    const poly = makeLinearPolyline([
      { lat: 10, lng: 106 },
      { lat: 11, lng: 106 },
    ]);
    expect(samplePolylinePoints(poly, 0)).toEqual([]);
  });

  it('produces correct number of points at intervals', () => {
    // ~111km apart (1 degree latitude)
    const points = makePointsAlongMeridian(10, 106, 3, 1);
    const poly = makeLinearPolyline(points);

    // 2 segments of ~111km = ~222km total
    // At 50km intervals: 0, 50, 100, 150, 200, + endpoint ~222
    const result = samplePolylinePoints(poly, 50);

    // Should have first + several intermediates + last
    expect(result.length).toBeGreaterThanOrEqual(5);
    expect(result[0].distanceKm).toBe(0);

    // Check monotonically increasing distances
    for (let i = 1; i < result.length; i++) {
      expect(result[i].distanceKm).toBeGreaterThan(result[i - 1].distanceKm);
    }
  });

  it('includes endpoint even if not on interval boundary', () => {
    const points = makePointsAlongMeridian(10, 106, 2, 1);
    const poly = makeLinearPolyline(points);
    const result = samplePolylinePoints(poly, 50);

    const lastPoint = result[result.length - 1];
    // Should be roughly 111km
    expect(lastPoint.distanceKm).toBeGreaterThan(100);
    expect(lastPoint.distanceKm).toBeLessThan(120);
  });

  it('lngLat values are [lng, lat] not [lat, lng]', () => {
    const poly = makeLinearPolyline([{ lat: 10.5, lng: 106.7 }]);
    const result = samplePolylinePoints(poly, 2);
    expect(result[0].lngLat[0]).toBeCloseTo(106.7, 1);
    expect(result[0].lngLat[1]).toBeCloseTo(10.5, 1);
  });
});

describe('smoothElevations', () => {
  it('returns same values for 2 or fewer points', () => {
    expect(smoothElevations([100])).toEqual([100]);
    expect(smoothElevations([100, 200])).toEqual([100, 200]);
  });

  it('applies 3-point moving average to interior points', () => {
    const raw = [100, 200, 100, 200, 100];
    const smoothed = smoothElevations(raw);

    // First and last unchanged
    expect(smoothed[0]).toBe(100);
    expect(smoothed[4]).toBe(100);

    // Middle points averaged: (100+200+100)/3 ≈ 133.33
    expect(smoothed[1]).toBeCloseTo(133.33, 1);
    expect(smoothed[2]).toBeCloseTo(166.67, 1);
    expect(smoothed[3]).toBeCloseTo(133.33, 1);
  });

  it('preserves null values', () => {
    const raw: (number | null)[] = [100, null, 300];
    const smoothed = smoothElevations(raw);
    expect(smoothed[1]).toBeNull();
  });

  it('does not smooth adjacent to null values', () => {
    const raw: (number | null)[] = [100, 200, null, 400, 500];
    const smoothed = smoothElevations(raw);
    // Point at index 1: prev=100, next=null → no smoothing
    expect(smoothed[1]).toBe(200);
    // Point at index 3: prev=null, next=500 → no smoothing
    expect(smoothed[3]).toBe(400);
  });
});

describe('calculateElevationProfile', () => {
  it('returns empty profile for no points', () => {
    const profile = calculateElevationProfile([], []);
    expect(profile.points).toHaveLength(0);
    expect(profile.shouldDisplay).toBe(false);
  });

  it('returns empty profile for all-null elevations', () => {
    const sampled = [
      { distanceKm: 0, lngLat: [106, 10] as [number, number] },
      { distanceKm: 5, lngLat: [106, 10.05] as [number, number] },
    ];
    const profile = calculateElevationProfile(sampled, [null, null]);
    expect(profile.points).toHaveLength(0);
    expect(profile.shouldDisplay).toBe(false);
  });

  it('handles single valid elevation point', () => {
    const sampled = [
      { distanceKm: 0, lngLat: [106, 10] as [number, number] },
    ];
    const profile = calculateElevationProfile(sampled, [500]);
    expect(profile.points).toHaveLength(1);
    expect(profile.totalAscentM).toBe(0);
    expect(profile.totalDescentM).toBe(0);
    expect(profile.maxElevationM).toBe(500);
    expect(profile.minElevationM).toBe(500);
  });

  describe('gradient calculation', () => {
    it('calculates positive gradient correctly', () => {
      // 100m rise over 1km = 10% gradient
      const sampled = [
        { distanceKm: 0, lngLat: [106, 10] as [number, number] },
        { distanceKm: 1, lngLat: [106, 10.01] as [number, number] },
      ];
      const profile = calculateElevationProfile(sampled, [0, 100]);

      expect(profile.points[1].gradient).toBeCloseTo(10, 0);
      expect(profile.totalAscentM).toBe(100);
      expect(profile.totalDescentM).toBe(0);
    });

    it('calculates negative gradient correctly', () => {
      const sampled = [
        { distanceKm: 0, lngLat: [106, 10] as [number, number] },
        { distanceKm: 2, lngLat: [106, 10.02] as [number, number] },
      ];
      // Drop 100m over 2km = -5%
      const profile = calculateElevationProfile(sampled, [500, 400]);

      expect(profile.points[1].gradient).toBeCloseTo(-5, 0);
      expect(profile.totalDescentM).toBe(100);
    });
  });

  describe('shouldDisplay threshold', () => {
    it('true when gradient exceeds 5%', () => {
      // 60m over 1km = 6% (just above threshold)
      const sampled = [
        { distanceKm: 0, lngLat: [106, 10] as [number, number] },
        { distanceKm: 1, lngLat: [106, 10.01] as [number, number] },
      ];
      const profile = calculateElevationProfile(sampled, [0, 60]);
      expect(profile.shouldDisplay).toBe(true);
    });

    it('true when total ascent exceeds 500m', () => {
      // Gentle but long climb: 510m over many segments
      // Each segment: 51m over 5km = ~1% gradient (below 5%)
      const count = 11;
      const sampled = Array.from({ length: count }, (_, i) => ({
        distanceKm: i * 5,
        lngLat: [106, 10 + i * 0.05] as [number, number],
      }));
      const elevations = Array.from({ length: count }, (_, i) => i * 51);
      const profile = calculateElevationProfile(sampled, elevations);

      expect(profile.maxGradientPercent).toBeLessThanOrEqual(5);
      expect(profile.totalAscentM).toBeGreaterThan(500);
      expect(profile.shouldDisplay).toBe(true);
    });

    it('false for flat route', () => {
      const sampled = [
        { distanceKm: 0, lngLat: [106, 10] as [number, number] },
        { distanceKm: 10, lngLat: [106, 10.1] as [number, number] },
        { distanceKm: 20, lngLat: [106, 10.2] as [number, number] },
      ];
      const profile = calculateElevationProfile(sampled, [5, 6, 5]);
      expect(profile.shouldDisplay).toBe(false);
    });
  });

  describe('steep section detection', () => {
    it('detects a single steep section', () => {
      // Points: flat, steep, steep, flat
      const sampled = [
        { distanceKm: 0, lngLat: [106, 10] as [number, number] },
        { distanceKm: 1, lngLat: [106, 10.01] as [number, number] },
        { distanceKm: 2, lngLat: [106, 10.02] as [number, number] },
        { distanceKm: 3, lngLat: [106, 10.03] as [number, number] },
      ];
      // 0→1: 60m/km = 6% (steep)
      // 1→2: 60m/km = 6% (steep)
      // 2→3: 5m/km = 0.5% (flat)
      const profile = calculateElevationProfile(sampled, [0, 60, 120, 125]);

      expect(profile.steepSections.length).toBeGreaterThanOrEqual(1);
      const section = profile.steepSections[0];
      expect(section.startIdx).toBe(1);
    });

    it('returns no steep sections for flat terrain', () => {
      const sampled = [
        { distanceKm: 0, lngLat: [106, 10] as [number, number] },
        { distanceKm: 10, lngLat: [106, 10.1] as [number, number] },
      ];
      const profile = calculateElevationProfile(sampled, [100, 101]);
      expect(profile.steepSections).toHaveLength(0);
    });

    it('detects multiple steep sections', () => {
      // Use very wide flat gap (4 flat points) so smoothing can't bridge across
      const sampled = Array.from({ length: 11 }, (_, i) => ({
        distanceKm: i * 1,
        lngLat: [106, 10 + i * 0.01] as [number, number],
      }));
      // steep section 1: indices 1-2 (big jumps)
      // flat plateau: indices 3-7 (no change)
      // steep section 2: indices 8-9 (big jumps)
      const elevations = [0, 100, 200, 200, 200, 200, 200, 200, 300, 400, 400];
      const profile = calculateElevationProfile(sampled, elevations);

      expect(profile.steepSections.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('calculates max and min elevation', () => {
    const sampled = [
      { distanceKm: 0, lngLat: [106, 10] as [number, number] },
      { distanceKm: 5, lngLat: [106, 10.05] as [number, number] },
      { distanceKm: 10, lngLat: [106, 10.1] as [number, number] },
    ];
    const profile = calculateElevationProfile(sampled, [100, 1500, 300]);
    // Smoothing will affect interior point: (100+1500+300)/3 ≈ 633
    expect(profile.maxElevationM).toBeGreaterThan(100);
    expect(profile.minElevationM).toBeLessThanOrEqual(300);
  });

  it('rounds ascent/descent to integers', () => {
    const sampled = [
      { distanceKm: 0, lngLat: [106, 10] as [number, number] },
      { distanceKm: 1, lngLat: [106, 10.01] as [number, number] },
    ];
    const profile = calculateElevationProfile(sampled, [0, 33]);
    expect(Number.isInteger(profile.totalAscentM)).toBe(true);
  });
});
