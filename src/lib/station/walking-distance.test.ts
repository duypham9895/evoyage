import { describe, it, expect } from 'vitest';
import { haversineMeters, walkingTimeMinutes } from './walking-distance';

describe('haversineMeters', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMeters({ lat: 10.78, lng: 106.7 }, { lat: 10.78, lng: 106.7 })).toBe(0);
  });

  it('computes ~111 km between 1° latitude apart', () => {
    const dist = haversineMeters({ lat: 10, lng: 106.7 }, { lat: 11, lng: 106.7 });
    // 1° lat ≈ 111 km, accept ±1km tolerance
    expect(dist).toBeGreaterThan(110_000);
    expect(dist).toBeLessThan(112_000);
  });

  it('computes a known short distance accurately', () => {
    // Two points ~280m apart in Saigon (Quận 1)
    const a = { lat: 10.7769, lng: 106.7009 };
    const b = { lat: 10.7794, lng: 106.7009 }; // ~280m due north
    const dist = haversineMeters(a, b);
    expect(dist).toBeGreaterThan(270);
    expect(dist).toBeLessThan(290);
  });

  it('is symmetric', () => {
    const a = { lat: 10.78, lng: 106.7 };
    const b = { lat: 11.94, lng: 108.45 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 0);
  });
});

describe('walkingTimeMinutes', () => {
  it('returns 0 for 0 meters', () => {
    expect(walkingTimeMinutes(0)).toBe(0);
  });

  it('rounds 80 meters to 1 minute (80 m/min reference pace)', () => {
    expect(walkingTimeMinutes(80)).toBe(1);
  });

  it('rounds 120 meters to 2 minutes (1.5 min → ceil)', () => {
    expect(walkingTimeMinutes(120)).toBe(2);
  });

  it('rounds 280 meters to 4 minutes', () => {
    // 280 / 80 = 3.5 min → ceil 4
    expect(walkingTimeMinutes(280)).toBe(4);
  });

  it('rounds up to nearest minute (never returns fractional)', () => {
    expect(walkingTimeMinutes(81)).toBe(2);
    expect(walkingTimeMinutes(159)).toBe(2);
    expect(walkingTimeMinutes(160)).toBe(2);
    expect(walkingTimeMinutes(161)).toBe(3);
  });
});
