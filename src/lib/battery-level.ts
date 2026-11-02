export type BatteryLevel = 'danger' | 'warn' | 'safe';

/** Width of the "warn" band above the user's minimum arrival, in percentage points. */
const WARN_BAND_PERCENT = 15;

/**
 * One rule for colouring any battery percentage on the results screen,
 * anchored on the user's chosen minimum arrival charge:
 * below it → danger, within 15 points above it → warn, otherwise safe.
 */
export function getBatteryLevel(percent: number, minArrivalPercent: number): BatteryLevel {
  if (percent < minArrivalPercent) return 'danger';
  if (percent < minArrivalPercent + WARN_BAND_PERCENT) return 'warn';
  return 'safe';
}
