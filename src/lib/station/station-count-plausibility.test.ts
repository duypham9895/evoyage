import { describe, it, expect } from 'vitest';
import { assertPlausibleStationCount } from './station-count-plausibility';

describe('assertPlausibleStationCount', () => {
  describe('positivity of `next` (no previous count available)', () => {
    it('does not throw for a positive integer', () => {
      expect(() => assertPlausibleStationCount(24_774, undefined)).not.toThrow();
    });

    it('throws for zero', () => {
      expect(() => assertPlausibleStationCount(0, undefined)).toThrow();
    });

    it('throws for a negative number', () => {
      expect(() => assertPlausibleStationCount(-5, undefined)).toThrow();
    });

    it('throws for NaN', () => {
      expect(() => assertPlausibleStationCount(NaN, undefined)).toThrow();
    });

    it('throws for Infinity', () => {
      expect(() => assertPlausibleStationCount(Infinity, undefined)).toThrow();
    });

    it('throws for a non-integer', () => {
      expect(() => assertPlausibleStationCount(24_773.5, undefined)).toThrow();
    });
  });

  describe('ratio check against `previous`', () => {
    it('does not throw for a small legitimate daily increase', () => {
      expect(() => assertPlausibleStationCount(24_774, 24_773)).not.toThrow();
    });

    it('does not throw for a small legitimate daily decrease', () => {
      expect(() => assertPlausibleStationCount(24_770, 24_773)).not.toThrow();
    });

    it('does not throw exactly at the 50% floor (inclusive)', () => {
      expect(() => assertPlausibleStationCount(50, 100)).not.toThrow();
    });

    it('throws just under the 50% floor', () => {
      expect(() => assertPlausibleStationCount(49, 100)).toThrow();
    });

    it('throws for a feed collapsed to a tiny fraction of the previous count', () => {
      expect(() => assertPlausibleStationCount(100, 24_800)).toThrow(/24.?800/);
    });

    it('mentions both counts in the error message', () => {
      expect(() => assertPlausibleStationCount(100, 24_800)).toThrow(/100/);
    });
  });

  describe('no previous count (first run / missing stats file)', () => {
    it('does not throw for a positive count when previous is undefined', () => {
      expect(() => assertPlausibleStationCount(1, undefined)).not.toThrow();
    });

    it('does not throw when previous is zero (treated as absent)', () => {
      expect(() => assertPlausibleStationCount(1, 0)).not.toThrow();
    });

    it('does not throw when previous is negative (treated as absent)', () => {
      expect(() => assertPlausibleStationCount(1, -1)).not.toThrow();
    });

    it('does not throw when previous is NaN (treated as absent)', () => {
      expect(() => assertPlausibleStationCount(1, NaN)).not.toThrow();
    });
  });
});
