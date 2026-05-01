import { describe, it, expect } from 'vitest';
import {
  STATION_STATUS_VALUES,
  isValidStationStatus,
  normalizeStationStatus,
  minutesSince,
} from '@/lib/stations/station-status-validation';

describe('STATION_STATUS_VALUES', () => {
  it('contains exactly WORKING, BROKEN, BUSY in that order', () => {
    expect(STATION_STATUS_VALUES).toEqual(['WORKING', 'BROKEN', 'BUSY']);
  });
});

describe('isValidStationStatus', () => {
  it('accepts each canonical status value', () => {
    expect(isValidStationStatus('WORKING')).toBe(true);
    expect(isValidStationStatus('BROKEN')).toBe(true);
    expect(isValidStationStatus('BUSY')).toBe(true);
  });

  it('rejects lowercase variants (canonical form is upper-case)', () => {
    expect(isValidStationStatus('working')).toBe(false);
    expect(isValidStationStatus('broken')).toBe(false);
  });

  it('rejects unknown strings', () => {
    expect(isValidStationStatus('OFFLINE')).toBe(false);
    expect(isValidStationStatus('')).toBe(false);
    expect(isValidStationStatus('  ')).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(isValidStationStatus(null)).toBe(false);
    expect(isValidStationStatus(undefined)).toBe(false);
    expect(isValidStationStatus(0)).toBe(false);
    expect(isValidStationStatus({})).toBe(false);
    expect(isValidStationStatus([])).toBe(false);
  });
});

describe('normalizeStationStatus', () => {
  it('returns the canonical value when already canonical', () => {
    expect(normalizeStationStatus('WORKING')).toBe('WORKING');
    expect(normalizeStationStatus('BROKEN')).toBe('BROKEN');
    expect(normalizeStationStatus('BUSY')).toBe('BUSY');
  });

  it('uppercases and trims input before validating', () => {
    expect(normalizeStationStatus(' working ')).toBe('WORKING');
    expect(normalizeStationStatus('busy')).toBe('BUSY');
    expect(normalizeStationStatus('Broken')).toBe('BROKEN');
  });

  it('returns null for unknown strings', () => {
    expect(normalizeStationStatus('offline')).toBeNull();
    expect(normalizeStationStatus('')).toBeNull();
    expect(normalizeStationStatus('   ')).toBeNull();
  });

  it('returns null for non-string inputs', () => {
    expect(normalizeStationStatus(null)).toBeNull();
    expect(normalizeStationStatus(undefined)).toBeNull();
    expect(normalizeStationStatus(123)).toBeNull();
    expect(normalizeStationStatus({ status: 'WORKING' })).toBeNull();
  });
});

describe('minutesSince', () => {
  const NOW = new Date('2026-04-30T12:00:00Z');

  it('returns null for null / undefined input', () => {
    expect(minutesSince(null, NOW)).toBeNull();
    expect(minutesSince(undefined, NOW)).toBeNull();
  });

  it('returns 0 for the same instant', () => {
    expect(minutesSince(NOW, NOW)).toBe(0);
  });

  it('floors partial minutes', () => {
    const past = new Date(NOW.getTime() - 90_000); // 1.5 minutes ago
    expect(minutesSince(past, NOW)).toBe(1);
  });

  it('handles hours and days correctly', () => {
    const oneHourAgo = new Date(NOW.getTime() - 60 * 60_000);
    expect(minutesSince(oneHourAgo, NOW)).toBe(60);

    const oneDayAgo = new Date(NOW.getTime() - 24 * 60 * 60_000);
    expect(minutesSince(oneDayAgo, NOW)).toBe(60 * 24);
  });

  it('returns null for future timestamps (clock skew guard)', () => {
    const future = new Date(NOW.getTime() + 60_000);
    expect(minutesSince(future, NOW)).toBeNull();
  });
});
