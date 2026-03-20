import { describe, it, expect } from 'vitest';

// Test the recent trips localStorage validation logic
// (mirrors the validation in TripInput.tsx RecentTrips component)

function validateRecentTrips(raw: unknown): { start: string; end: string; vehicleName?: string | null; timestamp: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (t: unknown): t is { start: string; end: string; vehicleName?: string | null; timestamp: number } =>
      typeof t === 'object' && t !== null && typeof (t as Record<string, unknown>).start === 'string' && typeof (t as Record<string, unknown>).end === 'string'
  );
}

describe('RecentTrips validation', () => {
  it('returns empty array for null', () => {
    expect(validateRecentTrips(null)).toEqual([]);
  });

  it('returns empty array for string', () => {
    expect(validateRecentTrips('not an array')).toEqual([]);
  });

  it('returns empty array for number', () => {
    expect(validateRecentTrips(42)).toEqual([]);
  });

  it('returns empty array for object', () => {
    expect(validateRecentTrips({ start: 'a', end: 'b' })).toEqual([]);
  });

  it('accepts valid trip objects', () => {
    const valid = [
      { start: 'HCM', end: 'Vung Tau', vehicleName: 'VF 8', timestamp: 1234567890 },
    ];
    expect(validateRecentTrips(valid)).toHaveLength(1);
    expect(validateRecentTrips(valid)[0].start).toBe('HCM');
  });

  it('filters out objects missing start', () => {
    const mixed = [
      { end: 'Vung Tau', timestamp: 123 },
      { start: 'HCM', end: 'Da Lat', timestamp: 456 },
    ];
    expect(validateRecentTrips(mixed)).toHaveLength(1);
  });

  it('filters out objects missing end', () => {
    const mixed = [
      { start: 'HCM', timestamp: 123 },
      { start: 'HCM', end: 'Da Lat', timestamp: 456 },
    ];
    expect(validateRecentTrips(mixed)).toHaveLength(1);
  });

  it('filters out non-string start/end', () => {
    const mixed = [
      { start: 123, end: 'Da Lat', timestamp: 456 },
      { start: 'HCM', end: null, timestamp: 456 },
      { start: 'HCM', end: 'Da Lat', timestamp: 456 },
    ];
    expect(validateRecentTrips(mixed)).toHaveLength(1);
  });

  it('handles empty array', () => {
    expect(validateRecentTrips([])).toEqual([]);
  });

  it('handles corrupted JSON that parses to valid but wrong types', () => {
    const corrupted = [null, undefined, 'string', 42, true];
    expect(validateRecentTrips(corrupted)).toEqual([]);
  });
});
