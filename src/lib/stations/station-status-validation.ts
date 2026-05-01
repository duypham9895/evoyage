/**
 * Validation helpers for crowdsourced station status reports.
 *
 * A status report is a 1-tap submission from a user marking a charger as
 * Working / Broken / Busy. We keep the schema deliberately tiny so reporting
 * stays low-friction.
 */

export const STATION_STATUS_VALUES = ['WORKING', 'BROKEN', 'BUSY'] as const;

export type StationStatus = (typeof STATION_STATUS_VALUES)[number];

/** Type guard — narrows an unknown string to a valid StationStatus. */
export function isValidStationStatus(value: unknown): value is StationStatus {
  return typeof value === 'string' && (STATION_STATUS_VALUES as readonly string[]).includes(value);
}

/**
 * Normalize a status string by trimming + uppercasing, then validate.
 * Returns the canonical status, or null if the input is not recognized.
 */
export function normalizeStationStatus(value: unknown): StationStatus | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  return isValidStationStatus(upper) ? (upper as StationStatus) : null;
}

/**
 * Format a "minutes ago" string for the last-verified label.
 * Used by the UI to show "Xác nhận lần cuối: X phút trước".
 *
 * Returns null for unset / future timestamps so the UI can hide the row.
 */
export function minutesSince(date: Date | null | undefined, now: Date = new Date()): number | null {
  if (!date) return null;
  const diffMs = now.getTime() - date.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return null;
  return Math.floor(diffMs / 60_000);
}
