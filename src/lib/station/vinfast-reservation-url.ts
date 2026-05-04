/**
 * Build a deep-link to V-GREEN's reservation page for a specific station.
 *
 * V-GREEN's reservation flow lives on their consumer site; we punt the
 * actual booking experience there rather than embedding (the OAuth +
 * payment + slot-picking flow is its own multi-week scope).
 *
 * The returned URL is opened in a new tab by the caller so the user
 * doesn't lose their trip-planning context.
 *
 * Returns null for stations missing the VinFast `storeId` (i.e. non-
 * VinFast stations or rows that haven't been enriched yet).
 */

const RESERVATION_BASE = 'https://shop.vinfastauto.com/vn_vi/charging-station-search';

export interface ReservableStation {
  readonly storeId: string | null;
  readonly stationCode?: string | null;
}

export function buildVinfastReservationUrl(station: ReservableStation): string | null {
  if (!station.storeId) return null;

  const params = new URLSearchParams({ store_id: station.storeId });
  if (station.stationCode) {
    params.set('station_code', station.stationCode);
  }
  return `${RESERVATION_BASE}?${params}`;
}
