import { describe, it, expect } from 'vitest';
import { partitionPlaceholderCoordinates } from './placeholder-coordinates';

interface Row {
  readonly id: string;
  readonly lat: string;
  readonly lng: string;
  readonly province_id: string;
}

const HANOI = '2483';
const HCM = '5072';

function at(id: string, lat: number, lng: number, province_id: string): Row {
  return { id, lat: String(lat), lng: String(lng), province_id };
}

/** `n` stations spread around a real province centre. */
function province(prefix: string, n: number, lat: number, lng: number, province_id: string): Row[] {
  return Array.from({ length: n }, (_, i) => at(`${prefix}${i}`, lat + i * 0.01, lng + i * 0.01, province_id));
}

function ids(rows: readonly Row[]): string[] {
  return rows.map((r) => r.id);
}

describe('partitionPlaceholderCoordinates', () => {
  it('drops a row on the known feed placeholder coordinate, parsed from strings', () => {
    const rows = [...province('hcm', 5, 10.78, 106.7, HCM), { id: 'ph', lat: '10.773106', lng: '106.694794', province_id: HCM }];

    const { kept, dropped } = partitionPlaceholderCoordinates(rows);

    expect(ids(dropped)).toEqual(['ph']);
    expect(kept).toHaveLength(5);
  });

  it('keeps a row 1e-4 degrees away from the known placeholder (a real District 1 station)', () => {
    const rows = [at('near', 10.773206, 106.694794, HCM)];

    expect(ids(partitionPlaceholderCoordinates(rows).kept)).toEqual(['near']);
  });

  it('drops a row whose latitude is far from the rest of its province (moved placeholder)', () => {
    // Hà Nội is ~21.0 N; a Hà Nội row at an HCM latitude is a placeholder even
    // if VinFast changes the constant.
    const rows = [...province('hn', 6, 21.0, 105.8, HANOI), at('moved', 10.5, 106.6, HANOI)];

    const { kept, dropped } = partitionPlaceholderCoordinates(rows);

    expect(ids(dropped)).toEqual(['moved']);
    expect(kept).toHaveLength(6);
  });

  it('ignores known-placeholder rows when working out a province median', () => {
    // More placeholder rows than real ones must not drag the median south.
    const placeholders = Array.from({ length: 8 }, (_, i) => ({
      id: `ph${i}`,
      lat: '10.773106',
      lng: '106.694794',
      province_id: HANOI,
    }));
    const rows = [...province('hn', 5, 21.0, 105.8, HANOI), ...placeholders];

    const { kept, dropped } = partitionPlaceholderCoordinates(rows);

    expect(kept.map((r) => r.id)).toEqual(['hn0', 'hn1', 'hn2', 'hn3', 'hn4']);
    expect(dropped).toHaveLength(8);
  });

  it('keeps a province outlier when the province has too few rows to trust its median', () => {
    const rows = [...province('x', 3, 21.0, 105.8, '9999'), at('far', 12.0, 108.0, '9999')];

    expect(partitionPlaceholderCoordinates(rows).dropped).toEqual([]);
  });

  it('keeps rows within the province latitude band', () => {
    const rows = [...province('hn', 5, 21.0, 105.8, HANOI), at('edge', 21.0 + 2.9, 105.8, HANOI)];

    expect(partitionPlaceholderCoordinates(rows).dropped).toEqual([]);
  });

  it('does not apply the province rule to rows with no province_id', () => {
    const rows = [...province('np', 5, 21.0, 105.8, ''), at('south', 10.5, 106.6, '')];

    expect(partitionPlaceholderCoordinates(rows).dropped).toEqual([]);
  });

  it('returns empty partitions for an empty feed', () => {
    expect(partitionPlaceholderCoordinates([])).toEqual({ kept: [], dropped: [] });
  });
});
