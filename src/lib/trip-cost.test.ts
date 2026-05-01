import { describe, it, expect } from 'vitest';
import { computeTripCost, type TripCostVehicle } from './trip-cost';
import type { EnergyPricesSnapshot } from './energy-prices';

// Compact, deterministic snapshot used across most tests so the math is easy
// to verify by hand.
const SNAPSHOT: EnergyPricesSnapshot = {
  lastSyncedAt: '2026-05-01T00:00:00.000Z',
  petrolimex: {
    source: 'x',
    effectiveAt: '2026-04-29T00:00:00.000Z',
    products: {
      ron95iii: { label: 'Xăng RON 95-III', vndPerLiter: 25_000 },
      do005s: { label: 'DO 0,05S-II', vndPerLiter: 30_000 },
    },
  },
  vgreen: {
    source: 'x',
    effectiveAt: '2024-03-19',
    vndPerKwh: 4_000,
    freeForVinFastUntil: '2029-12-31',
  },
  evnResidential: {
    source: 'x',
    effectiveAt: '2025-05-09',
    tiers: [
      { minKwh: 0, maxKwh: 50, vndPerKwh: 1984 },
      { minKwh: 51, maxKwh: 100, vndPerKwh: 2050 },
      { minKwh: 101, maxKwh: 200, vndPerKwh: 2380 },
      { minKwh: 201, maxKwh: 300, vndPerKwh: 3_000 }, // representative tier
      { minKwh: 301, maxKwh: 400, vndPerKwh: 3350 },
      { minKwh: 401, maxKwh: null, vndPerKwh: 3460 },
    ],
    representativeTier: 4,
    representativeVndPerKwh: 3_000,
  },
};

const VF8: TripCostVehicle = {
  brand: 'VinFast',
  model: 'VF 8',
  // 80 kWh usable / 400 km range = 0.20 kWh/km → ×1.2 NEDC honesty multiplier
  // = 0.24 kWh/km = 24 kWh/100km
  usableBatteryKwh: 80,
  officialRangeKm: 400,
  efficiencyWhPerKm: null,
};

const TODAY_BEFORE_FREE_END = new Date('2026-05-01');
const TODAY_AFTER_FREE_END = new Date('2030-01-15');

describe('computeTripCost — gasoline + diesel', () => {
  it('uses 8 L/100km × gasoline price for the gasoline line', () => {
    const cost = computeTripCost({
      distanceKm: 100,
      vehicle: VF8,
      snapshot: SNAPSHOT,
      today: TODAY_BEFORE_FREE_END,
    });
    // 100 km × 8 / 100 = 8 L → 8 × 25,000 = 200,000
    expect(cost.gasoline).toEqual({ liters: 8, vnd: 200_000 });
  });

  it('uses 7 L/100km × diesel price for the diesel line', () => {
    const cost = computeTripCost({
      distanceKm: 100,
      vehicle: VF8,
      snapshot: SNAPSHOT,
      today: TODAY_BEFORE_FREE_END,
    });
    // 100 km × 7 / 100 = 7 L → 7 × 30,000 = 210,000
    expect(cost.diesel).toEqual({ liters: 7, vnd: 210_000 });
  });

  it('scales linearly with distance', () => {
    const cost = computeTripCost({
      distanceKm: 250,
      vehicle: VF8,
      snapshot: SNAPSHOT,
      today: TODAY_BEFORE_FREE_END,
    });
    expect(cost.gasoline.vnd).toBe(20 * 25_000); // 20 L
    expect(cost.diesel.vnd).toBe(17.5 * 30_000); // 17.5 L
  });
});

describe('computeTripCost — electric kWh derivation', () => {
  it('derives kWh/100km from battery and range with the 1.2× NEDC multiplier', () => {
    const cost = computeTripCost({
      distanceKm: 100,
      vehicle: VF8,
      snapshot: SNAPSHOT,
      today: TODAY_BEFORE_FREE_END,
    });
    // 80/400 × 100 × 1.2 = 24 kWh/100km. 100 km → 24 kWh
    expect(cost.electric.kwh).toBe(24);
  });

  it('prefers efficiencyWhPerKm when the vehicle exposes it (no NEDC multiplier)', () => {
    const cost = computeTripCost({
      distanceKm: 100,
      vehicle: { ...VF8, efficiencyWhPerKm: 180 },
      snapshot: SNAPSHOT,
      today: TODAY_BEFORE_FREE_END,
    });
    // 180 Wh/km = 18 kWh/100km. 100 km → 18 kWh
    expect(cost.electric.kwh).toBe(18);
  });

  it('falls back to default 22 kWh/100km when battery and range are missing', () => {
    const cost = computeTripCost({
      distanceKm: 100,
      vehicle: {
        brand: 'VinFast',
        model: 'VF 8',
        usableBatteryKwh: null,
        officialRangeKm: 0,
        efficiencyWhPerKm: null,
      },
      snapshot: SNAPSHOT,
      today: TODAY_BEFORE_FREE_END,
    });
    expect(cost.electric.kwh).toBe(22);
  });
});

