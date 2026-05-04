/**
 * Build a link to VinFast's station locator page, scoped to a specific
 * station via query params.
 *
 * Why locator and not deep-link to V-GREEN's reservation flow:
 * the actual reservation URL pattern on V-GREEN's site isn't publicly
 * documented and changes without notice; a 404 in production breaks user
 * trust. The locator page is the same source of truth that our crawler
 * uses (vinfastauto.com/vn_vi/tim-kiem-showroom-tram-sac) — known-stable.
 * From there the user can tap the station and follow VinFast's own UI to
 * the reservation flow if available.
 *
 * Returns null for stations missing the VinFast `storeId` (i.e. non-
 * VinFast stations or rows that haven't been enriched yet).
 *
 * The caller is responsible for the user-facing label — the spec ships
 * "Mở trên VinFast" (open on VinFast) rather than "Đặt trước qua V-GREEN"
 * to honestly match what the link actually does.
 */

const VINFAST_LOCATOR = 'https://vinfastauto.com/vn_vi/tim-kiem-showroom-tram-sac';

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
  return `${VINFAST_LOCATOR}?${params}`;
}
