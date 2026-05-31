import { describe, expect, it } from 'vitest';
import { CHARGE_TARGET_PERCENT } from '@/types';
import {
  chargeTargetForDecisionPoint,
  topUpTargetForVehicle,
} from './top-up-target';

describe('topUpTargetForVehicle', () => {
  it('returns 60% for vehicles at or above 80 kWh', () => {
    expect(topUpTargetForVehicle(80)).toBe(60);
    expect(topUpTargetForVehicle(87.7)).toBe(60);
  });

  it('returns 65% for vehicles from 60 kWh up to below 80 kWh', () => {
    expect(topUpTargetForVehicle(60)).toBe(65);
    expect(topUpTargetForVehicle(79.9)).toBe(65);
  });

  it('returns 70% for vehicles from 40 kWh up to below 60 kWh', () => {
    expect(topUpTargetForVehicle(40)).toBe(70);
    expect(topUpTargetForVehicle(59.9)).toBe(70);
  });

  it('returns 75% for vehicles below 40 kWh', () => {
    expect(topUpTargetForVehicle(39.9)).toBe(75);
    expect(topUpTargetForVehicle(30)).toBe(75);
  });

  it.each([
    [100, 60],
    [79, 65],
    [50, 70],
    [20, 75],
  ])('maps %s kWh to a %s% top-up target', (batteryCapacityKwh, expectedTarget) => {
    expect(topUpTargetForVehicle(batteryCapacityKwh)).toBe(expectedTarget);
  });
});

describe('chargeTargetForDecisionPoint', () => {
  it('keeps the normal 80% target for required stops', () => {
    expect(
      chargeTargetForDecisionPoint(
        { polylineIndex: 1, distanceKm: 100, point: { lat: 10, lng: 106 }, candidates: [], useCorridorScoring: true },
        { batteryCapacityKwh: 87.7 },
      ),
    ).toBe(CHARGE_TARGET_PERCENT);
  });

  it('uses the vehicle-aware top-up target for precautionary stops', () => {
    expect(
      chargeTargetForDecisionPoint(
        {
          polylineIndex: 1,
          distanceKm: 100,
          point: { lat: 10, lng: 106 },
          candidates: [],
          useCorridorScoring: true,
          isPrecautionary: true,
        },
        { batteryCapacityKwh: 55 },
      ),
    ).toBe(70);
  });

  it('uses the small-battery top-up target for precautionary stops below 40 kWh', () => {
    expect(
      chargeTargetForDecisionPoint(
        {
          polylineIndex: 1,
          distanceKm: 100,
          point: { lat: 10, lng: 106 },
          candidates: [],
          useCorridorScoring: true,
          isPrecautionary: true,
        },
        { batteryCapacityKwh: 35 },
      ),
    ).toBe(75);
  });
});
