import { describe, expect, it } from 'vitest';
import type { ChargingStationData } from '@/types';
import type { ChargingDecisionPoint } from './route-planner';
import { buildPrecautionaryStops } from './precautionary-stop-builder';

const VEHICLE = {
  brand: 'VinFast',
  model: 'VF 8',
  variant: null,
  officialRangeKm: 400,
  batteryCapacityKwh: 87.7,
  chargingTimeDC_10to80_min: 30,
};

function station(id: string, lat: number, lng: number): ChargingStationData {
  return {
    id,
    name: id,
    address: 'Test',
    province: 'Test',
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

function decisionPoint(distanceKm: number): ChargingDecisionPoint {
  return {
    polylineIndex: distanceKm / 100,
    distanceKm,
    point: { lat: 10, lng: 106 + distanceKm / 100 },
    candidates: [],
    useCorridorScoring: true,
  };
}

const ROUTE_POINTS = [
  { lat: 10, lng: 106 },
  { lat: 10, lng: 108 },
  { lat: 10, lng: 110 },
] as const;

const ROUTE_KM = [0, 200, 400] as const;
const MIDPOINT_STATIONS = [
  station('first-midpoint', 10, 108),
  station('second-midpoint', 10, 109.45),
] as const;

function build(overrides: Partial<Parameters<typeof buildPrecautionaryStops>[0]> = {}) {
  return buildPrecautionaryStops({
    enabled: true,
    decisionPoints: [decisionPoint(100), decisionPoint(300), decisionPoint(390)],
    routePoints: ROUTE_POINTS,
    cumulativeRouteKm: ROUTE_KM,
    stations: MIDPOINT_STATIONS,
    vehicle: VEHICLE,
    currentBatteryPercent: 40,
    minArrivalPercent: 15,
    rangeSafetyFactor: 0.90,
    departureMoment: new Date('2026-02-17T04:00:00Z'), // 11:00 ICT on Tết Mùng 1
    totalDistanceKm: 400,
    totalDurationMin: 240,
    ...overrides,
  });
}

describe('buildPrecautionaryStops', () => {
  it('returns the original decision points when the feature flag is off', () => {
    const points = [decisionPoint(100), decisionPoint(300)];

    const result = build({
      enabled: false,
      decisionPoints: points,
    });

    expect(result.decisionPoints).toBe(points);
    expect(result.injectionSites).toEqual([]);
  });

  it('does not inject when computed pressure is below the safety-factor threshold', () => {
    const points = [decisionPoint(100), decisionPoint(300)];

    const result = build({
      decisionPoints: points,
      currentBatteryPercent: 80,
      departureMoment: new Date('2026-05-15T02:00:00Z'), // 09:00 ICT, non-holiday
      rangeSafetyFactor: 0.80,
      stations: [
        ...MIDPOINT_STATIONS,
        station('dense-1', 10.1, 107),
        station('dense-2', 10.2, 107),
        station('dense-3', 10.3, 107),
      ],
    });

    expect(result.decisionPoints).toBe(points);
    expect(result.injectionSites).toEqual([]);
  });

  it('injects up to two precautionary decision points on high-pressure holiday legs', () => {
    const result = build();

    expect(result.injectionSites.map((site) => site.legIndex)).toEqual([0, 1]);
    expect(result.decisionPoints.filter((point) => point.isPrecautionary)).toHaveLength(2);
    expect(result.decisionPoints.filter((point) => point.isPrecautionary).map((point) => ({
      distanceKm: point.distanceKm,
      reason: point.precautionaryReason,
    }))).toEqual([
      { distanceKm: 200, reason: 'holiday' },
      { distanceKm: 345, reason: 'holiday' },
    ]);
  });

  it('uses the stricter score-5 threshold at safety factor 0.70', () => {
    const result = build({
      decisionPoints: [decisionPoint(100), decisionPoint(300)],
      rangeSafetyFactor: 0.70,
      currentBatteryPercent: 80,
      stations: MIDPOINT_STATIONS,
    });

    expect(result.decisionPoints.filter((point) => point.isPrecautionary)).toHaveLength(0);
  });

  it('does not inject when fewer than two required decision points exist', () => {
    const points = [decisionPoint(100)];

    const result = build({ decisionPoints: points });

    expect(result.decisionPoints).toBe(points);
    expect(result.injectionSites).toEqual([]);
  });

  it('does not add a decision point when no midpoint station qualifies', () => {
    const points = [decisionPoint(100), decisionPoint(300)];

    const result = build({
      decisionPoints: points,
      stations: [station('far-away', 11, 108)],
    });

    expect(result.decisionPoints).toBe(points);
  });

  it('does not exceed the trip cap when one precautionary point already exists', () => {
    const result = build({
      decisionPoints: [
        { ...decisionPoint(100), isPrecautionary: true },
        decisionPoint(300),
        decisionPoint(390),
      ],
    });

    expect(result.decisionPoints.filter((point) => point.isPrecautionary)).toHaveLength(2);
  });

  it('does not inject VinFast-only midpoint stations for non-VinFast vehicles', () => {
    const points = [decisionPoint(100), decisionPoint(300)];
    const vinFastOnly = {
      ...station('vinfast-only', 10, 108),
      isVinFastOnly: true,
      provider: 'VinFast',
    };

    const result = build({
      decisionPoints: points,
      vehicle: { ...VEHICLE, brand: 'BYD', model: 'Seal' },
      stations: [vinFastOnly],
    });

    expect(result.decisionPoints).toBe(points);
  });
});
