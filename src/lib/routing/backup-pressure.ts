export interface BackupPressureInput {
  readonly distanceToNextStopKm: number | null;
  readonly arrivalBatteryPercent: number;
  readonly downstreamStationCount: number;
  readonly arrivalLocalHour: number;
  readonly tripDate: Date;
  readonly usableRangeKm: number;
}

export interface BackupPressureSignals {
  readonly tightMargin: boolean;
  readonly lowBuffer: boolean;
  readonly sparseArea: boolean;
  readonly peakWindow: boolean;
  readonly holiday: boolean;
}

export interface BackupPressureResult {
  readonly score: number;
  readonly nMax: number;
  readonly signals: BackupPressureSignals;
}

import { isHoliday } from '@/lib/trip/vietnam-holidays';

const TIGHT_MARGIN_FRACTION = 0.70;
const LOW_BUFFER_PERCENT = 25;
const SPARSE_DOWNSTREAM_THRESHOLD = 3;
const LUNCH_PEAK_START = 11;
const LUNCH_PEAK_END = 13;
const EVENING_PEAK_START = 17;
const EVENING_PEAK_END = 20;

function inPeakWindow(hour: number): boolean {
  const inLunch = hour >= LUNCH_PEAK_START && hour < LUNCH_PEAK_END;
  const inEvening = hour >= EVENING_PEAK_START && hour < EVENING_PEAK_END;
  return inLunch || inEvening;
}

export function computeBackupPressure(input: BackupPressureInput): BackupPressureResult {
  const tightMargin =
    input.distanceToNextStopKm !== null &&
    input.distanceToNextStopKm > input.usableRangeKm * TIGHT_MARGIN_FRACTION;

  const lowBuffer = input.arrivalBatteryPercent < LOW_BUFFER_PERCENT;
  const sparseArea = input.downstreamStationCount < SPARSE_DOWNSTREAM_THRESHOLD;
  const peakWindow = inPeakWindow(input.arrivalLocalHour);
  const holiday = isHoliday(input.tripDate) !== null;

  const signals: BackupPressureSignals = {
    tightMargin,
    lowBuffer,
    sparseArea,
    peakWindow,
    holiday,
  };

  const score =
    (tightMargin ? 1 : 0) +
    (lowBuffer ? 1 : 0) +
    (sparseArea ? 1 : 0) +
    (peakWindow ? 1 : 0) +
    (holiday ? 1 : 0);

  const nMax = score <= 1 ? 1 : score <= 3 ? 2 : 3;

  return { score, nMax, signals };
}
