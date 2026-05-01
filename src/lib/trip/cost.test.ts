import { describe, it, expect } from 'vitest';
import {
  DEFAULT_VND_PER_KWH,
  DEFAULT_GASOLINE_L_PER_100KM,
  DEFAULT_VND_PER_LITER,
  calculateElectricityCostVnd,
  calculateGasolineEquivalentVnd,
  calculateSavings,
  formatVnd,
} from './cost';

describe('calculateElectricityCostVnd', () => {
  it('uses default VND/kWh when not provided', () => {
    // 100 km × 150 Wh/km = 15 kWh × 3500 VND = 52,500 VND
    const cost = calculateElectricityCostVnd(100, 150);
    expect(cost).toBe(15 * DEFAULT_VND_PER_KWH);
    expect(cost).toBe(52500);
  });

  it('honors a custom rate', () => {
    // 200 km × 180 Wh/km = 36 kWh × 4000 = 144,000
    expect(calculateElectricityCostVnd(200, 180, 4000)).toBe(144000);
  });

  it('rounds to the nearest VND', () => {
    // 10 km × 153 Wh/km = 1.53 kWh × 3500 = 5355 (already integer)
    expect(calculateElectricityCostVnd(10, 153)).toBe(5355);
    // 1 km × 1 Wh/km = 0.001 kWh × 3500 = 3.5 → rounds to 4
    expect(calculateElectricityCostVnd(1, 1)).toBe(4);
  });

  it('returns 0 for zero distance', () => {
    expect(calculateElectricityCostVnd(0, 150)).toBe(0);
  });

  it('returns 0 for missing/invalid efficiency', () => {
    expect(calculateElectricityCostVnd(100, 0)).toBe(0);
    expect(calculateElectricityCostVnd(100, -50)).toBe(0);
    expect(calculateElectricityCostVnd(100, Number.NaN)).toBe(0);
  });

  it('returns 0 for invalid distance', () => {
    expect(calculateElectricityCostVnd(-50, 150)).toBe(0);
    expect(calculateElectricityCostVnd(Number.NaN, 150)).toBe(0);
    expect(calculateElectricityCostVnd(Number.POSITIVE_INFINITY, 150)).toBe(0);
  });

  it('returns 0 for invalid rate', () => {
    expect(calculateElectricityCostVnd(100, 150, 0)).toBe(0);
    expect(calculateElectricityCostVnd(100, 150, -100)).toBe(0);
  });

  it('handles large numbers without overflow concerns', () => {
    // 5000 km × 200 Wh/km = 1000 kWh × 3500 = 3,500,000 VND
    expect(calculateElectricityCostVnd(5000, 200)).toBe(3500000);
  });
});

describe('calculateGasolineEquivalentVnd', () => {
  it('uses default consumption and price', () => {
    // 100 km × 7 L/100 = 7 L × 23000 = 161,000
    expect(calculateGasolineEquivalentVnd(100)).toBe(
      DEFAULT_GASOLINE_L_PER_100KM * DEFAULT_VND_PER_LITER,
    );
    expect(calculateGasolineEquivalentVnd(100)).toBe(161000);
  });

  it('honors custom consumption and price', () => {
    // 200 km × 8 L/100 = 16 L × 25000 = 400,000
    expect(calculateGasolineEquivalentVnd(200, 8, 25000)).toBe(400000);
  });

  it('returns 0 for zero or negative distance', () => {
    expect(calculateGasolineEquivalentVnd(0)).toBe(0);
    expect(calculateGasolineEquivalentVnd(-10)).toBe(0);
  });

  it('returns 0 for invalid inputs', () => {
    expect(calculateGasolineEquivalentVnd(Number.NaN)).toBe(0);
    expect(calculateGasolineEquivalentVnd(100, 0)).toBe(0);
    expect(calculateGasolineEquivalentVnd(100, 7, 0)).toBe(0);
  });

  it('rounds fractional VND', () => {
    // 1 km × 7 L/100 × 23000 = 1610 (integer)
    expect(calculateGasolineEquivalentVnd(1)).toBe(1610);
    // 0.5 km × 7 / 100 × 23000 = 805 (integer)
    expect(calculateGasolineEquivalentVnd(0.5)).toBe(805);
  });
});

