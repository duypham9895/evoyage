import type { ChargingStationData, LatLng } from '@/types';
import type { ChargingDecisionPoint } from './route-planner';
import type { PrecautionaryInjectionSite } from './precautionary-stop-detector';
import { findStationsAlongRoute, haversineDistance } from './station-finder';

export interface InjectPrecautionaryStopsInput {
  readonly decisionPoints: readonly ChargingDecisionPoint[];
  readonly injectionSites: readonly PrecautionaryInjectionSite[];
  readonly routePoints: readonly LatLng[];
  readonly cumulativeRouteKm: readonly number[];
  readonly stations: readonly ChargingStationData[];
}

const MIDPOINT_CORRIDOR_KM = 5;
const MAX_CANDIDATES = 24;

function pointAtDistance(
  routePoints: readonly LatLng[],
  cumulativeRouteKm: readonly number[],
  targetKm: number,
): { readonly point: LatLng; readonly polylineIndex: number } {
  if (routePoints.length === 0) {
    return { point: { lat: 0, lng: 0 }, polylineIndex: 0 };
  }

  for (let i = 1; i < cumulativeRouteKm.length && i < routePoints.length; i++) {
    if (cumulativeRouteKm[i] < targetKm) continue;

    const prevKm = cumulativeRouteKm[i - 1] ?? 0;
    const nextKm = cumulativeRouteKm[i];
    const spanKm = nextKm - prevKm;
    const ratio = spanKm > 0 ? (targetKm - prevKm) / spanKm : 0;
    const prev = routePoints[i - 1]!;
    const next = routePoints[i]!;

    return {
      point: {
        lat: prev.lat + (next.lat - prev.lat) * ratio,
        lng: prev.lng + (next.lng - prev.lng) * ratio,
      },
      polylineIndex: i,
    };
  }

  return {
    point: routePoints[routePoints.length - 1]!,
    polylineIndex: routePoints.length - 1,
  };
}

export function injectPrecautionaryStops(
  input: InjectPrecautionaryStopsInput,
): readonly ChargingDecisionPoint[] {
  if (input.injectionSites.length === 0) return input.decisionPoints;

  const sitesByLeg = new Map<number, PrecautionaryInjectionSite>();
  for (const site of input.injectionSites) {
    sitesByLeg.set(site.legIndex, site);
  }

  const result: ChargingDecisionPoint[] = [];
  let inserted = false;

  for (let i = 0; i < input.decisionPoints.length; i++) {
    const current = input.decisionPoints[i]!;
    result.push(current);

    const site = sitesByLeg.get(i);
    const next = input.decisionPoints[i + 1];
    if (!site || !next) continue;

    const midpointKm = (current.distanceKm + next.distanceKm) / 2;
    const { point, polylineIndex } = pointAtDistance(
      input.routePoints,
      input.cumulativeRouteKm,
      midpointKm,
    );
    const candidates = findStationsAlongRoute(
      input.routePoints,
      input.cumulativeRouteKm,
      input.stations,
      Math.max(0, midpointKm - MIDPOINT_CORRIDOR_KM),
      midpointKm + MIDPOINT_CORRIDOR_KM,
      MIDPOINT_CORRIDOR_KM,
    ).filter((station) =>
      haversineDistance(point, {
        lat: station.latitude,
        lng: station.longitude,
      }) <= MIDPOINT_CORRIDOR_KM,
    );

    if (candidates.length === 0) continue;

    result.push({
      polylineIndex,
      distanceKm: midpointKm,
      point,
      candidates: candidates.slice(0, MAX_CANDIDATES),
      useCorridorScoring: true,
      isPrecautionary: true,
      precautionaryReason: site.reason,
      precautionaryTelemetry: {
        reasonPrimary: site.reason,
        reasonSecondary: site.reasonSecondary,
        pressureScore: site.pressureScore,
        legDistanceKm: site.legDistanceKm,
        legSparsityCount: site.legSparsityCount,
        safetyFactor: site.safetyFactor,
        vehicleBatteryKwh: site.vehicleBatteryKwh,
      },
    });
    inserted = true;
  }

  return inserted ? result : input.decisionPoints;
}
