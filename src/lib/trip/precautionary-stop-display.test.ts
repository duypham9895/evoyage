import { describe, expect, it } from 'vitest';
import {
  getPrecautionaryStopEventPayload,
  getStopIdentity,
  projectTripPlanForDismissedStops,
} from './precautionary-stop-display';
import type { ChargingStationData, RankedStation, TripPlan } from '@/types';

function makeStation(id: string, offset = 0): ChargingStationData {
  return {
    id,
    name: id,
    address: `${id} address`,
    province: 'Test',
    latitude: 10.776 + offset,
    longitude: 106.7 + offset,
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

function makeRankedStation(station: ChargingStationData): RankedStation {
  return {
    station,
    detourDriveTimeSec: 60,
    estimatedChargeTimeMin: 18,
    totalStopTimeMin: 19,
    rank: 'best',
    score: 19,
  };
}

function makeStop(
  stationId: string,
  distanceKm: number,
  isPrecautionary = false,
): TripPlan['chargingStops'][number] {
  return {
    selected: makeRankedStation(makeStation(stationId, distanceKm / 1000)),
    alternatives: [],
    distanceAlongRouteKm: distanceKm,
    batteryPercentAtArrival: 35,
    batteryPercentAfterCharge: 60,
    ...(isPrecautionary
      ? { isPrecautionary: true as const, precautionaryReason: 'holiday' as const }
      : {}),
  };
}

function makeTripPlan(stops: TripPlan['chargingStops']): TripPlan {
  return {
    totalDistanceKm: 300,
    totalDurationMin: 180,
    chargingStops: stops,
    warnings: [],
    batterySegments: [
      { startKm: 0, endKm: 100, startBatteryPercent: 80, endBatteryPercent: 35, label: 'A' },
      { startKm: 100, endKm: 200, startBatteryPercent: 60, endBatteryPercent: 35, label: 'B' },
      { startKm: 200, endKm: 300, startBatteryPercent: 60, endBatteryPercent: 32, label: 'C' },
    ],
    arrivalBatteryPercent: 32,
    totalChargingTimeMin: stops.length * 18,
    polyline: '',
    startAddress: 'A',
    endAddress: 'B',
    startCoord: { lat: 10.776, lng: 106.7 },
    endCoord: { lat: 11.94, lng: 108.443 },
    tripId: 'trip-1',
  };
}

const warningCopy = {
  messageVi: 'Pin còn thấp sau khi bỏ trạm.',
  messageEn: 'Skipping this top-up leaves low battery.',
};

describe('precautionary stop display projection', () => {
  it('uses station ID as the stable stop identity', () => {
    expect(getStopIdentity(makeStop('station-a', 100, true))).toBe('station-a');
  });

  it('hides only dismissed precautionary stations and keeps required stops visible', () => {
    const plan = makeTripPlan([
      makeStop('station-a', 100, true),
      makeStop('station-b', 200, false),
    ]);

    const projected = projectTripPlanForDismissedStops(
      plan,
      new Set(['station-a']),
      warningCopy,
    );

    expect(projected.chargingStops.map(getStopIdentity)).toEqual(['station-b']);
  });

  it('keeps fresh suggestions for different stations after recompute', () => {
    const holidayPlan = makeTripPlan([
      makeStop('new-holiday-station', 100, true),
    ]);

    const projected = projectTripPlanForDismissedStops(
      holidayPlan,
      new Set(['previously-dismissed-station']),
      warningCopy,
    );

    expect(projected.chargingStops.map(getStopIdentity)).toEqual(['new-holiday-station']);
  });

  it('builds the ADR-0009 event payload from stop metadata', () => {
    const stop = {
      ...makeStop('station-a', 100, true),
      precautionaryTelemetry: {
        reasonPrimary: 'holiday' as const,
        reasonSecondary: ['sparse' as const],
        pressureScore: 4,
        legDistanceKm: 126.5,
        legSparsityCount: 2,
        safetyFactor: 0.8,
        vehicleBatteryKwh: 82,
      },
    };

    expect(getPrecautionaryStopEventPayload(makeTripPlan([stop]), stop)).toEqual({
      tripId: 'trip-1',
      stationId: 'station-a',
      reasonPrimary: 'holiday',
      reasonSecondary: ['sparse'],
      pressureScore: 4,
      legDistanceKm: 126.5,
      legSparsityCount: 2,
      safetyFactor: 0.8,
      vehicleBatteryKwh: 82,
    });
  });
});
