import { getStopDistance, getStopStation } from '@/types';
import type { ChargingStationData, PrecautionaryReason, TripPlan } from '@/types';

export type TripStop = TripPlan['chargingStops'][number];

export const PRECAUTIONARY_REASON_LOCALE_KEY: Record<PrecautionaryReason, string> = {
  holiday: 'extra_stop_why_holiday',
  sparse: 'extra_stop_why_sparse',
  peak: 'extra_stop_why_peak',
  tightMargin: 'extra_stop_why_tight_margin',
  lowBuffer: 'extra_stop_why_low_buffer',
};

export function getStopArrivalBattery(stop: TripStop): number {
  return 'selected' in stop ? stop.batteryPercentAtArrival : stop.arrivalBatteryPercent;
}

export function getStopDepartureBattery(stop: TripStop): number {
  return 'selected' in stop ? stop.batteryPercentAfterCharge : stop.departureBatteryPercent;
}

export function getStopChargeTimeMin(stop: TripStop): number {
  return 'selected' in stop ? stop.selected.estimatedChargeTimeMin : stop.estimatedChargingTimeMin;
}

export function getStopIdentity(stop: TripStop): string {
  const station = getStopStation(stop);
  return getStationIdentity(station);
}

export function getStationIdentity(station: ChargingStationData): string {
  return station.id || `${station.latitude},${station.longitude}`;
}

function withStopArrivalBattery(stop: TripStop, arrivalBatteryPercent: number): TripStop {
  return 'selected' in stop
    ? { ...stop, batteryPercentAtArrival: arrivalBatteryPercent }
    : { ...stop, arrivalBatteryPercent };
}

export function projectTripPlanForDismissedStops(
  tripPlan: TripPlan,
  dismissedStopIds: ReadonlySet<string>,
  warningCopy: { readonly messageVi: string; readonly messageEn: string },
): TripPlan {
  if (dismissedStopIds.size === 0) return tripPlan;

  const chargingStops: TripStop[] = [];
  const warnings: TripPlan['warnings'][number][] = [...tripPlan.warnings];
  let currentBattery = tripPlan.batterySegments[0]?.startBatteryPercent ?? 0;
  let skippedSinceLastVisibleCharge = false;
  let totalChargingTimeMin = 0;

  tripPlan.chargingStops.forEach((stop, index) => {
    const segment = tripPlan.batterySegments[index];
    const plannedArrival = getStopArrivalBattery(stop);
    const segmentDrain = segment
      ? Math.max(0, segment.startBatteryPercent - segment.endBatteryPercent)
      : Math.max(0, currentBattery - plannedArrival);
    const arrivalBattery = Math.max(0, currentBattery - segmentDrain);

    if (stop.isPrecautionary === true && dismissedStopIds.has(getStopIdentity(stop))) {
      currentBattery = arrivalBattery;
      skippedSinceLastVisibleCharge = true;
      return;
    }

    const projectedStop = withStopArrivalBattery(stop, arrivalBattery);
    chargingStops.push(projectedStop);
    totalChargingTimeMin += getStopChargeTimeMin(projectedStop);

    if (skippedSinceLastVisibleCharge && arrivalBattery < 15) {
      warnings.push({
        type: 'INSUFFICIENT_MARGIN_AFTER_SKIP',
        distanceFromStartKm: getStopDistance(projectedStop),
        messageVi: warningCopy.messageVi,
        messageEn: warningCopy.messageEn,
      });
    }

    currentBattery = Math.max(arrivalBattery, getStopDepartureBattery(projectedStop));
    skippedSinceLastVisibleCharge = false;
  });

  const finalSegment = tripPlan.batterySegments[tripPlan.chargingStops.length];
  const arrivalBatteryPercent = finalSegment
    ? Math.max(0, currentBattery - Math.max(0, finalSegment.startBatteryPercent - finalSegment.endBatteryPercent))
    : skippedSinceLastVisibleCharge
      ? Math.max(0, Math.min(currentBattery, tripPlan.arrivalBatteryPercent))
      : tripPlan.arrivalBatteryPercent;

  return {
    ...tripPlan,
    chargingStops,
    warnings,
    arrivalBatteryPercent,
    totalChargingTimeMin,
  };
}
