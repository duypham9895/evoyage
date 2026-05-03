import { describe, expect, it } from 'vitest';
import { haversineMeters, isDuplicateCandidate } from './dedup';

describe('haversineMeters', () => {
  it('returns 0 for identical coordinates', () => {
    const d = haversineMeters({ lat: 10.762622, lng: 106.660172 }, { lat: 10.762622, lng: 106.660172 });
    expect(d).toBe(0);
  });

  it('measures small distances within ~1m accuracy at HCMC latitude', () => {
    // ~50m east of (10.762622, 106.660172) is roughly +0.000456 lng
    const d = haversineMeters(
      { lat: 10.762622, lng: 106.660172 },
      { lat: 10.762622, lng: 106.660628 },
    );
    expect(d).toBeGreaterThan(48);
    expect(d).toBeLessThan(52);
  });

  it('measures the rough HCMC ↔ Hanoi great-circle distance', () => {
    const d = haversineMeters(
      { lat: 10.7626, lng: 106.6602 }, // HCMC
      { lat: 21.0285, lng: 105.8542 }, // Hanoi
    );
    expect(d).toBeGreaterThan(1_140_000);
    expect(d).toBeLessThan(1_180_000);
  });

  it('is symmetric', () => {
    const a = { lat: 16.054407, lng: 108.202164 };
    const b = { lat: 16.0473, lng: 108.2068 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
  });
});

describe('isDuplicateCandidate', () => {
  const existing = { latitude: 10.762622, longitude: 106.660172, name: 'V-GREEN Vincom Đồng Khởi' };

  it('flags an exact-coordinate, similar-name station as duplicate', () => {
    const candidate = { lat: 10.762622, lng: 106.660172, name: 'V-GREEN Vincom Đồng Khởi' };
    expect(isDuplicateCandidate(existing, candidate, 50)).toBe(true);
  });

  it('flags a within-50m, similar-name station as duplicate', () => {
    const candidate = { lat: 10.762622, lng: 106.660628, name: 'V-GREEN Vincom Đồng Khởi DC' }; // ~50m
    expect(isDuplicateCandidate(existing, candidate, 50)).toBe(true);
  });

  it('does NOT flag a within-50m station with a clearly different name (dual-side highway case)', () => {
    const candidate = { lat: 10.762622, lng: 106.660628, name: 'EVPower Highway Westbound' };
    expect(isDuplicateCandidate(existing, candidate, 50)).toBe(false);
  });

  it('does NOT flag a beyond-50m station as duplicate even with same name', () => {
    const candidate = { lat: 10.7635, lng: 106.6602, name: 'V-GREEN Vincom Đồng Khởi' }; // ~140m
    expect(isDuplicateCandidate(existing, candidate, 50)).toBe(false);
  });

  it('treats null/empty existing name as ambiguous and falls back to coordinate-only check', () => {
    const noName = { latitude: 10.762622, longitude: 106.660172, name: '' };
    const candidate = { lat: 10.762622, lng: 106.660172, name: 'Some Station' };
    expect(isDuplicateCandidate(noName, candidate, 50)).toBe(true);
  });
});
