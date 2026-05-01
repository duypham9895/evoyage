/**
 * Helpers for the auto-updated VinFast station count.
 *
 * The crawler writes `src/data/station-stats.json` after each successful run.
 * Consumers (landing page, README updater) read from that single source so we
 * never have a hardcoded number drift across the repo again.
 */

type Locale = 'vi' | 'en';

const LOCALE_BCP47: Record<Locale, string> = {
  vi: 'vi-VN',
  en: 'en-US',
};

export function formatStationCount(count: number, locale: Locale): string {
  return count.toLocaleString(LOCALE_BCP47[locale]);
}

export function formatLastUpdated(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(LOCALE_BCP47[locale], { dateStyle: 'long' }).format(date);
}

const STATIONS_BLOCK_RE =
  /<!-- STATIONS_COUNT_START -->[\s\S]*?<!-- STATIONS_COUNT_END -->/g;

export function replaceStationsBlock(content: string, count: number): string {
  const formatted = count.toLocaleString('en-US');
  return content.replace(
    STATIONS_BLOCK_RE,
    `<!-- STATIONS_COUNT_START -->${formatted}+<!-- STATIONS_COUNT_END -->`,
  );
}

const ENERGY_PRICES_BLOCK_RE =
  /<!-- ENERGY_PRICES_START -->[\s\S]*?<!-- ENERGY_PRICES_END -->/g;

export interface EnergyPricesReadmeBlock {
  readonly gasolineVndPerLiter: number;
  readonly dieselVndPerLiter: number;
  readonly evnHomeVndPerKwh: number;
  readonly vGreenVndPerKwh: number;
}

/**
 * Render the README "Live energy prices" block as four indented bullet lines.
 * Auto-rewritten daily by `scripts/update-readme-stats.ts`.
 */
export function renderEnergyPricesBlock(prices: EnergyPricesReadmeBlock): string {
  const fmt = (n: number) => n.toLocaleString('en-US');
  return [
    '<!-- ENERGY_PRICES_START -->',
    `  - Gasoline RON 95-III: ₫${fmt(prices.gasolineVndPerLiter)} / liter (Petrolimex)`,
    `  - Diesel DO 0,05S: ₫${fmt(prices.dieselVndPerLiter)} / liter (Petrolimex)`,
    `  - Electricity at home: ₫${fmt(prices.evnHomeVndPerKwh)} / kWh (EVN tier 4 · 201–300 kWh/month)`,
    `  - V-GREEN public charging: ₫${fmt(prices.vGreenVndPerKwh)} / kWh (free for VinFast owners until 2029)`,
    '<!-- ENERGY_PRICES_END -->',
  ].join('\n');
}

export function replaceEnergyPricesBlock(
  content: string,
  prices: EnergyPricesReadmeBlock,
): string {
  return content.replace(ENERGY_PRICES_BLOCK_RE, renderEnergyPricesBlock(prices));
}
