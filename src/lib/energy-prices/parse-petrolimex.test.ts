import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePetrolimexProducts } from './parse-petrolimex';

const FIXTURE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../scripts/__fixtures__/energy-prices/petrolimex.json',
);

describe('parsePetrolimexProducts', () => {
  const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
    products: ReadonlyArray<Record<string, unknown>>;
  };

  it('maps the seven Petrolimex products to canonical keys with Zone 1 prices', () => {
    const result = parsePetrolimexProducts(fixture.products);
    expect(Object.keys(result.products).sort()).toEqual([
      'do0001s',
      'do005s',
      'e10ron95iii',
      'e5ron92',
      'kerosene',
      'ron95iii',
      'ron95v',
    ]);
    expect(result.products.ron95v.vndPerLiter).toBe(24650);
    expect(result.products.ron95iii.vndPerLiter).toBe(23750);
    expect(result.products.do005s.vndPerLiter).toBe(28170);
    expect(result.products.do0001s.vndPerLiter).toBe(29430);
  });

  it('preserves the human-readable label for each product', () => {
    const result = parsePetrolimexProducts(fixture.products);
    expect(result.products.ron95iii.label).toBe('Xăng RON 95-III');
    expect(result.products.do005s.label).toBe('DO 0,05S-II');
  });

  it('uses the most recent LastModified across all products as effectiveAt', () => {
    const result = parsePetrolimexProducts(fixture.products);
    // Latest in fixture: RON 95-III at 2026-04-29T08:00:08.855Z
    expect(result.effectiveAt).toBe('2026-04-29T08:00:08.855Z');
  });

  describe('the 2026 E10 switch (live feed, 2026-10-31)', () => {
    const live = JSON.parse(
      readFileSync(resolve(dirname(FIXTURE), 'petrolimex-2026-10-31.json'), 'utf8'),
    ) as { products: ReadonlyArray<Record<string, unknown>> };

    it('uses E10 RON 95-III as the gasoline price when pure RON 95-III is gone', () => {
      const result = parsePetrolimexProducts(live.products);
      expect(result.products.ron95iii).toEqual({
        label: 'Xăng E10 RON 95-III',
        vndPerLiter: 24150,
      });
    });

    it('still reads diesel from the same feed instead of failing the whole source', () => {
      const result = parsePetrolimexProducts(live.products);
      expect(result.products.do005s.vndPerLiter).toBe(30240);
    });

    it('maps the renamed "E5 RON 92" title', () => {
      const result = parsePetrolimexProducts(live.products);
      expect(result.products.e5ron92.vndPerLiter).toBe(24220);
    });
  });

  it('prefers pure RON 95-III over E10 when the feed carries both', () => {
    const result = parsePetrolimexProducts(fixture.products);
    expect(result.products.ron95iii.label).toBe('Xăng RON 95-III');
    expect(result.products.ron95iii.vndPerLiter).toBe(23750);
  });

  it('throws when the products array is empty', () => {
    expect(() => parsePetrolimexProducts([])).toThrow(/Petrolimex/i);
  });

  it('throws when an expected product key is missing', () => {
    const partial = [
      {
        ID: 'x',
        Title: 'Xăng RON 95-V',
        EnglishTitle: 'RON 95-V',
        Zone1Price: 24650,
        Zone2Price: 25140,
        OrderIndex: 1,
        LastModified: '2026-04-29T07:58:55.702Z',
      },
    ];
    expect(() => parsePetrolimexProducts(partial)).toThrow(/Petrolimex/i);
  });

  it('skips unknown products gracefully (log-and-continue)', () => {
    const withUnknown = [
      ...fixture.products,
      {
        ID: 'mystery',
        Title: 'Mazút N',
        EnglishTitle: 'Mazut N',
        Zone1Price: 1,
        Zone2Price: 2,
        OrderIndex: 99,
        LastModified: '2026-04-29T08:00:08.855Z',
      },
    ];
    const result = parsePetrolimexProducts(withUnknown);
    expect(Object.keys(result.products)).toHaveLength(7);
    expect((result.products as Record<string, unknown>).mazut).toBeUndefined();
  });
});
