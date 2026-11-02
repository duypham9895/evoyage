/**
 * Maps a station's `chargingStatus` enum to its locale label key.
 * Exact match only: substring checks read INACTIVE as active and
 * UNAVAILABLE as available. Null or unknown values get a neutral key.
 */
const STATUS_LABEL_KEYS: Readonly<Record<string, string>> = {
  ACTIVE: 'nearby_active',
  BUSY: 'nearby_busy',
  UNAVAILABLE: 'nearby_inactive',
  INACTIVE: 'nearby_inactive',
  OUTOFSERVICE: 'nearby_inactive',
};

export function getStationStatusKey(status: string | null | undefined): string {
  if (!status) return 'map_status_unknown';
  return STATUS_LABEL_KEYS[status.toUpperCase()] ?? 'map_status_unknown';
}
