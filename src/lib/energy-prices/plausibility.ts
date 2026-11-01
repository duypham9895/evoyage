/**
 * Plausibility gate for upstream VND prices.
 *
 * The daily crawl (`scripts/crawl-energy-prices.ts`) auto-merges straight to
 * production with no human review (see docs/agents/automation-pat.md) — a
 * throw from a parser is what turns a wrong-but-present upstream value into a
 * blocked sync (source falls back to its previous value + the crawl exits 1)
 * instead of a silent bad deploy.
 *
 * Bounds are picked with headroom around real 2026 Vietnam prices, not tight
 * fences around today's exact numbers:
 *   - Fuel (VND/liter): real range is ~24,000–32,000 → bound (0, 100,000]
 *   - Electricity (VND/kWh): real range is ~2,000–4,000 → bound (0, 20,000]
 */
export interface PlausibleVndBounds {
  readonly min: number;
  readonly max: number;
}

export function assertPlausibleVnd(
  value: number,
  label: string,
  { min, max }: PlausibleVndBounds,
): void {
  if (!Number.isFinite(value) || value <= min || value > max) {
    throw new Error(
      `${label}: implausible VND value ${value} (expected a finite number in (${min}, ${max}])`,
    );
  }
}

export const FUEL_VND_PER_LITER_BOUNDS: PlausibleVndBounds = { min: 0, max: 100_000 };
export const ELECTRICITY_VND_PER_KWH_BOUNDS: PlausibleVndBounds = { min: 0, max: 20_000 };