describe('computeTripCost — V-GREEN free-for-VinFast policy', () => {
  it('marks isFreeAtVGreen=true for VinFast vehicles before the free-policy end date', () => {
    const cost = computeTripCost({
      distanceKm: 100,
      vehicle: VF8,
      snapshot: SNAPSHOT,
      today: TODAY_BEFORE_FREE_END,
    });
    expect(cost.electric.isFreeAtVGreen).toBe(true);
  });

  it('still computes vGreenVnd so the UI can show the post-2029 price', () => {
    const cost = computeTripCost({
      distanceKm: 100,
      vehicle: VF8,
      snapshot: SNAPSHOT,
      today: TODAY_BEFORE_FREE_END,
    });
    // 24 kWh × 4,000 = 96,000
    expect(cost.electric.vGreenVnd).toBe(96_000);
  });

  it('marks isFreeAtVGreen=false after the free-policy end date', () => {
    const cost = computeTripCost({
      distanceKm: 100,
      vehicle: VF8,
      snapshot: SNAPSHOT,
      today: TODAY_AFTER_FREE_END,
    });
    expect(cost.electric.isFreeAtVGreen).toBe(false);
  });

  it('marks isFreeAtVGreen=false for non-VinFast vehicles', () => {
    const tesla: TripCostVehicle = {
      brand: 'Tesla',
      model: 'Model 3',
      usableBatteryKwh: 60,
      officialRangeKm: 500,
      efficiencyWhPerKm: null,
    };
    const cost = computeTripCost({
      distanceKm: 100,
      vehicle: tesla,
      snapshot: SNAPSHOT,
      today: TODAY_BEFORE_FREE_END,
    });
    expect(cost.electric.isFreeAtVGreen).toBe(false);
  });
});

describe('computeTripCost — home-charging cost', () => {
  it('uses EVN representative tier 4 for the homeChargingVnd line', () => {
    const cost = computeTripCost({
      distanceKm: 100,
      vehicle: VF8,
      snapshot: SNAPSHOT,
      today: TODAY_BEFORE_FREE_END,
    });
    // 24 kWh × 3,000 = 72,000
    expect(cost.electric.homeChargingVnd).toBe(72_000);
  });
});

describe('computeTripCost — edge cases', () => {
  it('returns zeros across the board for distance 0', () => {
    const cost = computeTripCost({
      distanceKm: 0,
      vehicle: VF8,
      snapshot: SNAPSHOT,
      today: TODAY_BEFORE_FREE_END,
    });
    expect(cost.gasoline).toEqual({ liters: 0, vnd: 0 });
    expect(cost.diesel).toEqual({ liters: 0, vnd: 0 });
    expect(cost.electric.kwh).toBe(0);
    expect(cost.electric.homeChargingVnd).toBe(0);
    expect(cost.electric.vGreenVnd).toBe(0);
  });

  it('treats negative distance as zero (defensive)', () => {
    const cost = computeTripCost({
      distanceKm: -50,
      vehicle: VF8,
      snapshot: SNAPSHOT,
      today: TODAY_BEFORE_FREE_END,
    });
    expect(cost.gasoline.vnd).toBe(0);
    expect(cost.diesel.vnd).toBe(0);
    expect(cost.electric.kwh).toBe(0);
  });

  it('uses a default VinFast vehicle when none is provided', () => {
    const cost = computeTripCost({
      distanceKm: 100,
      snapshot: SNAPSHOT,
      today: TODAY_BEFORE_FREE_END,
    });
    expect(cost.electric.isFreeAtVGreen).toBe(true);
    expect(cost.electric.kwh).toBeGreaterThan(0);
  });
});
