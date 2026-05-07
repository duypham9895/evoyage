import type {
  ChargingStop,
  ChargingStopWithAlternatives,
  ChargingStationData,
} from '@/types';
import { getStopDistance, getStopStation } from '@/types';
import { computeBackupPressure } from './backup-pressure';
import { haversineDistance } from './station-finder';

export interface ApplyBackupPressureContext {
  readonly departureMoment: Date;
  readonly totalDistanceKm: number;
  readonly totalDurationMin: number;
  readonly chargingTimePerStopMin: readonly number[];
  readonly stations: readonly ChargingStationData[];
  readonly usableRangeAfterChargeKm: number;
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

function countStationsWithinKm(
  center: ChargingStationData,
  stations: readonly ChargingStationData[],
  radiusKm: number,
): number {
  let count = 0;
  for (const s of stations) {
    if (s.id === center.id) continue;
    const distKm = haversineDistance(
      { lat: center.latitude, lng: center.longitude },
      { lat: s.latitude, lng: s.longitude },
    );
    if (distKm <= radiusKm) count++;
  }
  return count;
}

export function applyBackupPressure(
  stops: readonly (ChargingStop | ChargingStopWithAlternatives)[],
  context: ApplyBackupPressureContext,
): readonly (ChargingStop | ChargingStopWithAlternatives)[] {
  // Invariant: caller must provide one charging-time entry per stop.
  // Misalignment yields garbage arrival times → silently wrong nMax. Fail loud.
  if (context.chargingTimePerStopMin.length !== stops.length) {
    throw new Error(
      `applyBackupPressure: chargingTimePerStopMin has length ` +
        `${context.chargingTimePerStopMin.length} but stops has length ${stops.length}`,
    );
  }

  const totalDriveSec = context.totalDurationMin * 60;
  const departureMs = context.departureMoment.getTime();
  let cumulativeChargeSec = 0;

  return stops.map((stop, i) => {
    const stopKm = getStopDistance(stop);
    const fraction = context.totalDistanceKm > 0 ? stopKm / context.totalDistanceKm : 0;
    const driveSec = totalDriveSec * fraction;
    const arrivalAt = new Date(departureMs + (driveSec + cumulativeChargeSec) * 1000);
    cumulativeChargeSec += context.chargingTimePerStopMin[i] * 60;

    const isLastStop = i === stops.length - 1;
    const distanceToNextStopKm = isLastStop ? null : getStopDistance(stops[i + 1]) - stopKm;

    const arrivalBatteryPercent = 'selected' in stop
      ? stop.batteryPercentAtArrival
      : stop.arrivalBatteryPercent;

    const downstreamStationCount = countStationsWithinKm(
      getStopStation(stop),
      context.stations,
      DOWNSTREAM_RADIUS_KM,
    );

    const { nMax } = computeBackupPressure({
      distanceToNextStopKm,
      arrivalBatteryPercent,
      downstreamStationCount,
      arrivalLocalHour: getVnHour(arrivalAt),
      tripDate: context.departureMoment,
      usableRangeKm: context.usableRangeAfterChargeKm,
    });

    if ('selected' in stop) {
      return { ...stop, alternatives: stop.alternatives.slice(0, nMax) };
    }
    return stop;
  });
}