describe('calculateSavings', () => {
  it('returns positive savings when EV is cheaper', () => {
    const result = calculateSavings(50000, 161000);
    expect(result.savedVnd).toBe(111000);
    expect(result.savedPercent).toBe(69); // 111000/161000 = 0.6894 → 69
  });

  it('returns zero savings when costs are equal', () => {
    expect(calculateSavings(100000, 100000)).toEqual({
      savedVnd: 0,
      savedPercent: 0,
    });
  });

  it('returns negative savings when EV is more expensive', () => {
    const result = calculateSavings(200000, 100000);
    expect(result.savedVnd).toBe(-100000);
    expect(result.savedPercent).toBe(-100);
  });

  it('returns zero when gasoline cost is zero (avoids divide-by-zero)', () => {
    expect(calculateSavings(50000, 0)).toEqual({ savedVnd: 0, savedPercent: 0 });
  });

  it('treats negative gasoline cost as zero', () => {
    expect(calculateSavings(50000, -100)).toEqual({ savedVnd: 0, savedPercent: 0 });
  });

  it('coerces NaN inputs to 0', () => {
    expect(calculateSavings(Number.NaN, 100000)).toEqual({
      savedVnd: 100000,
      savedPercent: 100,
    });
    expect(calculateSavings(50000, Number.NaN)).toEqual({
      savedVnd: 0,
      savedPercent: 0,
    });
  });
});

describe('formatVnd', () => {
  it('formats zero', () => {
    expect(formatVnd(0)).toBe('0 ₫');
  });

  it('formats values under 1000 without separators', () => {
    expect(formatVnd(5)).toBe('5 ₫');
    expect(formatVnd(999)).toBe('999 ₫');
  });

  it('inserts dot separators every three digits', () => {
    expect(formatVnd(1000)).toBe('1.000 ₫');
    expect(formatVnd(1234)).toBe('1.234 ₫');
    expect(formatVnd(52500)).toBe('52.500 ₫');
    expect(formatVnd(1234567)).toBe('1.234.567 ₫');
  });

  it('rounds non-integer values', () => {
    expect(formatVnd(1234.4)).toBe('1.234 ₫');
    expect(formatVnd(1234.5)).toBe('1.235 ₫');
  });

  it('preserves negative sign', () => {
    expect(formatVnd(-500)).toBe('-500 ₫');
    expect(formatVnd(-1234567)).toBe('-1.234.567 ₫');
  });

  it('falls back to "0 ₫" for non-finite values', () => {
    expect(formatVnd(Number.NaN)).toBe('0 ₫');
    expect(formatVnd(Number.POSITIVE_INFINITY)).toBe('0 ₫');
  });

  it('formats very large values', () => {
    expect(formatVnd(1234567890)).toBe('1.234.567.890 ₫');
  });
});

describe('integration: electricity vs gasoline default scenario', () => {
  it('100 km in a typical EV saves the expected amount vs sedan', () => {
    const distanceKm = 100;
    const efficiencyWhPerKm = 150; // typical compact EV
    const elec = calculateElectricityCostVnd(distanceKm, efficiencyWhPerKm);
    const gas = calculateGasolineEquivalentVnd(distanceKm);
    const savings = calculateSavings(elec, gas);

    expect(elec).toBe(52500);
    expect(gas).toBe(161000);
    expect(savings.savedVnd).toBe(108500);
    expect(savings.savedPercent).toBe(67);

    expect(formatVnd(elec)).toBe('52.500 ₫');
    expect(formatVnd(gas)).toBe('161.000 ₫');
    expect(formatVnd(savings.savedVnd)).toBe('108.500 ₫');
  });
});
