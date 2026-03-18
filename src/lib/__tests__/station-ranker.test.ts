import { describe, it, expect } from 'vitest';
import type { ChargingStationData, ScoreStationInput } from '@/types';
import {
  getDefaultPowerKw,
  getEffectivePowerKw,
  calculateChargeTimeMin,
  scoreStation,
  rankStations,
} from '../station-ranker';

// ── Test Helpers ──

function makeStation(
  overrides: Partial<ChargingStationData> = {},
): ChargingStationData {
  return {
    id: 'station-1',
    name: 'Test Station',
    address: '123 Test St',
    province: 'Ho Chi Minh',
    latitude: 10.762,
    longitude: 106.66,
    chargerTypes: ['DC'],
    connectorTypes: ['CCS2'],
    portCount: 4,
    maxPowerKw: 100,
    stationType: 'public',
    isVinFastOnly: false,
    operatingHours: '24/7',
    provider: 'TestProvider',
    chargingStatus: null,
    parkingFee: null,
    ...overrides,
  };
}

// ── getDefaultPowerKw ──

describe('getDefaultPowerKw', () => {
  it('returns 100 for CCS2', () => {
    expect(getDefaultPowerKw(['CCS2'])).toBe(100);
  });

  it('returns 50 for CHAdeMO', () => {
    expect(getDefaultPowerKw(['CHAdeMO'])).toBe(50);
  });

  it('returns 22 for Type2_AC', () => {
    expect(getDefaultPowerKw(['Type2_AC'])).toBe(22);
  });

  it('returns 7 for Type1', () => {
    expect(getDefaultPowerKw(['Type1'])).toBe(7);
  });

  it('returns 50 for unknown connector type', () => {
    expect(getDefaultPowerKw(['UnknownType'])).toBe(50);
  });

  it('returns 50 for empty connector types', () => {
    expect(getDefaultPowerKw([])).toBe(50);
  });

  it('returns highest power for multiple connectors', () => {
    expect(getDefaultPowerKw(['Type1', 'CCS2', 'CHAdeMO'])).toBe(100);
  });

  it('returns highest power with mixed known/unknown', () => {
    expect(getDefaultPowerKw(['Type1', 'UnknownType'])).toBe(50);
  });
});

// ── getEffectivePowerKw ──

describe('getEffectivePowerKw', () => {
  it('returns station power when no vehicle max', () => {
    const station = makeStation({ maxPowerKw: 150 });
    expect(getEffectivePowerKw(station)).toBe(150);
  });

  it('returns vehicle max when lower than station', () => {
    const station = makeStation({ maxPowerKw: 150 });
    expect(getEffectivePowerKw(station, 100)).toBe(100);
  });

  it('returns station power when lower than vehicle max', () => {
    const station = makeStation({ maxPowerKw: 50 });
    expect(getEffectivePowerKw(station, 100)).toBe(50);
  });

  it('falls back to connector-based power when maxPowerKw is 0', () => {
    const station = makeStation({ maxPowerKw: 0, connectorTypes: ['CCS2'] });
    expect(getEffectivePowerKw(station)).toBe(100);
  });

  it('falls back to connector-based power when maxPowerKw is falsy', () => {
    const station = makeStation({
      maxPowerKw: 0,
      connectorTypes: ['CHAdeMO'],
    });
    expect(getEffectivePowerKw(station, 200)).toBe(50);
  });
});

// ── calculateChargeTimeMin ──

describe('calculateChargeTimeMin', () => {
  it('calculates time with efficiency factor', () => {
    // 50 kWh / 100 kW * 60 min * 1.15 = 34.5
    expect(calculateChargeTimeMin(50, 100)).toBeCloseTo(34.5);
  });

  it('returns 0 for zero power', () => {
    expect(calculateChargeTimeMin(50, 0)).toBe(0);
  });

  it('returns 0 for negative power', () => {
    expect(calculateChargeTimeMin(50, -10)).toBe(0);
  });

  it('returns 0 for zero energy needed', () => {
    expect(calculateChargeTimeMin(0, 100)).toBe(0);
  });

  it('scales linearly with energy', () => {
    const time1 = calculateChargeTimeMin(10, 50);
    const time2 = calculateChargeTimeMin(20, 50);
    expect(time2).toBeCloseTo(time1 * 2);
  });
});

