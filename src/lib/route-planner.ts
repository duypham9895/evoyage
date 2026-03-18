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
import {
  haversineDistance,
  filterCompatibleStations,
  findNearestStation,
  findStationsNearPoint,
  findStationsAlongRoute,
  type StationWithRouteInfo,
} from './station-finder';
import { decodePolyline, cumulativeDistances } from './polyline';

// ── Corridor Search Constants ──
const SEARCH_TRIGGER_KM = 80;       // Start looking when range < 80km
const PRIMARY_CORRIDOR_KM = 5;      // First try: 5km from route
const FALLBACK_CORRIDOR_KM = 10;    // Second try: 10km from route
const FALLBACK_RADIUS_KM = 15;      // Last resort: 15km circle (old behavior)

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
  /** Pre-computed decision points (avoids recomputing in planChargingStops) */
  readonly precomputedDecisionPoints?: readonly ChargingDecisionPoint[];
}

export interface ChargingPlanResult {
  readonly chargingStops: readonly (ChargingStop | ChargingStopWithAlternatives)[];
  readonly warnings: readonly NoStationWarning[];
  readonly batterySegments: readonly BatterySegment[];
  readonly arrivalBatteryPercent: number;
}

/**
 * A point along the route where the vehicle should charge.
 * Contains candidate stations found via corridor search.
 */
export interface ChargingDecisionPoint {
  readonly polylineIndex: number;
  readonly distanceKm: number;
  readonly point: { readonly lat: number; readonly lng: number };
  readonly candidates: readonly ChargingStationData[];
  /** True when candidates were found via route-corridor search (detour can be estimated from distance-to-route) */
  readonly useCorridorScoring: boolean;
}

/**
 * Pre-scan the route to find all charging decision points.
 *
 * Uses route-corridor search: finds stations within a narrow corridor (5km)
 * along the actual route polyline, with look-ahead to find on-highway stations
 * BEFORE battery reaches critical levels.
 *
 * Fallback chain: 5km corridor → 10km corridor → 15km point radius.
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
  let lastDecisionKm = 0;

  const decisionPoints: ChargingDecisionPoint[] = [];

  for (let i = 1; i < points.length; i++) {
    const segmentKm = cumDist[i] - cumDist[i - 1];
    remainingRangeKm -= segmentKm;

    const needsSearch = remainingRangeKm < SEARCH_TRIGGER_KM;
    const notNearEnd = cumDist[i] < totalRouteKm - 5;
    const notJustCharged = cumDist[i] > lastDecisionKm + 10;

    if (needsSearch && notNearEnd && notJustCharged) {
      // Search window: current position forward to max reachable (keep half safety buffer)
      const searchFromKm = cumDist[i];
      const searchToKm = Math.min(
        cumDist[i] + Math.max(remainingRangeKm - SAFETY_BUFFER_KM * 0.5, 10),
        totalRouteKm - 5,
      );

      // Strategy 1: Narrow 5km corridor along route
      let corridorCandidates = findStationsAlongRoute(
        points, cumDist, compatibleStations,
        searchFromKm, searchToKm, PRIMARY_CORRIDOR_KM,
      );

      // Strategy 2: Wider 10km corridor
      if (corridorCandidates.length === 0) {
        corridorCandidates = findStationsAlongRoute(
          points, cumDist, compatibleStations,
          searchFromKm, searchToKm, FALLBACK_CORRIDOR_KM,
        );
      }

      if (corridorCandidates.length > 0) {
        // Pick the latest on-route station that's close to the route
        // (charging later = fewer total stops)
        const optimal = pickOptimalStation(corridorCandidates);
        const dpIdx = Math.min(optimal.nearestRouteIdx, points.length - 1);

        decisionPoints.push({
          polylineIndex: dpIdx,
          distanceKm: optimal.nearestRouteKm,
          point: points[dpIdx],
          candidates: corridorCandidates.slice(0, 24),
          useCorridorScoring: true,
        });

        // Simulate charging: deduct round-trip detour from post-charge range
        const postChargeRange = calculateUsableRange(vehicle, CHARGE_TARGET_PERCENT, minArrivalPercent, rangeSafetyFactor);
        const detourKm = optimal.distanceToRouteKm * 2; // round trip to/from station
        remainingRangeKm = postChargeRange.usableRangeKm - detourKm;
        lastDecisionKm = optimal.nearestRouteKm;

        // Advance loop past the station to avoid re-triggering
        if (dpIdx > i) {
          i = dpIdx;
        }
      } else if (remainingRangeKm < SAFETY_BUFFER_KM) {
        // Strategy 3: Fallback to 15km circle around current point (old behavior)
        const pointCandidates = findStationsNearPoint(points[i], compatibleStations, FALLBACK_RADIUS_KM);

        if (pointCandidates.length > 0) {
          decisionPoints.push({
            polylineIndex: i,
            distanceKm: cumDist[i],
            point: points[i],
            candidates: pointCandidates.slice(0, 24),
            useCorridorScoring: false,
          });

          const postChargeRange = calculateUsableRange(vehicle, CHARGE_TARGET_PERCENT, minArrivalPercent, rangeSafetyFactor);
          remainingRangeKm = postChargeRange.usableRangeKm;
          lastDecisionKm = cumDist[i];
        } else {
          // No stations found — add empty decision point for warning generation
          decisionPoints.push({
            polylineIndex: i,
            distanceKm: cumDist[i],
            point: points[i],
            candidates: [],
            useCorridorScoring: false,
          });

          // Allow algorithm to continue scanning
          remainingRangeKm = SAFETY_BUFFER_KM;
          lastDecisionKm = cumDist[i];
        }
      }
    }
  }

  return decisionPoints;
}

/**
 * Pick the optimal station from corridor candidates.
 *
 * Strategy: among stations close to the route (< 2km), prefer the latest one
 * on the route (fewer total stops). For stations further from the route,
 * prefer closer-to-route ones.
 */
