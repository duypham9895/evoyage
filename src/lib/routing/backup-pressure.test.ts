import { describe, it, expect } from 'vitest';
import { computeBackupPressure } from './backup-pressure';

// May 15 2026 is a Friday with no holiday — safe baseline for "no signals fire"
const BASELINE_NO_PRESSURE = {
  distanceToNextStopKm: 100,
  arrivalBatteryPercent: 50,
  downstreamStationCount: 5,
  arrivalLocalHour: 9,
  tripDate: new Date('2026-05-15T00:00:00Z'),
  usableRangeKm: 200,
} as const;

describe('computeBackupPressure', () => {
  it('returns score 0 and nMax 1 when no risk signals fire', () => {
    const result = computeBackupPressure(BASELINE_NO_PRESSURE);

    expect(result.score).toBe(0);
    expect(result.nMax).toBe(1);
    expect(result.signals).toEqual({
      tightMargin: false,
      lowBuffer: false,
      sparseArea: false,
      peakWindow: false,
      holiday: false,
    });
  });

  it('flags tightMargin when distanceToNext exceeds 70% of usable range', () => {
    const result = computeBackupPressure({
      ...BASELINE_NO_PRESSURE,
      distanceToNextStopKm: 71,
      usableRangeKm: 100,
    });

    expect(result.signals.tightMargin).toBe(true);
    expect(result.score).toBe(1);
  });

  it('does NOT flag tightMargin when distance equals 70% threshold (strictly greater)', () => {
    const result = computeBackupPressure({
      ...BASELINE_NO_PRESSURE,
      distanceToNextStopKm: 70,
      usableRangeKm: 100,
    });

    expect(result.signals.tightMargin).toBe(false);
  });

  it('does NOT flag tightMargin on the last stop (distanceToNext null)', () => {
    const result = computeBackupPressure({
      ...BASELINE_NO_PRESSURE,
      distanceToNextStopKm: null,
      usableRangeKm: 1, // would otherwise trigger
    });

    expect(result.signals.tightMargin).toBe(false);
  });

  it('flags lowBuffer when arrival battery is strictly below 25%', () => {
    const result = computeBackupPressure({
      ...BASELINE_NO_PRESSURE,
      arrivalBatteryPercent: 24,
    });

    expect(result.signals.lowBuffer).toBe(true);
    expect(result.score).toBe(1);
  });

  it('does NOT flag lowBuffer at exactly 25%', () => {
    const result = computeBackupPressure({
      ...BASELINE_NO_PRESSURE,
      arrivalBatteryPercent: 25,
    });

    expect(result.signals.lowBuffer).toBe(false);
  });

  it('flags sparseArea when fewer than 3 stations downstream', () => {
    const result = computeBackupPressure({
      ...BASELINE_NO_PRESSURE,
      downstreamStationCount: 2,
    });

    expect(result.signals.sparseArea).toBe(true);
    expect(result.score).toBe(1);
  });

  it('does NOT flag sparseArea at exactly 3 stations downstream', () => {
    const result = computeBackupPressure({
      ...BASELINE_NO_PRESSURE,
      downstreamStationCount: 3,
    });

    expect(result.signals.sparseArea).toBe(false);
  });

  it('flags peakWindow at 11:00 (lunch peak start, inclusive)', () => {
    const result = computeBackupPressure({
      ...BASELINE_NO_PRESSURE,
      arrivalLocalHour: 11,
    });

    expect(result.signals.peakWindow).toBe(true);
  });

  it('flags peakWindow at 17:00 (evening peak start, inclusive)', () => {
    const result = computeBackupPressure({
      ...BASELINE_NO_PRESSURE,
      arrivalLocalHour: 17,
    });

    expect(result.signals.peakWindow).toBe(true);
  });

  it('does NOT flag peakWindow at 13:00 (lunch peak end, exclusive)', () => {
    const result = computeBackupPressure({
      ...BASELINE_NO_PRESSURE,
      arrivalLocalHour: 13,
    });

    expect(result.signals.peakWindow).toBe(false);
  });

  it('does NOT flag peakWindow at 20:00 (evening peak end, exclusive)', () => {
    const result = computeBackupPressure({
      ...BASELINE_NO_PRESSURE,
      arrivalLocalHour: 20,
    });

    expect(result.signals.peakWindow).toBe(false);
  });

  it('flags holiday when tripDate is a Vietnamese holiday (Tết Mùng 1 2026)', () => {
    const result = computeBackupPressure({
      ...BASELINE_NO_PRESSURE,
      tripDate: new Date('2026-02-17T00:00:00Z'), // Tết Mùng 1 in Asia/Ho_Chi_Minh
    });

    expect(result.signals.holiday).toBe(true);
    expect(result.score).toBe(1);
  });

  it('does NOT flag holiday on a regular weekday', () => {
    // Baseline already uses 2026-05-15 (Friday, non-holiday) — explicit re-check
    const result = computeBackupPressure(BASELINE_NO_PRESSURE);

    expect(result.signals.holiday).toBe(false);
  });

  // ── Bucket boundaries: score → nMax ──

  it('nMax = 1 when score = 1 (single signal fires)', () => {
    const result = computeBackupPressure({
      ...BASELINE_NO_PRESSURE,
      arrivalBatteryPercent: 24, // lowBuffer only
    });

    expect(result.score).toBe(1);
    expect(result.nMax).toBe(1);
  });

  it('nMax = 2 when score = 2', () => {
    const result = computeBackupPressure({
      ...BASELINE_NO_PRESSURE,
      arrivalBatteryPercent: 24,
      downstreamStationCount: 2,
    });

    expect(result.score).toBe(2);
    expect(result.nMax).toBe(2);
  });

  it('nMax = 2 when score = 3', () => {
    const result = computeBackupPressure({
      ...BASELINE_NO_PRESSURE,
      arrivalBatteryPercent: 24,
      downstreamStationCount: 2,
      arrivalLocalHour: 12,
    });

    expect(result.score).toBe(3);
    expect(result.nMax).toBe(2);
  });

  it('nMax = 3 when score = 4', () => {
    const result = computeBackupPressure({
      ...BASELINE_NO_PRESSURE,
      arrivalBatteryPercent: 24,
      downstreamStationCount: 2,
      arrivalLocalHour: 12,
      tripDate: new Date('2026-02-17T00:00:00Z'), // Tết
    });

    expect(result.score).toBe(4);
    expect(result.nMax).toBe(3);
  });

  it('nMax = 3 when all 5 signals fire (score = 5)', () => {
    const result = computeBackupPressure({
      distanceToNextStopKm: 71,
      usableRangeKm: 100,
      arrivalBatteryPercent: 24,
      downstreamStationCount: 2,
      arrivalLocalHour: 12,
      tripDate: new Date('2026-02-17T00:00:00Z'),
    });

    expect(result.score).toBe(5);
    expect(result.nMax).toBe(3);
    expect(result.signals).toEqual({
      tightMargin: true,
      lowBuffer: true,
      sparseArea: true,
      peakWindow: true,
      holiday: true,
    });
  });
});
