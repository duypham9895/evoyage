import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEvnTariff, parseEvnDecisionDate } from './parse-evn';

const FIXTURE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../scripts/__fixtures__/energy-prices/evn-tariff.html',
);

const DECISIONS_FIXTURE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../scripts/__fixtures__/energy-prices/evn-decisions-vi.html',
);

describe('parseEvnTariff', () => {
  const html = readFileSync(FIXTURE, 'utf8');

  it('extracts six residential tiers in ascending order', () => {
    const result = parseEvnTariff(html);
    expect(result.tiers).toHaveLength(6);
    expect(result.tiers.map((t) => t.vndPerKwh)).toEqual([
      1984, 2050, 2380, 2998, 3350, 3460,
    ]);
  });

  it('captures the kWh consumption ranges for each tier', () => {
    const result = parseEvnTariff(html);
    expect(result.tiers[0]).toEqual({ minKwh: 0, maxKwh: 50, vndPerKwh: 1984 });
    expect(result.tiers[1]).toEqual({ minKwh: 51, maxKwh: 100, vndPerKwh: 2050 });
    expect(result.tiers[2]).toEqual({ minKwh: 101, maxKwh: 200, vndPerKwh: 2380 });
    expect(result.tiers[3]).toEqual({ minKwh: 201, maxKwh: 300, vndPerKwh: 2998 });
    expect(result.tiers[4]).toEqual({ minKwh: 301, maxKwh: 400, vndPerKwh: 3350 });
    expect(result.tiers[5]).toEqual({ minKwh: 401, maxKwh: null, vndPerKwh: 3460 });
  });

  it('exposes the representative tier for an EV-owning household (tier 4)', () => {
    const result = parseEvnTariff(html);
    expect(result.representativeTier).toBe(4);
    expect(result.representativeVndPerKwh).toBe(2998);
  });

  it('throws a descriptive error when no residential tier rows are found', () => {
    expect(() => parseEvnTariff('<html>no tariff here</html>')).toThrow(/EVN/i);
  });

  it('throws when fewer than 6 tiers are detected', () => {
    const partial =
      '<table><tr><td>For the kWh from 0 – 50</td><td>1,984</td></tr></table>';
    expect(() => parseEvnTariff(partial)).toThrow(/EVN/i);
  });
});

describe('parseEvnDecisionDate', () => {
  const html = readFileSync(DECISIONS_FIXTURE, 'utf8');

  it('extracts the latest MOIT decision date in ISO format', () => {
    expect(parseEvnDecisionDate(html)).toBe('2025-05-09');
  });

  it('parses 1-digit days and months (07/5/2025)', () => {
    const synthetic = '<p>Quyết định số 1279/QĐ-BCT ngày 09/5/2025 của Bộ Công Thương</p>';
    expect(parseEvnDecisionDate(synthetic)).toBe('2025-05-09');
  });

  it('prefers QĐ-BCT (regulator) over QĐ-EVN (utility) when both are present', () => {
    const synthetic = `
      <p>Quyết định số 599/QĐ-EVN ngày 07/5/2025</p>
      <p>Quyết định số 1279/QĐ-BCT ngày 09/5/2025</p>
    `;
    expect(parseEvnDecisionDate(synthetic)).toBe('2025-05-09');
  });

  it('returns null when no QĐ-BCT decision is found', () => {
    expect(parseEvnDecisionDate('<html>nothing here</html>')).toBeNull();
  });
});
