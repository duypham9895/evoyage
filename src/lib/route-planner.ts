import type {
  ChargingStationData,
  ChargingStop,
  NoStationWarning,
  BatterySegment,
} from '@/types';
import {
  SAFETY_BUFFER_KM,
  CHARGE_TARGET_PERCENT,
} from '@/types';
import { calculateUsableRange } from './range-calculator';
import { haversineDistance, filterCompatibleStations, findNearestStation } from './station-finder';
import { decodePolyline, cumulativeDistances } from './polyline';

interface VehicleForPlanning {
  readonly brand: string;
  readonly model: string;
  readonly variant: string | null;
  readonly officialRangeKm: number;
  readonly batteryCapacityKwh: number;
  readonly chargingTimeDC_10to80_min: number | null;
}

export interface PlanChargingStopsInput {
  readonly encodedPolyline: string;
  readonly totalDistanceKm: number;
  readonly vehicle: VehicleForPlanning;
  readonly currentBatteryPercent: number;
  readonly minArrivalPercent: number;
  readonly rangeSafetyFactor: number;
  readonly stations: readonly ChargingStationData[];
}

export interface ChargingPlanResult {
  readonly chargingStops: readonly ChargingStop[];
  readonly warnings: readonly NoStationWarning[];
  readonly batterySegments: readonly BatterySegment[];
  readonly arrivalBatteryPercent: number;
}

/**
 * Core route planning algorithm.
 *
 * Walks the decoded polyline and determines where charging stops are needed.
 * When remaining range drops below the safety buffer, finds the nearest
 * compatible station and inserts a charging stop.
 *
 * After charging, battery resets to CHARGE_TARGET_PERCENT (80%).
 */
export function planChargingStops(input: PlanChargingStopsInput): ChargingPlanResult {
  const {
    encodedPolyline,
    vehicle,
    currentBatteryPercent,
    minArrivalPercent,
    rangeSafetyFactor,
    stations,
  } = input;

  const isVinFast = vehicle.brand.toLowerCase() === 'vinfast';
  const compatibleStations = filterCompatibleStations(stations, isVinFast);

  const effectiveMaxRange = vehicle.officialRangeKm * rangeSafetyFactor;

  // Decode polyline and compute cumulative distances
  const points = decodePolyline(encodedPolyline);
  const cumDist = cumulativeDistances(points, haversineDistance);
  const totalRouteKm = cumDist[cumDist.length - 1];

  // Initial usable range from current battery
  const initialRange = calculateUsableRange(
    vehicle,
    currentBatteryPercent,
    minArrivalPercent,
    rangeSafetyFactor,
  );

  let remainingRangeKm = initialRange.usableRangeKm;
  let currentBattery = currentBatteryPercent;
  let lastStopKm = 0;

  const chargingStops: ChargingStop[] = [];
  const warnings: NoStationWarning[] = [];
  const batterySegments: BatterySegment[] = [];

  // Walk through polyline points
  for (let i = 1; i < points.length; i++) {
    const segmentKm = cumDist[i] - cumDist[i - 1];
    remainingRangeKm -= segmentKm;

    // Check if we need to charge (remaining range below safety buffer)
    if (remainingRangeKm < SAFETY_BUFFER_KM && cumDist[i] < totalRouteKm - 1) {
      const nearest = findNearestStation(points[i], compatibleStations);

      if (nearest !== null) {
        // Calculate arrival battery at this station
        const distanceTraveled = cumDist[i] - lastStopKm;
        const batteryUsedPercent = (distanceTraveled / effectiveMaxRange) * 100;
        const arrivalBattery = Math.max(0, currentBattery - batteryUsedPercent);

        // Add battery segment for this leg
        batterySegments.push({
          startKm: lastStopKm,
          endKm: cumDist[i],
          startBatteryPercent: currentBattery,
          endBatteryPercent: arrivalBattery,
          label: chargingStops.length === 0
            ? `Start → ${nearest.station.name}`
            : `${chargingStops[chargingStops.length - 1].station.name} → ${nearest.station.name}`,
        });

        // Estimate charging time
        const chargingTimeMin = vehicle.chargingTimeDC_10to80_min ?? 30;

        chargingStops.push({
          station: nearest.station,
          distanceFromStartKm: cumDist[i],
          arrivalBatteryPercent: Math.round(arrivalBattery),
          departureBatteryPercent: CHARGE_TARGET_PERCENT,
          estimatedChargingTimeMin: chargingTimeMin,
        });

        // Reset after charging to 80%
        currentBattery = CHARGE_TARGET_PERCENT;
        const postChargeRange = calculateUsableRange(
          vehicle,
          CHARGE_TARGET_PERCENT,
          minArrivalPercent,
          rangeSafetyFactor,
        );
        remainingRangeKm = postChargeRange.usableRangeKm;
        lastStopKm = cumDist[i];
      } else {
        // No compatible station found
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

  // Final battery segment: last stop (or start) → destination
  const finalDistanceTraveled = totalRouteKm - lastStopKm;
  const finalBatteryUsed = (finalDistanceTraveled / effectiveMaxRange) * 100;
  const arrivalBatteryPercent = Math.max(0, Math.round(currentBattery - finalBatteryUsed));

  const lastLabel = chargingStops.length > 0
    ? `${chargingStops[chargingStops.length - 1].station.name} → Destination`
    : 'Start → Destination';

  batterySegments.push({
    startKm: lastStopKm,
    endKm: totalRouteKm,
    startBatteryPercent: currentBattery,
    endBatteryPercent: arrivalBatteryPercent,
    label: lastLabel,
  });

  return {
    chargingStops,
    warnings,
    batterySegments,
    arrivalBatteryPercent,
  };
}
