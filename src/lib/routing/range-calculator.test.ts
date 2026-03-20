import { describe, it, expect } from 'vitest';
import {
  calculateUsableRange,
  getRangeSafetyWarning,
} from './range-calculator';

// Test vehicle fixtures (immutable)
const VF8_ECO = {
  brand: 'VinFast',
  model: 'VF 8',
  variant: 'Eco' as const,
  officialRangeKm: 471,
  batteryCapacityKwh: 87.7,
} as const;

const VF5_PLUS = {
  brand: 'VinFast',
  model: 'VF 5',
  variant: 'Plus' as const,
  officialRangeKm: 326,
  batteryCapacityKwh: 37.23,
} as const;

const VF3 = {
  brand: 'VinFast',
  model: 'VF 3',
  variant: null,
  officialRangeKm: 210,
  batteryCapacityKwh: 18.64,
} as const;

const BYD_SEAL = {
  brand: 'BYD',
  model: 'Seal',
  variant: 'Advance' as const,
  officialRangeKm: 570,
  batteryCapacityKwh: 82.5,
} as const;

const BYD_DOLPHIN = {
  brand: 'BYD',
  model: 'Dolphin',
  variant: 'GLX' as const,
  officialRangeKm: 340,
  batteryCapacityKwh: 44.9,
} as const;

describe('calculateUsableRange', () => {
  it('VF 8 Eco at 80% battery, 80% RSF → 245km usable', () => {
    const result = calculateUsableRange(VF8_ECO, 80, 15, 0.80);
    expect(result.maxRangeKm).toBeCloseTo(376.8, 1);
    // spendable = 80% - 15% = 65%, usable = 376.8 * 0.65 = 244.92
    expect(result.usableRangeKm).toBeCloseTo(244.92, 0);
  });

  it('VF 8 Eco at 70% battery, 80% RSF → 207km usable', () => {
    const result = calculateUsableRange(VF8_ECO, 70, 15, 0.80);
    expect(result.maxRangeKm).toBeCloseTo(376.8, 1);
    // spendable = 70% - 15% = 55%, usable = 376.8 * 0.55 = 207.24
    expect(result.usableRangeKm).toBeCloseTo(207.24, 0);
  });

  it('VF 8 Eco at 100% battery → 320km usable', () => {
    const result = calculateUsableRange(VF8_ECO, 100, 15, 0.80);
    // spendable = 100% - 15% = 85%, usable = 376.8 * 0.85 = 320.28
    expect(result.usableRangeKm).toBeCloseTo(320.28, 0);
  });

  it('VF 8 Eco at 60% battery → 169km usable', () => {
    const result = calculateUsableRange(VF8_ECO, 60, 15, 0.80);
    // spendable = 60% - 15% = 45%, usable = 376.8 * 0.45 = 169.56
    expect(result.usableRangeKm).toBeCloseTo(169.56, 0);
  });

  it('low battery edge case: 20% battery, 15% arrival → only ~18.8km', () => {
    const result = calculateUsableRange(VF8_ECO, 20, 15, 0.80);
    // spendable = 5%, usable = 376.8 * 0.05 = 18.84
    expect(result.usableRangeKm).toBeCloseTo(18.84, 1);
  });

  it('battery equals min arrival → 0km usable', () => {
    const result = calculateUsableRange(VF8_ECO, 15, 15, 0.80);
    expect(result.usableRangeKm).toBe(0);
  });

  it('battery below min arrival → negative clamped to 0', () => {
    const result = calculateUsableRange(VF8_ECO, 10, 15, 0.80);
    expect(result.usableRangeKm).toBe(0);
  });

  it('RSF at 100% (very risky) → full manufacturer range', () => {
    const result = calculateUsableRange(VF8_ECO, 100, 15, 1.00);
    expect(result.maxRangeKm).toBeCloseTo(471, 0);
    // spendable = 85%, usable = 471 * 0.85 = 400.35
    expect(result.usableRangeKm).toBeCloseTo(400.35, 0);
  });

  it('RSF at 50% (very conservative) → half range', () => {
    const result = calculateUsableRange(VF8_ECO, 100, 15, 0.50);
    expect(result.maxRangeKm).toBeCloseTo(235.5, 0);
    // spendable = 85%, usable = 235.5 * 0.85 = 200.175
    expect(result.usableRangeKm).toBeCloseTo(200.175, 0);
  });

  it('VF 5 Plus at 70% battery → 143km usable', () => {
    const result = calculateUsableRange(VF5_PLUS, 70, 15, 0.80);
    // max = 326 * 0.8 = 260.8, spendable = 55%, usable = 260.8 * 0.55 = 143.44
    expect(result.usableRangeKm).toBeCloseTo(143.44, 0);
  });

  it('VF 3 at 80% battery → 109km usable', () => {
    const result = calculateUsableRange(VF3, 80, 15, 0.80);
    // max = 210 * 0.8 = 168, spendable = 65%, usable = 168 * 0.65 = 109.2
    expect(result.usableRangeKm).toBeCloseTo(109.2, 0);
  });

  it('BYD Seal at 80% battery → 296km usable', () => {
    const result = calculateUsableRange(BYD_SEAL, 80, 15, 0.80);
    // max = 570 * 0.8 = 456, spendable = 65%, usable = 456 * 0.65 = 296.4
    expect(result.usableRangeKm).toBeCloseTo(296.4, 0);
  });

  it('BYD Dolphin at 60% battery → 122km usable', () => {
    const result = calculateUsableRange(BYD_DOLPHIN, 60, 15, 0.80);
    // max = 340 * 0.8 = 272, spendable = 45%, usable = 272 * 0.45 = 122.4
    expect(result.usableRangeKm).toBeCloseTo(122.4, 0);
  });

  it('zero official range → 0km usable', () => {
    const zeroRange = { ...VF8_ECO, officialRangeKm: 0 };
    const result = calculateUsableRange(zeroRange, 80, 15, 0.80);
    expect(result.usableRangeKm).toBe(0);
    expect(result.maxRangeKm).toBe(0);
  });

  it('returns a human-readable explanation string', () => {
    const result = calculateUsableRange(VF8_ECO, 70, 15, 0.80);
    expect(result.explanation).toContain('471');
    expect(result.explanation).toContain('80%');
    expect(result.explanation).toContain('70%');
    expect(result.explanation).toContain('15%');
  });

  // RSF at 90% — test for HCM→Nha Trang scenario
  it('VF 8 Eco at 80% battery, RSF 90% → 275km usable', () => {
    const result = calculateUsableRange(VF8_ECO, 80, 15, 0.90);
    // max = 471 * 0.9 = 423.9, spendable = 65%, usable = 423.9 * 0.65 = 275.535
    expect(result.usableRangeKm).toBeCloseTo(275.535, 0);
  });
});

