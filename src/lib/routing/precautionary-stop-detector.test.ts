import { describe, expect, it } from 'vitest';
import type { BackupPressureResult, BackupPressureSignals } from './backup-pressure';
import {
  findInjectionSites,
  injectionThresholdForSafetyFactor,
} from './precautionary-stop-detector';

const NO_SIGNALS: BackupPressureSignals = {
  tightMargin: false,
  lowBuffer: false,
  sparseArea: false,
  peakWindow: false,
  holiday: false,
};

function pressure(
  score: number,
  signals: Partial<BackupPressureSignals> = {},
): BackupPressureResult {
  return {
    score,
    nMax: score <= 1 ? 1 : score <= 3 ? 2 : 3,
    signals: { ...NO_SIGNALS, ...signals },
  };
}

describe('injectionThresholdForSafetyFactor', () => {
  it('requires score 5 for very safe settings at or below 0.70', () => {
    expect(injectionThresholdForSafetyFactor(0.50)).toBe(5);
    expect(injectionThresholdForSafetyFactor(0.70)).toBe(5);
  });

  it('requires score 4 for recommended settings from 0.71 through 0.80', () => {
    expect(injectionThresholdForSafetyFactor(0.71)).toBe(4);
    expect(injectionThresholdForSafetyFactor(0.80)).toBe(4);
  });

  it('requires score 3 for risky settings above 0.80', () => {
    expect(injectionThresholdForSafetyFactor(0.81)).toBe(3);
    expect(injectionThresholdForSafetyFactor(1.00)).toBe(3);
  });
});

describe('findInjectionSites', () => {
  it.each([
    [0.70, 4, false],
    [0.70, 5, true],
    [0.71, 3, false],
    [0.71, 4, true],
    [0.80, 4, true],
    [0.81, 2, false],
    [0.81, 3, true],
    [1.00, 3, true],
  ])(
    'at safety factor %s, score %s injection=%s',
    (rangeSafetyFactor, score, shouldInject) => {
      const result = findInjectionSites({
        rangeSafetyFactor,
        legs: [
          { legIndex: 0, pressure: pressure(score, { holiday: true }) },
        ],
      });

      expect(result.length > 0).toBe(shouldInject);
    },
  );

  it('returns no sites when pressure is below the safety-factor threshold', () => {
    const result = findInjectionSites({
      rangeSafetyFactor: 0.80,
      legs: [
        { legIndex: 0, pressure: pressure(3, { sparseArea: true }) },
      ],
    });

    expect(result).toEqual([]);
  });

  it('returns a site when pressure equals the threshold', () => {
    const result = findInjectionSites({
      rangeSafetyFactor: 0.80,
      legs: [
        { legIndex: 0, pressure: pressure(4, { holiday: true, sparseArea: true }) },
      ],
    });

    expect(result).toEqual([
      {
        legIndex: 0,
        pressureScore: 4,
        reason: 'holiday',
        reasonSecondary: ['sparse'],
        signals: { ...NO_SIGNALS, holiday: true, sparseArea: true },
        legDistanceKm: 0,
        legSparsityCount: 0,
        safetyFactor: 0.80,
        vehicleBatteryKwh: 0,
      },
    ]);
  });

  it('keeps at most two sites in route order', () => {
    const result = findInjectionSites({
      rangeSafetyFactor: 0.90,
      legs: [
        { legIndex: 0, pressure: pressure(3, { peakWindow: true }) },
        { legIndex: 1, pressure: pressure(5, { holiday: true }) },
        { legIndex: 2, pressure: pressure(4, { sparseArea: true }) },
      ],
    });

    expect(result.map((site) => site.legIndex)).toEqual([0, 1]);
  });

  it('subtracts existing precautionary stops from the trip cap', () => {
    const result = findInjectionSites({
      rangeSafetyFactor: 0.90,
      existingPrecautionaryCount: 1,
      legs: [
        { legIndex: 0, pressure: pressure(3, { peakWindow: true }) },
        { legIndex: 1, pressure: pressure(3, { sparseArea: true }) },
      ],
    });

    expect(result.map((site) => site.legIndex)).toEqual([0]);
  });

  it('returns no sites when the trip cap is already reached', () => {
    const result = findInjectionSites({
      rangeSafetyFactor: 0.90,
      existingPrecautionaryCount: 2,
      legs: [
        { legIndex: 0, pressure: pressure(5, { holiday: true }) },
      ],
    });

    expect(result).toEqual([]);
  });

  it('uses sparse as the primary reason when holiday is not present', () => {
    const result = findInjectionSites({
      rangeSafetyFactor: 0.90,
      legs: [
        {
          legIndex: 0,
          pressure: pressure(3, {
            sparseArea: true,
            peakWindow: true,
            tightMargin: true,
          }),
        },
      ],
    });

    expect(result[0]?.reason).toBe('sparse');
  });

  it('uses peak as the primary reason when holiday and sparse are not present', () => {
    const result = findInjectionSites({
      rangeSafetyFactor: 0.90,
      legs: [
        { legIndex: 0, pressure: pressure(3, { peakWindow: true, tightMargin: true }) },
      ],
    });

    expect(result[0]?.reason).toBe('peak');
  });

  it('uses tightMargin as the primary reason when only margin and buffer signals are present', () => {
    const result = findInjectionSites({
      rangeSafetyFactor: 0.90,
      legs: [
        { legIndex: 0, pressure: pressure(3, { tightMargin: true, lowBuffer: true }) },
      ],
    });

    expect(result[0]?.reason).toBe('tightMargin');
  });

  it('falls back to lowBuffer as the primary reason', () => {
    const result = findInjectionSites({
      rangeSafetyFactor: 0.90,
      legs: [
        { legIndex: 0, pressure: pressure(3, { lowBuffer: true }) },
      ],
    });

    expect(result[0]?.reason).toBe('lowBuffer');
  });
});
