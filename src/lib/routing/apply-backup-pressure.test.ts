import { describe, it, expect } from 'vitest';
import type {
  ChargingStationData,
  RankedStation,
  ChargingStopWithAlternatives,
  ChargingStop,
} from '@/types';
import { applyBackupPressure } from './apply-backup-pressure';

// Departure 02:00 UTC == 09:00 Asia/Ho_Chi_Minh (off-peak)
const BASE_CONTEXT = {
  departureMoment: new Date('2026-05-15T02:00:00Z'),
  totalDistanceKm: 200,
  totalDurationMin: 120,
  chargingTimePerStopMin: [] as readonly number[],
  stations: [] as readonly ChargingStationData[],
  usableRangeAfterChargeKm: 200,
};

function makeStation(id: string, lat = 10.5, lng = 106.5): ChargingStationData {
  return {
    id,
    name: id,
    address: '',
    province: '',
    latitude: lat,
    longitude: lng,
    chargerTypes: ['DC_60kW'],
    connectorTypes: ['CCS2'],
    portCount: 2,
    maxPowerKw: 60,
    stationType: 'public',
    isVinFastOnly: false,
    operatingHours: null,
    provider: 'Test',
    chargingStatus: null,
    parkingFee: null,
  };
}

function makeRanked(id: string, lat = 10.5, lng = 106.5): RankedStation {
  return {
    station: makeStation(id, lat, lng),
    detourDriveTimeSec: 60,
    estimatedChargeTimeMin: 30,
    totalStopTimeMin: 31,
    rank: 'ok',
    score: 31,
  };
}

function makeStopWithAlts(
  id: string,
  distAlongRouteKm: number,
  altCount: number,
  arrivalBattery = 50,
): ChargingStopWithAlternatives {
  return {
    selected: makeRanked(id),
    alternatives: Array.from({ length: altCount }, (_, i) => makeRanked(`${id}-alt${i}`)),
    distanceAlongRouteKm: distAlongRouteKm,
    batteryPercentAtArrival: arrivalBattery,
    batteryPercentAfterCharge: 80,
  };
}

describe('applyBackupPressure', () => {
  it('returns empty stops for empty input', () => {
    const result = applyBackupPressure([], BASE_CONTEXT);
    expect(result).toEqual([]);
  });

  it('trims a stop with 5 alternatives down to nMax (=1 under baseline pressure)', () => {
    const stop = makeStopWithAlts('A', 100, 5);
    const result = applyBackupPressure([stop], BASE_CONTEXT);

    expect(result).toHaveLength(1);
    const trimmed = result[0] as ChargingStopWithAlternatives;
    expect(trimmed.alternatives).toHaveLength(1);
    expect(trimmed.selected).toBe(stop.selected); // unchanged primary
  });

  it('keeps 3 alternatives when all 5 pressure signals fire on the first stop', () => {
    // Arrange: Tết departure at 12:00 local, low battery, far next stop, no nearby stations
    const stop1 = makeStopWithAlts('A', 50, 5, 24); // arrivalBattery=24 → lowBuffer
    const stop2 = makeStopWithAlts('B', 150, 5, 50);

    const result = applyBackupPressure([stop1, stop2], {
      ...BASE_CONTEXT,
      departureMoment: new Date('2026-02-17T05:00:00Z'), // 12:00 ICT on Tết Mùng 1
      totalDistanceKm: 200,
      totalDurationMin: 120,
      usableRangeAfterChargeKm: 100, // dist A→B = 100km > 70% → tightMargin
      chargingTimePerStopMin: [30, 30],
      stations: [], // 0 < 3 → sparseArea
    });

    const trimmed1 = result[0] as ChargingStopWithAlternatives;
    expect(trimmed1.alternatives).toHaveLength(3);
  });

  it('leaves a legacy ChargingStop (no alternatives field) untouched', () => {
    const legacyStop: ChargingStop = {
      station: makeStation('legacy'),
      distanceFromStartKm: 100,
      arrivalBatteryPercent: 50,
      departureBatteryPercent: 80,
      estimatedChargingTimeMin: 30,
    };

    const result = applyBackupPressure([legacyStop], BASE_CONTEXT);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(legacyStop); // identity — unchanged reference
  });

  it('computes pressure independently per stop — different nMax for different stops', () => {
    // stop1 (mid-route, low battery, peak arrival) fires all 5 signals → nMax 3.
    // stop2 (last stop, mid battery, off-peak arrival, holiday) fires only
    // sparseArea + holiday → score 2 → nMax 2.
    const stop1 = makeStopWithAlts('A', 50, 5, 24); // low battery
    const stop2 = makeStopWithAlts('B', 150, 5, 50); // mid battery

    const result = applyBackupPressure([stop1, stop2], {
      ...BASE_CONTEXT,
      departureMoment: new Date('2026-02-17T05:00:00Z'), // 12:00 ICT, Tết Mùng 1
      totalDistanceKm: 200,
      totalDurationMin: 120,
      usableRangeAfterChargeKm: 1, // tight for stop1, irrelevant for stop2 (last)
      chargingTimePerStopMin: [30, 30],
      stations: [],
    });

    expect((result[0] as ChargingStopWithAlternatives).alternatives).toHaveLength(3);
    expect((result[1] as ChargingStopWithAlternatives).alternatives).toHaveLength(2);
  });
});