describe('getRangeSafetyWarning', () => {
  it('≤70% → safe (very conservative)', () => {
    expect(getRangeSafetyWarning(0.50).level).toBe('safe');
    expect(getRangeSafetyWarning(0.60).level).toBe('safe');
    expect(getRangeSafetyWarning(0.70).level).toBe('safe');
  });

  it('71-80% → caution (recommended)', () => {
    expect(getRangeSafetyWarning(0.71).level).toBe('caution');
    expect(getRangeSafetyWarning(0.75).level).toBe('caution');
    expect(getRangeSafetyWarning(0.80).level).toBe('caution');
  });

  it('81-90% → warning (optimistic)', () => {
    expect(getRangeSafetyWarning(0.81).level).toBe('warning');
    expect(getRangeSafetyWarning(0.85).level).toBe('warning');
    expect(getRangeSafetyWarning(0.90).level).toBe('warning');
  });

  it('91-100% → danger (very risky)', () => {
    expect(getRangeSafetyWarning(0.91).level).toBe('danger');
    expect(getRangeSafetyWarning(0.95).level).toBe('danger');
    expect(getRangeSafetyWarning(1.00).level).toBe('danger');
  });

  it('exact boundary at 70% → safe', () => {
    expect(getRangeSafetyWarning(0.70).level).toBe('safe');
    expect(getRangeSafetyWarning(0.70).color).toBe('green');
  });

  it('exact boundary at 80% → caution', () => {
    expect(getRangeSafetyWarning(0.80).level).toBe('caution');
    expect(getRangeSafetyWarning(0.80).color).toBe('green');
  });

  it('exact boundary at 90% → warning', () => {
    expect(getRangeSafetyWarning(0.90).level).toBe('warning');
    expect(getRangeSafetyWarning(0.90).color).toBe('orange');
  });

  it('includes bilingual messages', () => {
    const warning = getRangeSafetyWarning(0.95);
    expect(warning.messageVi).toBeTruthy();
    expect(warning.messageEn).toBeTruthy();
    expect(warning.messageVi).toContain('RỦI RO');
    expect(warning.messageEn).toContain('RISKY');
  });

  it('safe level has green color', () => {
    expect(getRangeSafetyWarning(0.60).color).toBe('green');
  });

  it('warning level has orange color', () => {
    expect(getRangeSafetyWarning(0.85).color).toBe('orange');
  });

  it('danger level has red color', () => {
    expect(getRangeSafetyWarning(0.95).color).toBe('red');
  });
});
