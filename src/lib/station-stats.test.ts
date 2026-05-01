import { describe, it, expect } from 'vitest';
import { formatStationCount, replaceStationsBlock } from './station-stats';
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
