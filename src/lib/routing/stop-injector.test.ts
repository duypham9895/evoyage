import { describe, expect, it } from 'vitest';
import type { ChargingStationData } from '@/types';
import type { ChargingDecisionPoint } from './route-planner';
import type { PrecautionaryInjectionSite } from './precautionary-stop-detector';
import { injectPrecautionaryStops } from './stop-injector';

const SIGNALS = {
  tightMargin: false,
  lowBuffer: false,
  sparseArea: true,
  peakWindow: false,
  holiday: true,
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

function site(legIndex: number): PrecautionaryInjectionSite {
  return {
    legIndex,
    pressureScore: 5,
    reason: 'holiday',
    signals: SIGNALS,
  };
}

const ROUTE_POINTS = [
  { lat: 10, lng: 106 },
  { lat: 10, lng: 108 },
  { lat: 10, lng: 110 },
] as const;

const ROUTE_KM = [0, 200, 400] as const;

describe('injectPrecautionaryStops', () => {
  it('returns the same decision-point array when there are no injection sites', () => {
    const points = [decisionPoint(100), decisionPoint(300)];

    const result = injectPrecautionaryStops({
      decisionPoints: points,
      injectionSites: [],
      routePoints: ROUTE_POINTS,
      cumulativeRouteKm: ROUTE_KM,
      stations: [station('midpoint', 10, 108)],
    });

    expect(result).toBe(points);
  });

  it('splices one precautionary decision point at the midpoint of the leg', () => {
    const result = injectPrecautionaryStops({
      decisionPoints: [decisionPoint(100), decisionPoint(300)],
      injectionSites: [site(0)],
      routePoints: ROUTE_POINTS,
      cumulativeRouteKm: ROUTE_KM,
      stations: [station('midpoint', 10, 108)],
    });

    expect(result).toHaveLength(3);
    expect(result[1]).toMatchObject({
      distanceKm: 200,
      point: { lat: 10, lng: 108 },
      isPrecautionary: true,
      precautionaryReason: 'holiday',
      useCorridorScoring: true,
    });
    expect(result[1].candidates.map((candidate) => candidate.id)).toEqual(['midpoint']);
  });

  it('does not mutate the original decision points', () => {
    const points = [decisionPoint(100), decisionPoint(300)];
    const before = structuredClone(points);

    injectPrecautionaryStops({
      decisionPoints: points,
      injectionSites: [site(0)],
      routePoints: ROUTE_POINTS,
      cumulativeRouteKm: ROUTE_KM,
      stations: [station('midpoint', 10, 108)],
    });

    expect(points).toEqual(before);
  });

  it('injects two sites in route order', () => {
    const result = injectPrecautionaryStops({
      decisionPoints: [decisionPoint(100), decisionPoint(300), decisionPoint(390)],
      injectionSites: [site(0), site(1)],
      routePoints: ROUTE_POINTS,
      cumulativeRouteKm: ROUTE_KM,
      stations: [
        station('first', 10, 108),
        station('second', 10, 109.45),
      ],
    });

    expect(result.map((point) => point.distanceKm)).toEqual([100, 200, 300, 345, 390]);
    expect(result.filter((point) => point.isPrecautionary).map((point) => point.candidates[0]?.id))
      .toEqual(['first', 'second']);
  });

  it('silently skips a site when no station is within the midpoint corridor', () => {
    const points = [decisionPoint(100), decisionPoint(300)];

    const result = injectPrecautionaryStops({
      decisionPoints: points,
      injectionSites: [site(0)],
      routePoints: ROUTE_POINTS,
      cumulativeRouteKm: ROUTE_KM,
      stations: [station('far-away', 11, 108)],
    });

    expect(result).toBe(points);
  });

  it('skips injection sites that do not point at a real leg', () => {
    const points = [decisionPoint(100), decisionPoint(300)];

    const result = injectPrecautionaryStops({
      decisionPoints: points,
      injectionSites: [site(5)],
      routePoints: ROUTE_POINTS,
      cumulativeRouteKm: ROUTE_KM,
      stations: [station('midpoint', 10, 108)],
    });

    expect(result).toBe(points);
  });

  it('caps injected candidates at 24 stations', () => {
    const result = injectPrecautionaryStops({
      decisionPoints: [decisionPoint(100), decisionPoint(300)],
      injectionSites: [site(0)],
      routePoints: ROUTE_POINTS,
      cumulativeRouteKm: ROUTE_KM,
      stations: Array.from({ length: 30 }, (_, i) => station(`s${i}`, 10, 108)),
    });

    expect(result[1].candidates).toHaveLength(24);
  });

  it('preserves required decision-point object identity around the inserted point', () => {
    const first = decisionPoint(100);
    const second = decisionPoint(300);

    const result = injectPrecautionaryStops({
      decisionPoints: [first, second],
      injectionSites: [site(0)],
      routePoints: ROUTE_POINTS,
      cumulativeRouteKm: ROUTE_KM,
      stations: [station('midpoint', 10, 108)],
    });

    expect(result[0]).toBe(first);
    expect(result[2]).toBe(second);
  });
});