// ── scoreStation ──

describe('scoreStation', () => {
  it('computes total stop time as detour + charge time', () => {
    const input: ScoreStationInput = {
      detourDriveTimeSec: 300, // 5 min
      stationPowerKw: 100,
      energyNeededKwh: 50,
      isVinFastStation: false,
      isVinFastVehicle: false,
      station: makeStation(),
    };

    const result = scoreStation(input);
    const expectedChargeTime = (50 / 100) * 60 * 1.15; // 34.5
    const expectedTotal = 5 + expectedChargeTime; // 39.5

    expect(result.estimatedChargeTimeMin).toBeCloseTo(expectedChargeTime);
    expect(result.totalStopTimeMin).toBeCloseTo(expectedTotal);
    expect(result.score).toBeCloseTo(expectedTotal);
  });

  it('applies VinFast bonus when both vehicle and station are VinFast', () => {
    const input: ScoreStationInput = {
      detourDriveTimeSec: 300,
      stationPowerKw: 100,
      energyNeededKwh: 50,
      isVinFastStation: true,
      isVinFastVehicle: true,
      station: makeStation({ isVinFastOnly: true }),
    };

    const result = scoreStation(input);
    const totalStopTime = result.totalStopTimeMin;
    // Score should be 50% of totalStopTime (capped at 50% bonus)
    expect(result.score).toBeCloseTo(totalStopTime * 0.5);
  });

  it('does not apply VinFast bonus when only station is VinFast', () => {
    const input: ScoreStationInput = {
      detourDriveTimeSec: 300,
      stationPowerKw: 100,
      energyNeededKwh: 50,
      isVinFastStation: true,
      isVinFastVehicle: false,
      station: makeStation(),
    };

    const result = scoreStation(input);
    expect(result.score).toBeCloseTo(result.totalStopTimeMin);
  });

  it('does not apply VinFast bonus when only vehicle is VinFast', () => {
    const input: ScoreStationInput = {
      detourDriveTimeSec: 300,
      stationPowerKw: 100,
      energyNeededKwh: 50,
      isVinFastStation: false,
      isVinFastVehicle: true,
      station: makeStation(),
    };

    const result = scoreStation(input);
    expect(result.score).toBeCloseTo(result.totalStopTimeMin);
  });

  it('caps VinFast bonus at 50%', () => {
    const input: ScoreStationInput = {
      detourDriveTimeSec: 600,
      stationPowerKw: 100,
      energyNeededKwh: 100,
      isVinFastStation: true,
      isVinFastVehicle: true,
      station: makeStation({ isVinFastOnly: true }),
    };

    const result = scoreStation(input);
    // Bonus is capped at 50%: score >= totalStopTimeMin * 0.5
    expect(result.score).toBeCloseTo(result.totalStopTimeMin * 0.5);
    expect(result.score).toBeGreaterThan(0);
  });

  it('respects vehicleMaxChargeKw', () => {
    const input: ScoreStationInput = {
      detourDriveTimeSec: 0,
      stationPowerKw: 150,
      energyNeededKwh: 50,
      isVinFastStation: false,
      isVinFastVehicle: false,
      vehicleMaxChargeKw: 50,
      station: makeStation({ maxPowerKw: 150 }),
    };

    const result = scoreStation(input);
    // Should use 50 kW (vehicle limit), not 150 kW
    const expectedChargeTime = (50 / 50) * 60 * 1.15; // 69
    expect(result.estimatedChargeTimeMin).toBeCloseTo(expectedChargeTime);
  });
});

// ── rankStations ──

