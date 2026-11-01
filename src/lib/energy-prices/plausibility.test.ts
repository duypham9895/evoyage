import { describe, it, expect } from 'vitest';
import {
  assertPlausibleVnd,
  FUEL_VND_PER_LITER_BOUNDS,
  ELECTRICITY_VND_PER_KWH_BOUNDS,
} from './plausibility';

describe('assertPlausibleVnd', () => {
  const BOUNDS = { min: 0, max: 100_000 };

  it('does not throw for a value within bounds', () => {
    expect(() => assertPlausibleVnd(24_650, 'test', BOUNDS)).not.toThrow();
  });

  it('does not throw for a value exactly at the max (inclusive)', () => {
    expect(() => assertPlausibleVnd(100_000, 'test', BOUNDS)).not.toThrow();
  });

  it('throws for a value exactly at min (exclusive)', () => {
    expect(() => assertPlausibleVnd(0, 'test', BOUNDS)).toThrow(/test/);
  });

  it('throws for a negative value', () => {
    expect(() => assertPlausibleVnd(-100, 'test', BOUNDS)).toThrow(/test/);
  });

  it('throws for a value above max', () => {
    expect(() => assertPlausibleVnd(100_001, 'test', BOUNDS)).toThrow(/test/);
  });

  it('throws for NaN', () => {
    expect(() => assertPlausibleVnd(NaN, 'test', BOUNDS)).toThrow(/test/);
  });

  it('throws for Infinity', () => {
    expect(() => assertPlausibleVnd(Infinity, 'test', BOUNDS)).toThrow(/test/);
  });

  it('includes the label in the error message', () => {
    expect(() => assertPlausibleVnd(-1, 'Petrolimex parser: ron95iii', BOUNDS)).toThrow(
      /Petrolimex parser: ron95iii/,
    );
  });

  describe('FUEL_VND_PER_LITER_BOUNDS', () => {
    it('accepts a realistic 2026 gasoline price', () => {
      expect(() =>
        assertPlausibleVnd(24_650, 'fuel', FUEL_VND_PER_LITER_BOUNDS),
      ).not.toThrow();
    });

    it('rejects a value an order of magnitude too high', () => {
      expect(() =>
        assertPlausibleVnd(240_000, 'fuel', FUEL_VND_PER_LITER_BOUNDS),
      ).toThrow();
    });
  });

  describe('ELECTRICITY_VND_PER_KWH_BOUNDS', () => {
    it('accepts a realistic 2026 electricity price', () => {
      expect(() =>
        assertPlausibleVnd(3_500, 'electricity', ELECTRICITY_VND_PER_KWH_BOUNDS),
      ).not.toThrow();
    });

    it('rejects a value an order of magnitude too high', () => {
      expect(() =>
        assertPlausibleVnd(35_000, 'electricity', ELECTRICITY_VND_PER_KWH_BOUNDS),
      ).toThrow();
    });
  });
});