function pickOptimalStation(candidates: readonly StationWithRouteInfo[]): StationWithRouteInfo {
  const sorted = [...candidates].sort((a, b) => {
    // Strongly prefer stations very close to route (< 2km)
    const aClose = a.distanceToRouteKm < 2;
    const bClose = b.distanceToRouteKm < 2;

    if (aClose && bClose) {
      // Both close to route: prefer the one further along (charge later = fewer stops)
      return b.nearestRouteKm - a.nearestRouteKm;
    }

    if (aClose !== bClose) {
      return aClose ? -1 : 1; // Close-to-route wins
    }

    // Both far from route: prefer closer to route
    return a.distanceToRouteKm - b.distanceToRouteKm;
  });

  return sorted[0];
}

/**
 * Estimate round-trip detour distance (km) for a station.
 * Uses distanceToRouteKm from corridor search when available,
 * otherwise estimates from haversine distance to the decision point.
 */
function getStationDetourKm(
  station: ChargingStationData,
  dp: ChargingDecisionPoint,
): number {
  // If station has route-corridor info, use the precise distance-to-route
  const routeInfo = station as StationWithRouteInfo;
  if (routeInfo.distanceToRouteKm !== undefined) {
    return routeInfo.distanceToRouteKm * 2; // round trip
  }

  // Fallback: haversine distance from decision point to station
  const distKm = haversineDistance(dp.point, {
    lat: station.latitude,
    lng: station.longitude,
  });
  return distKm * 2; // round trip
}

/**
 * Core route planning algorithm — builds charging stops from decision points.
 *
 * When rankedStationsPerStop is provided (from Matrix API or corridor scoring),
 * uses ranked stations. Otherwise falls back to haversine nearest-station.
 */
