import { CHARGE_TARGET_PERCENT, type ChargingStationData, type LatLng } from '@/types';
import type { ChargingDecisionPoint } from './route-planner';
import { computeBackupPressure } from './backup-pressure';
import type { PrecautionaryInjectionSite, PrecautionaryLegPressure } from './precautionary-stop-detector';
import { findInjectionSites } from './precautionary-stop-detector';
import { calculateUsableRange } from './range-calculator';
import { filterCompatibleStations, haversineDistance } from './station-finder';
import { injectPrecautionaryStops } from './stop-injector';
import { chargeTargetForDecisionPoint } from './top-up-target';

interface VehicleForPrecautionaryStops {
  readonly brand: string;
  readonly model: string;
  readonly variant: string | null;
  readonly officialRangeKm: number;
  readonly batteryCapacityKwh: number;
  readonly chargingTimeDC_10to80_min: number | null;
}

export interface BuildPrecautionaryStopsInput {
  readonly enabled: boolean;
  readonly decisionPoints: readonly ChargingDecisionPoint[];
  readonly routePoints: readonly LatLng[];
  readonly cumulativeRouteKm: readonly number[];
  readonly stations: readonly ChargingStationData[];
  readonly vehicle: VehicleForPrecautionaryStops;
  readonly currentBatteryPercent: number;
  readonly minArrivalPercent: number;
  readonly rangeSafetyFactor: number;
  readonly departureMoment: Date;
  readonly totalDistanceKm: number;
  readonly totalDurationMin: number;
}

export interface BuildPrecautionaryStopsResult {
  readonly decisionPoints: readonly ChargingDecisionPoint[];
  readonly injectionSites: readonly PrecautionaryInjectionSite[];
}

const DOWNSTREAM_RADIUS_KM = 100;
const VN_HOUR_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  hour12: false,
});

function getVnHour(date: Date): number {
  return parseInt(VN_HOUR_FORMATTER.format(date), 10);
}

function countStationsNearPoint(
  point: LatLng,
  stations: readonly ChargingStationData[],
): number {
  let count = 0;
  for (const station of stations) {
    const distanceKm = haversineDistance(point, {
      lat: station.latitude,
      lng: station.longitude,
    });
    if (distanceKm <= DOWNSTREAM_RADIUS_KM) count++;
  }
  return count;
}

function estimateArrivalBatteryByDecisionPoint(input: BuildPrecautionaryStopsInput): readonly number[] {
  const effectiveRangeKm = input.vehicle.officialRangeKm * input.rangeSafetyFactor;
  let currentBattery = input.currentBatteryPercent;
  let lastStopKm = 0;

  return input.decisionPoints.map((decisionPoint) => {
    const drivenKm = Math.max(0, decisionPoint.distanceKm - lastStopKm);
    const usedPercent = effectiveRangeKm > 0 ? (drivenKm / effectiveRangeKm) * 100 : 0;
    const arrivalBattery = Math.max(0, currentBattery - usedPercent);

    currentBattery = Math.max(
      arrivalBattery,
      chargeTargetForDecisionPoint(decisionPoint, input.vehicle),
    );
    lastStopKm = decisionPoint.distanceKm;

    return arrivalBattery;
  });
}

function estimateArrivalHourByDecisionPoint(input: BuildPrecautionaryStopsInput): readonly number[] {
  const departureMs = input.departureMoment.getTime();
  const totalDriveSec = input.totalDurationMin * 60;
  const chargeSec = (input.vehicle.chargingTimeDC_10to80_min ?? 30) * 60;
  let cumulativeChargeSec = 0;

  return input.decisionPoints.map((decisionPoint) => {
    const fraction = input.totalDistanceKm > 0
      ? decisionPoint.distanceKm / input.totalDistanceKm
      : 0;
    const driveSec = totalDriveSec * fraction;
    const arrivalAt = new Date(departureMs + (driveSec + cumulativeChargeSec) * 1000);
    cumulativeChargeSec += chargeSec;
    return getVnHour(arrivalAt);
  });
}

function computeLegPressures(input: BuildPrecautionaryStopsInput): readonly PrecautionaryLegPressure[] {
  const arrivals = estimateArrivalBatteryByDecisionPoint(input);
  const arrivalHours = estimateArrivalHourByDecisionPoint(input);
  const usableRangeAfterChargeKm = calculateUsableRange(
    input.vehicle,
    CHARGE_TARGET_PERCENT,
    input.minArrivalPercent,
    input.rangeSafetyFactor,
  ).usableRangeKm;

  const legs: PrecautionaryLegPressure[] = [];

  for (let i = 0; i < input.decisionPoints.length - 1; i++) {
    const current = input.decisionPoints[i]!;
    const next = input.decisionPoints[i + 1]!;
    const legDistanceKm = Math.max(0, next.distanceKm - current.distanceKm);
    const downstreamStationCount = countStationsNearPoint(current.point, input.stations);

    legs.push({
      legIndex: i,
      legDistanceKm,
      downstreamStationCount,
      pressure: computeBackupPressure({
        distanceToNextStopKm: legDistanceKm,
        arrivalBatteryPercent: arrivals[i] ?? 100,
        downstreamStationCount,
        arrivalLocalHour: arrivalHours[i] ?? 0,
        tripDate: input.departureMoment,
        usableRangeKm: usableRangeAfterChargeKm,
      }),
    });
  }

  return legs;
}

export function buildPrecautionaryStops(
  input: BuildPrecautionaryStopsInput,
): BuildPrecautionaryStopsResult {
  if (!input.enabled) {
    return { decisionPoints: input.decisionPoints, injectionSites: [] };
  }
  const compatibleStations = filterCompatibleStations(
    input.stations,
    input.vehicle.brand.toLowerCase() === 'vinfast',
  );
  const compatibleInput = { ...input, stations: compatibleStations };

  const existingPrecautionaryCount = input.decisionPoints.filter(
    (point) => point.isPrecautionary === true,
  ).length;
  const injectionSites = findInjectionSites({
    legs: computeLegPressures(compatibleInput),
    rangeSafetyFactor: input.rangeSafetyFactor,
    vehicleBatteryKwh: input.vehicle.batteryCapacityKwh,
    existingPrecautionaryCount,
  });

  if (injectionSites.length === 0) {
    return { decisionPoints: input.decisionPoints, injectionSites };
  }

  return {
    decisionPoints: injectPrecautionaryStops({
      decisionPoints: input.decisionPoints,
      injectionSites,
      routePoints: input.routePoints,
      cumulativeRouteKm: input.cumulativeRouteKm,
      stations: compatibleStations,
    }),
    injectionSites,
  };
}
