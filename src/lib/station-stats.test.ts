import { describe, it, expect } from 'vitest';
import {
  formatLastUpdated,
  formatStationCount,
  replaceStationsBlock,
  renderEnergyPricesBlock,
  replaceEnergyPricesBlock,
} from './station-stats';
import stationStats from '@/data/station-stats.json';

describe('formatStationCount', () => {
  it('formats with dot separator for vi locale', () => {
    expect(formatStationCount(18234, 'vi')).toBe('18.234');
  });

  it('formats with comma separator for en locale', () => {
    expect(formatStationCount(18234, 'en')).toBe('18,234');
  });

  it('handles numbers below 1,000 without separator', () => {
    expect(formatStationCount(0, 'en')).toBe('0');
    expect(formatStationCount(99, 'vi')).toBe('99');
  });

  it('handles seven-figure numbers', () => {
    expect(formatStationCount(1_234_567, 'en')).toBe('1,234,567');
    expect(formatStationCount(1_234_567, 'vi')).toBe('1.234.567');
  });
});

describe('replaceStationsBlock', () => {
  it('replaces a single marked block with formatted count + plus suffix', () => {
    const input = 'Stations: <!-- STATIONS_COUNT_START -->old value<!-- STATIONS_COUNT_END --> total.';
    expect(replaceStationsBlock(input, 18234)).toBe(
      'Stations: <!-- STATIONS_COUNT_START -->18,234+<!-- STATIONS_COUNT_END --> total.',
    );
  });

  it('replaces every occurrence of the marked block', () => {
    const input =
      '<!-- STATIONS_COUNT_START -->A<!-- STATIONS_COUNT_END --> and <!-- STATIONS_COUNT_START -->B<!-- STATIONS_COUNT_END -->';
    expect(replaceStationsBlock(input, 100)).toBe(
      '<!-- STATIONS_COUNT_START -->100+<!-- STATIONS_COUNT_END --> and <!-- STATIONS_COUNT_START -->100+<!-- STATIONS_COUNT_END -->',
    );
  });

  it('returns content unchanged when no markers are present', () => {
    expect(replaceStationsBlock('no markers here', 42)).toBe('no markers here');
  });

  it('replaces multiline content between markers', () => {
    const input = 'X <!-- STATIONS_COUNT_START -->\nold\nstuff\n<!-- STATIONS_COUNT_END --> Y';
    expect(replaceStationsBlock(input, 5)).toBe(
      'X <!-- STATIONS_COUNT_START -->5+<!-- STATIONS_COUNT_END --> Y',
    );
  });

  it('uses en-US thousand separator regardless of locale (READMEs are English)', () => {
    const input = '<!-- STATIONS_COUNT_START -->x<!-- STATIONS_COUNT_END -->';
    expect(replaceStationsBlock(input, 12345)).toContain('12,345+');
  });
});

describe('station-stats.json', () => {
  it('exposes a positive integer count and ISO lastUpdated', () => {
    expect(Number.isInteger(stationStats.count)).toBe(true);
    expect(stationStats.count).toBeGreaterThan(0);
    expect(typeof stationStats.lastUpdated).toBe('string');
    expect(() => new Date(stationStats.lastUpdated).toISOString()).not.toThrow();
  });
});

describe('formatLastUpdated', () => {
  const iso = '2026-05-01T00:00:00.000Z';

  it('returns a string that includes the four-digit year for en', () => {
    expect(formatLastUpdated(iso, 'en')).toMatch(/2026/);
  });

  it('returns a string that includes the four-digit year for vi', () => {
    expect(formatLastUpdated(iso, 'vi')).toMatch(/2026/);
  });

  it('uses an English month name for en locale', () => {
    expect(formatLastUpdated(iso, 'en').toLowerCase()).toContain('may');
  });

  it('uses a Vietnamese month token for vi locale', () => {
    // vi-VN long format includes "tháng" — drift-proof against ICU patch versions.
    expect(formatLastUpdated(iso, 'vi').toLowerCase()).toContain('tháng');
  });

  it('returns empty string for invalid timestamps without throwing', () => {
    expect(formatLastUpdated('not-a-date', 'en')).toBe('');
    expect(formatLastUpdated('', 'vi')).toBe('');
  });
});

describe('renderEnergyPricesBlock', () => {
  const prices = {
    gasolineVndPerLiter: 23750,
    dieselVndPerLiter: 28170,
    evnHomeVndPerKwh: 2998,
    vGreenVndPerKwh: 3858,
  };

  it('produces four bullet lines wrapped by the marker comments', () => {
    const out = renderEnergyPricesBlock(prices);
    expect(out.startsWith('<!-- ENERGY_PRICES_START -->')).toBe(true);
    expect(out.endsWith('<!-- ENERGY_PRICES_END -->')).toBe(true);
    const bullets = out.split('\n').filter((l) => l.trim().startsWith('- '));
    expect(bullets).toHaveLength(4);
  });

  it('formats VND with comma thousand-separators', () => {
    const out = renderEnergyPricesBlock(prices);
    expect(out).toContain('₫23,750');
    expect(out).toContain('₫28,170');
    expect(out).toContain('₫2,998');
    expect(out).toContain('₫3,858');
  });

  it('attributes each price to the correct authoritative source', () => {
    const out = renderEnergyPricesBlock(prices);
    expect(out).toContain('Petrolimex');
    expect(out).toContain('EVN tier 4');
    expect(out).toContain('V-GREEN');
    expect(out).toContain('free for VinFast owners until 2029');
  });
});

describe('replaceEnergyPricesBlock', () => {
  const prices = {
    gasolineVndPerLiter: 24000,
    dieselVndPerLiter: 28500,
    evnHomeVndPerKwh: 3050,
    vGreenVndPerKwh: 3858,
  };

  it('replaces a single existing block in place', () => {
    const before =
      'Intro\n<!-- ENERGY_PRICES_START -->\nold\n<!-- ENERGY_PRICES_END -->\nOutro';
    const after = replaceEnergyPricesBlock(before, prices);
    expect(after).toContain('Intro');
    expect(after).toContain('Outro');
    expect(after).toContain('₫24,000');
    expect(after).not.toContain('old');
  });

  it('returns content unchanged when no markers are present', () => {
    const before = 'no markers here';
    expect(replaceEnergyPricesBlock(before, prices)).toBe(before);
  });
});
