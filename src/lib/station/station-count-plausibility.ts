/**
 * Plausibility gate for the VinFast station count written to
 * `src/data/station-stats.json` and surfaced in the public README.
 *
 * `scripts/crawl-vinfast-stations.ts` auto-merges straight to production with
 * no human review (see docs/agents/automation-pat.md) — a throw here is what
 * turns a truncated feed (e.g. 100 rows instead of ~24,800) into a blocked
 * sync (DB and stats file both untouched, crawl exits 1) instead of a silent
 * wrong public count. Same pattern as `assertPlausibleVnd`.
 *
 * Two checks:
 *   1. `next` must be a positive finite integer — catches zero, negative,
 *      NaN, Infinity, and fractional counts outright, with or without a
 *      `previous` to compare against.
 *   2. If `previous` is a positive number, `next` must be at least half of
 *      it. Legit daily changes are tiny (24,773 -> 24,774 on 2026-11-01); a
 *      halving in a single run means a broken feed, not real-world station
 *      removals. A missing or non-positive `previous` (first run, or a
 *      corrupt/missing stats file) skips this check — there is nothing
 *      trustworthy to compare against.
 */
export function assertPlausibleStationCount(next: number, previous: number | undefined): void {
  if (!Number.isInteger(next) || next <= 0) {
    throw new Error(
      `Implausible station count ${next} (expected a positive integer)`,
    );
  }

  if (typeof previous === 'number' && Number.isFinite(previous) && previous > 0) {
    if (next < previous * 0.5) {
      throw new Error(
        `Implausible station count ${next}: less than half of the previous count ${previous} ` +
          `(threshold: 50% — a legitimate daily change is tiny, a halving means a broken feed)`,
      );
    }
  }
}