export function planChargingStops(input: PlanChargingStopsInput): ChargingPlanResult {
  const {
    encodedPolyline,
    vehicle,
    currentBatteryPercent,
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

  // Use pre-computed decision points if available, otherwise compute them
  const decisionPoints = input.precomputedDecisionPoints ?? findChargingDecisionPoints(input);

  let currentBattery = currentBatteryPercent;
  let lastStopKm = 0;

  const chargingStops: (ChargingStop | ChargingStopWithAlternatives)[] = [];
  const warnings: NoStationWarning[] = [];
  const batterySegments: BatterySegment[] = [];

  for (let dpIdx = 0; dpIdx < decisionPoints.length; dpIdx++) {
    const dp = decisionPoints[dpIdx];

    // Route distance from last stop to this decision point
    const routeDistanceKm = dp.distanceKm - lastStopKm;

    // Try ranked stations first (from Matrix API or corridor scoring)
    const rankedStations = rankedStationsPerStop?.get(dpIdx);

    if (rankedStations && rankedStations.length > 0) {
      const best = rankedStations[0];
      const alternatives = rankedStations.slice(1, 3);

      // Account for detour: station may be off-route, add round-trip distance
      const detourKm = getStationDetourKm(best.station, dp);
      const totalDrivenKm = routeDistanceKm + detourKm;
      const batteryUsedPercent = (totalDrivenKm / effectiveMaxRange) * 100;
      const arrivalBattery = Math.max(0, currentBattery - batteryUsedPercent);

      const lastStopName = chargingStops.length > 0
        ? getStopStation(chargingStops[chargingStops.length - 1]).name
        : 'Start';

      batterySegments.push({
        startKm: lastStopKm,
        endKm: dp.distanceKm,
        startBatteryPercent: currentBattery,
        endBatteryPercent: arrivalBattery,
        label: `${lastStopName} → ${best.station.name}`,
      });

      chargingStops.push({
        selected: best,
        alternatives,
        distanceAlongRouteKm: dp.distanceKm,
        batteryPercentAtArrival: arrivalBattery,
        batteryPercentAfterCharge: CHARGE_TARGET_PERCENT,
      });

      currentBattery = CHARGE_TARGET_PERCENT;
      lastStopKm = dp.distanceKm;
    } else if (dp.candidates.length > 0) {
      // Fallback to haversine nearest station from candidates
      const nearest = findNearestStation(dp.point, compatibleStations);

      if (nearest !== null) {
        // Detour for nearest station: round-trip from route to station
        const detourKm = nearest.distanceKm * 2;
        const totalDrivenKm = routeDistanceKm + detourKm;
        const batteryUsedPercent = (totalDrivenKm / effectiveMaxRange) * 100;
        const arrivalBattery = Math.max(0, currentBattery - batteryUsedPercent);

        const lastStopName = chargingStops.length > 0
          ? getStopStation(chargingStops[chargingStops.length - 1]).name
          : 'Start';

        batterySegments.push({
          startKm: lastStopKm,
          endKm: dp.distanceKm,
          startBatteryPercent: currentBattery,
          endBatteryPercent: arrivalBattery,
          label: `${lastStopName} → ${nearest.station.name}`,
        });

        const chargingTimeMin = vehicle.chargingTimeDC_10to80_min ?? 30;

        chargingStops.push({
          station: nearest.station,
          distanceFromStartKm: dp.distanceKm,
          arrivalBatteryPercent: Math.round(arrivalBattery),
          departureBatteryPercent: CHARGE_TARGET_PERCENT,
          estimatedChargingTimeMin: chargingTimeMin,
        });

        currentBattery = CHARGE_TARGET_PERCENT;
        lastStopKm = dp.distanceKm;
      }
    } else {
      // No candidates at all — generate warning
      warnings.push({
        type: 'NO_COMPATIBLE_STATION',
        distanceFromStartKm: dp.distanceKm,
        messageVi: isVinFast
          ? '⚠️ Không tìm thấy trạm sạc trong khu vực này.'
          : '⚠️ Không tìm thấy trạm sạc tương thích — trạm VinFast không hỗ trợ xe ' + vehicle.brand + '.',
        messageEn: isVinFast
          ? '⚠️ No charging station found in this area.'
          : `⚠️ No compatible stations found — VinFast stations don't support ${vehicle.brand} vehicles.`,
      });
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
