import type {
  ChargingStationData,
  ChargingStop,
  ChargingStopWithAlternatives,
  NoStationWarning,
  BatterySegment,
  RankedStation,
} from '@/types';
import {
  SAFETY_BUFFER_KM,
  CHARGE_TARGET_PERCENT,
  getStopStation,
} from '@/types';
import { calculateUsableRange } from './range-calculator';
import { haversineDistance, filterCompatibleStations, findNearestStation, findStationsNearPoint } from './station-finder';
import { decodePolyline, cumulativeDistances } from './polyline';
// Station ranker is used in route.ts for Matrix API integration
// Keeping import available for future direct use in this module

interface VehicleForPlanning {
  readonly brand: string;
  readonly model: string;
  readonly variant: string | null;
  readonly officialRangeKm: number;
  readonly batteryCapacityKwh: number;
  readonly chargingTimeDC_10to80_min: number | null;
  readonly dcMaxChargingPowerKw?: number | null;
}

export interface PlanChargingStopsInput {
  readonly encodedPolyline: string;
  readonly totalDistanceKm: number;
  readonly vehicle: VehicleForPlanning;
  readonly currentBatteryPercent: number;
  readonly minArrivalPercent: number;
  readonly rangeSafetyFactor: number;
  readonly stations: readonly ChargingStationData[];
  readonly rankedStationsPerStop?: ReadonlyMap<number, readonly RankedStation[]>;
}

export interface ChargingPlanResult {
  readonly chargingStops: readonly (ChargingStop | ChargingStopWithAlternatives)[];
  readonly warnings: readonly NoStationWarning[];
  readonly batterySegments: readonly BatterySegment[];
  readonly arrivalBatteryPercent: number;
}

/**
 * Find candidate stations at a decision point for Matrix API ranking.
 * Returns the decision point index and candidate stations.
 */
export interface ChargingDecisionPoint {
  readonly polylineIndex: number;
  readonly distanceKm: number;
  readonly point: { readonly lat: number; readonly lng: number };
  readonly candidates: readonly ChargingStationData[];
}

/**
 * Pre-scan the route to find all charging decision points before planning.
 * This allows the caller to batch Matrix API calls.
 */
export function findChargingDecisionPoints(input: PlanChargingStopsInput): readonly ChargingDecisionPoint[] {
  const { encodedPolyline, vehicle, currentBatteryPercent, minArrivalPercent, rangeSafetyFactor, stations } = input;

  const isVinFast = vehicle.brand.toLowerCase() === 'vinfast';
  const compatibleStations = filterCompatibleStations(stations, isVinFast);
  const points = decodePolyline(encodedPolyline);
  const cumDist = cumulativeDistances(points, haversineDistance);
  const totalRouteKm = cumDist[cumDist.length - 1];

  const initialRange = calculateUsableRange(vehicle, currentBatteryPercent, minArrivalPercent, rangeSafetyFactor);
  let remainingRangeKm = initialRange.usableRangeKm;

  const decisionPoints: ChargingDecisionPoint[] = [];

  for (let i = 1; i < points.length; i++) {
    const segmentKm = cumDist[i] - cumDist[i - 1];
    remainingRangeKm -= segmentKm;

    if (remainingRangeKm < SAFETY_BUFFER_KM && cumDist[i] < totalRouteKm - 1) {
      const candidates = findStationsNearPoint(points[i], compatibleStations, 15);

      if (candidates.length > 0) {
        decisionPoints.push({
          polylineIndex: i,
          distanceKm: cumDist[i],
          point: points[i],
          candidates: candidates.slice(0, 24), // Matrix API limit
        });

        // Simulate charging to continue scanning
        const postChargeRange = calculateUsableRange(vehicle, CHARGE_TARGET_PERCENT, minArrivalPercent, rangeSafetyFactor);
        remainingRangeKm = postChargeRange.usableRangeKm;
      } else {
        // No stations — skip this decision point, continue scanning
        remainingRangeKm = SAFETY_BUFFER_KM; // allow algorithm to continue
      }
    }
  }

  return decisionPoints;
}

/**
 * Core route planning algorithm with smart station ranking.
 *
 * When rankedStationsPerStop is provided (from Matrix API), uses ranked stations.
 * Otherwise falls back to haversine nearest-station selection.
 */
