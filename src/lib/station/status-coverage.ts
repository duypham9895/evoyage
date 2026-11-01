/**
 * Coverage guard for VinFast locator feeds that are expected to report
 * `charging_status` on (almost) every row.
 *
 * If upstream silently drops the field, both the hourly status poll
 * (scripts/poll-vinfast-station-status.ts) and the daily crawl's OUTOFSERVICE
 * partitioning (scripts/crawl-vinfast-stations.ts) would otherwise keep
 * running "successfully" while doing nothing — stale statuses never get
 * corrected. Live share on 2026-11-01 was 24,873 of 24,873 (100%); requiring
 * only half gives generous headroom for a legitimate partial rollout while
 * still catching a feed that drops the field entirely.
 */
export interface StatusCoverageRow {
  readonly charging_status?: string;
}

export function hasEnoughStatusCoverage(
  rows: readonly StatusCoverageRow[],
): boolean {
  const withStatus = rows.filter((row) => row.charging_status).length;
  return withStatus * 2 >= rows.length;
}
