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
