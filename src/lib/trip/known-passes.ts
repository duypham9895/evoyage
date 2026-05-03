/**
 * Static dataset of major Vietnamese mountain passes that materially
 * affect EV battery consumption.
 *
 * The Trust Intelligence layer surfaces these on the trip overview when
 * a route's polyline crosses any pass bbox. Drivers know "Đèo Bảo Lộc
 * tốn pin gấp đôi" — making it explicit on the summary builds trust.
 *
 * Per docs/specs/2026-05-03-trip-overview-timeline-design.md §6.5,
 * Decision: static dataset + polyline-intersection detection. NOT an
 * elevation API — VN's major passes are well-known and finite, so a
 * curated list achieves 90% of the value at zero infrastructure cost.
 *
 * Bbox values are first-pass estimates centered on the pass road segment.
 * Tune values after launch based on user reports of misses / false hits.
 *
 * `drainPercent` represents *additional* battery drain attributable to
 * the climb, on top of the flat-road baseline already in the trip planner.
 */

export interface VietnamPass {
  readonly id: string;
  readonly nameVi: string;
  readonly nameEn: string;
  /** Tight bbox: [latMin, latMax, lngMin, lngMax] */
  readonly bbox: readonly [number, number, number, number];
  readonly drainPercent: number;
}

export const KNOWN_VIETNAM_PASSES: readonly VietnamPass[] = [
  {
    id: 'bao-loc',
    nameVi: 'Đèo Bảo Lộc',
    nameEn: 'Bao Loc Pass',
    bbox: [11.4, 11.55, 107.75, 107.85],
    drainPercent: 15,
  },
  {
    id: 'khanh-le',
    nameVi: 'Đèo Khánh Lê',
    nameEn: 'Khanh Le Pass',
    bbox: [12.2, 12.35, 108.65, 108.85],
    drainPercent: 18,
  },
  {
    id: 'hai-van',
    nameVi: 'Đèo Hải Vân',
    nameEn: 'Hai Van Pass',
    bbox: [16.18, 16.25, 108.1, 108.2],
    drainPercent: 12,
  },
  {
    id: 'cu-mong',
    nameVi: 'Đèo Cù Mông',
    nameEn: 'Cu Mong Pass',
    bbox: [13.78, 13.85, 109.1, 109.2],
    drainPercent: 8,
  },
  {
    id: 'pha-din',
    nameVi: 'Đèo Pha Đin',
    nameEn: 'Pha Din Pass',
    bbox: [21.55, 21.65, 103.3, 103.45],
    drainPercent: 14,
  },
];
