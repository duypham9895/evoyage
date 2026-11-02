/**
 * Catches VinFast feed rows that sit on a placeholder coordinate instead of
 * their real location (docs/bugs/2026-11-01-p2-station-data-integrity.md,
 * Finding 2). On 2026-11-01 about 108 out-of-region stations, mostly Hà Nội
 * (province_id 2483), were sent at one HCM District 1 point, which put them
 * "0.2 km away" in Nearby and made the ACTIVE ones route candidates.
 *
 * Two rules, so a new constant from VinFast is still caught:
 *   1. The known placeholder point, matched to 1e-6 degrees (the feed sends
 *      six-decimal strings).
 *   2. A latitude more than MAX_PROVINCE_LAT_SPREAD_DEG from the median
 *      latitude of the other rows with the same province_id. Hà Nội to HCM is
 *      ~10 degrees and Đà Nẵng to HCM ~5; no Vietnamese province spans 3.
 *      Skipped when the province has fewer than MIN_PROVINCE_SAMPLE rows, since
 *      a median of a handful of rows is not trustworthy.
 */

export const VINFAST_PLACEHOLDER_COORDINATE = { lat: 10.773106, lng: 106.694794 } as const;
export const MAX_PROVINCE_LAT_SPREAD_DEG = 3;
export const MIN_PROVINCE_SAMPLE = 5;

const EPSILON = 1e-6;

interface Locatable {
  readonly lat: string;
  readonly lng: string;
  readonly province_id: string;
}

function isKnownPlaceholder(lat: number, lng: number): boolean {
  return (
    Math.abs(lat - VINFAST_PLACEHOLDER_COORDINATE.lat) < EPSILON &&
    Math.abs(lng - VINFAST_PLACEHOLDER_COORDINATE.lng) < EPSILON
  );
}

function median(sorted: readonly number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Expects rows whose lat/lng already parse to numbers. */
export function partitionPlaceholderCoordinates<T extends Locatable>(
  rows: readonly T[],
): { kept: T[]; dropped: T[] } {
  const known = new Set<T>();
  const latsByProvince = new Map<string, number[]>();
  for (const r of rows) {
    const lat = parseFloat(r.lat);
    if (isKnownPlaceholder(lat, parseFloat(r.lng))) {
      known.add(r);
      continue;
    }
    if (!r.province_id) continue;
    const lats = latsByProvince.get(r.province_id) ?? [];
    lats.push(lat);
    latsByProvince.set(r.province_id, lats);
  }

  const medianByProvince = new Map<string, number>();
  for (const [province, lats] of latsByProvince) {
    if (lats.length < MIN_PROVINCE_SAMPLE) continue;
    medianByProvince.set(province, median([...lats].sort((a, b) => a - b)));
  }

  const kept: T[] = [];
  const dropped: T[] = [];
  for (const r of rows) {
    const centre = medianByProvince.get(r.province_id);
    const offBand = centre !== undefined && Math.abs(parseFloat(r.lat) - centre) > MAX_PROVINCE_LAT_SPREAD_DEG;
    (known.has(r) || offBand ? dropped : kept).push(r);
  }
  return { kept, dropped };
}