describe('rankStations', () => {
  it('returns empty array for empty input', () => {
    expect(rankStations([])).toEqual([]);
  });

  it('assigns "best" rank to a single station', () => {
    const scored = [
      {
        station: makeStation(),
        detourDriveTimeSec: 120,
        estimatedChargeTimeMin: 30,
        totalStopTimeMin: 32,
        score: 32,
      },
    ];

    const ranked = rankStations(scored);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].rank).toBe('best');
  });

  it('assigns correct ranks: best, ok, slow', () => {
    const scored = [
      {
        station: makeStation({ id: 'a' }),
        detourDriveTimeSec: 60,
        estimatedChargeTimeMin: 10,
        totalStopTimeMin: 11,
        score: 10,
      },
      {
        station: makeStation({ id: 'b' }),
        detourDriveTimeSec: 120,
        estimatedChargeTimeMin: 15,
        totalStopTimeMin: 17,
        score: 14, // within 1.5x of 10 → ok
      },
      {
        station: makeStation({ id: 'c' }),
        detourDriveTimeSec: 300,
        estimatedChargeTimeMin: 40,
        totalStopTimeMin: 45,
        score: 20, // > 1.5x of 10 → slow
      },
    ];

    const ranked = rankStations(scored);
    expect(ranked[0].rank).toBe('best');
    expect(ranked[0].station.id).toBe('a');
    expect(ranked[1].rank).toBe('ok');
    expect(ranked[1].station.id).toBe('b');
    expect(ranked[2].rank).toBe('slow');
    expect(ranked[2].station.id).toBe('c');
  });

  it('sorts by score ascending', () => {
    const scored = [
      {
        station: makeStation({ id: 'high' }),
        detourDriveTimeSec: 600,
        estimatedChargeTimeMin: 60,
        totalStopTimeMin: 70,
        score: 50,
      },
      {
        station: makeStation({ id: 'low' }),
        detourDriveTimeSec: 60,
        estimatedChargeTimeMin: 10,
        totalStopTimeMin: 11,
        score: 5,
      },
    ];

    const ranked = rankStations(scored);
    expect(ranked[0].station.id).toBe('low');
    expect(ranked[1].station.id).toBe('high');
  });

  it('tiebreaker: prefers higher portCount', () => {
    const scored = [
      {
        station: makeStation({ id: 'few-ports', portCount: 2 }),
        detourDriveTimeSec: 60,
        estimatedChargeTimeMin: 10,
        totalStopTimeMin: 11,
        score: 10,
      },
      {
        station: makeStation({ id: 'many-ports', portCount: 8 }),
        detourDriveTimeSec: 60,
        estimatedChargeTimeMin: 10,
        totalStopTimeMin: 11,
        score: 10,
      },
    ];

    const ranked = rankStations(scored);
    expect(ranked[0].station.id).toBe('many-ports');
    expect(ranked[1].station.id).toBe('few-ports');
  });

  it('tiebreaker: prefers known operatingHours', () => {
    const scored = [
      {
        station: makeStation({ id: 'no-hours', portCount: 4, operatingHours: null }),
        detourDriveTimeSec: 60,
        estimatedChargeTimeMin: 10,
        totalStopTimeMin: 11,
        score: 10,
      },
      {
        station: makeStation({ id: 'has-hours', portCount: 4, operatingHours: '24/7' }),
        detourDriveTimeSec: 60,
        estimatedChargeTimeMin: 10,
        totalStopTimeMin: 11,
        score: 10,
      },
    ];

    const ranked = rankStations(scored);
    expect(ranked[0].station.id).toBe('has-hours');
    expect(ranked[1].station.id).toBe('no-hours');
  });

  it('tiebreaker: prefers non-VinFast-exclusive', () => {
    const scored = [
      {
        station: makeStation({ id: 'vf-only', portCount: 4, isVinFastOnly: true }),
        detourDriveTimeSec: 60,
        estimatedChargeTimeMin: 10,
        totalStopTimeMin: 11,
        score: 10,
      },
      {
        station: makeStation({ id: 'public', portCount: 4, isVinFastOnly: false }),
        detourDriveTimeSec: 60,
        estimatedChargeTimeMin: 10,
        totalStopTimeMin: 11,
        score: 10,
      },
    ];

    const ranked = rankStations(scored);
    expect(ranked[0].station.id).toBe('public');
    expect(ranked[1].station.id).toBe('vf-only');
  });

  it('marks multiple stations with same best score as "best"', () => {
    const scored = [
      {
        station: makeStation({ id: 'a', portCount: 4 }),
        detourDriveTimeSec: 60,
        estimatedChargeTimeMin: 10,
        totalStopTimeMin: 11,
        score: 10,
      },
      {
        station: makeStation({ id: 'b', portCount: 4 }),
        detourDriveTimeSec: 60,
        estimatedChargeTimeMin: 10,
        totalStopTimeMin: 11,
        score: 10,
      },
    ];

    const ranked = rankStations(scored);
    expect(ranked[0].rank).toBe('best');
    expect(ranked[1].rank).toBe('best');
  });
});