export function planChargingStops(input: PlanChargingStopsInput): ChargingPlanResult {
  const {
    encodedPolyline,
    vehicle,
    currentBatteryPercent,
    minArrivalPercent,
    rangeSafetyFactor,
    stations,
    rankedStationsPerStop,
  } = input;

  const isVinFast = vehicle.brand.toLowerCase() === 'vinfast';
  const compatibleStations = filterCompatibleStations(stations, isVinFast);
  const effectiveMaxRange = vehicle.officialRangeKm * rangeSafetyFactor;

  const points = decodePolyline(encodedPolyline);
  const cumDist = cumulativeDistances(points, haversineDistance);
  const totalRouteKm = cumDist[cumDist.length - 1];

  const initialRange = calculateUsableRange(vehicle, currentBatteryPercent, minArrivalPercent, rangeSafetyFactor);

  let remainingRangeKm = initialRange.usableRangeKm;
  let currentBattery = currentBatteryPercent;
  let lastStopKm = 0;
  let decisionPointIndex = 0;

  const chargingStops: (ChargingStop | ChargingStopWithAlternatives)[] = [];
  const warnings: NoStationWarning[] = [];
  const batterySegments: BatterySegment[] = [];

  for (let i = 1; i < points.length; i++) {
    const segmentKm = cumDist[i] - cumDist[i - 1];
    remainingRangeKm -= segmentKm;

    if (remainingRangeKm < SAFETY_BUFFER_KM && cumDist[i] < totalRouteKm - 1) {
      const distanceTraveled = cumDist[i] - lastStopKm;
      const batteryUsedPercent = (distanceTraveled / effectiveMaxRange) * 100;
      const arrivalBattery = Math.max(0, currentBattery - batteryUsedPercent);

      // Try ranked stations first (from Matrix API)
      const rankedStations = rankedStationsPerStop?.get(decisionPointIndex);

      if (rankedStations && rankedStations.length > 0) {
        const best = rankedStations[0];
        const alternatives = rankedStations.slice(1, 3); // top 2 alternatives

        const lastStopName = chargingStops.length > 0
          ? getStopStation(chargingStops[chargingStops.length - 1]).name
          : 'Start';

        batterySegments.push({
          startKm: lastStopKm,
          endKm: cumDist[i],
          startBatteryPercent: currentBattery,
          endBatteryPercent: arrivalBattery,
          label: `${lastStopName} → ${best.station.name}`,
        });

        chargingStops.push({
          selected: best,
          alternatives,
          distanceAlongRouteKm: cumDist[i],
          batteryPercentAtArrival: arrivalBattery,
          batteryPercentAfterCharge: CHARGE_TARGET_PERCENT,
        });

        currentBattery = CHARGE_TARGET_PERCENT;
        const postChargeRange = calculateUsableRange(vehicle, CHARGE_TARGET_PERCENT, minArrivalPercent, rangeSafetyFactor);
        remainingRangeKm = postChargeRange.usableRangeKm;
        lastStopKm = cumDist[i];
        decisionPointIndex++;
      } else {
        // Fallback to haversine nearest station
        const nearest = findNearestStation(points[i], compatibleStations);

        if (nearest !== null) {
          const lastStopName = chargingStops.length > 0
            ? getStopStation(chargingStops[chargingStops.length - 1]).name
            : 'Start';

          batterySegments.push({
            startKm: lastStopKm,
            endKm: cumDist[i],
            startBatteryPercent: currentBattery,
            endBatteryPercent: arrivalBattery,
            label: `${lastStopName} → ${nearest.station.name}`,
          });

          const chargingTimeMin = vehicle.chargingTimeDC_10to80_min ?? 30;

          chargingStops.push({
            station: nearest.station,
            distanceFromStartKm: cumDist[i],
            arrivalBatteryPercent: Math.round(arrivalBattery),
            departureBatteryPercent: CHARGE_TARGET_PERCENT,
            estimatedChargingTimeMin: chargingTimeMin,
          });

          currentBattery = CHARGE_TARGET_PERCENT;
          const postChargeRange = calculateUsableRange(vehicle, CHARGE_TARGET_PERCENT, minArrivalPercent, rangeSafetyFactor);
          remainingRangeKm = postChargeRange.usableRangeKm;
          lastStopKm = cumDist[i];
        } else {
          warnings.push({
            type: 'NO_COMPATIBLE_STATION',
            distanceFromStartKm: cumDist[i],
            messageVi: isVinFast
              ? '⚠️ Không tìm thấy trạm sạc trong khu vực này.'
              : '⚠️ Không tìm thấy trạm sạc tương thích — trạm VinFast không hỗ trợ xe ' + vehicle.brand + '.',
            messageEn: isVinFast
              ? '⚠️ No charging station found in this area.'
              : `⚠️ No compatible stations found — VinFast stations don't support ${vehicle.brand} vehicles.`,
          });
        }
      }
    }
  }

  // Final battery segment
  const finalDistanceTraveled = totalRouteKm - lastStopKm;
  const finalBatteryUsed = (finalDistanceTraveled / effectiveMaxRange) * 100;
  const arrivalBatteryPercent = Math.max(0, Math.round(currentBattery - finalBatteryUsed));

  const lastStopName = chargingStops.length > 0
    ? getStopStation(chargingStops[chargingStops.length - 1]).name
    : 'Start';

  batterySegments.push({
    startKm: lastStopKm,
    endKm: totalRouteKm,
    startBatteryPercent: currentBattery,
    endBatteryPercent: arrivalBatteryPercent,
    label: `${lastStopName} → Destination`,
  });

  return {
    chargingStops,
    warnings,
    batterySegments,
    arrivalBatteryPercent,
  };
}
