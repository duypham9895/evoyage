import { describe, it, expect } from 'vitest';
import { getBatteryLevel } from './battery-level';

describe('getBatteryLevel', () => {
  it('is danger below the user minimum arrival (min 15: 14 → danger)', () => {
    expect(getBatteryLevel(14, 15)).toBe('danger');
    expect(getBatteryLevel(0, 15)).toBe('danger');
  });

  it('is warn from the minimum up to 15 points above it (min 15: 15 and 29 → warn)', () => {
    expect(getBatteryLevel(15, 15)).toBe('warn');
    expect(getBatteryLevel(29, 15)).toBe('warn');
  });

  it('is safe at 15 points above the minimum or more (min 15: 30 → safe)', () => {
    expect(getBatteryLevel(30, 15)).toBe('safe');
    expect(getBatteryLevel(100, 15)).toBe('safe');
  });

  it('moves the thresholds with the minimum (min 25: 24 danger, 25/39 warn, 40 safe)', () => {
    expect(getBatteryLevel(24, 25)).toBe('danger');
    expect(getBatteryLevel(25, 25)).toBe('warn');
    expect(getBatteryLevel(39, 25)).toBe('warn');
    expect(getBatteryLevel(40, 25)).toBe('safe');
  });
});
