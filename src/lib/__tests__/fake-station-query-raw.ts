import type { Prisma } from '@prisma/client';

/**
 * Test-only fake of Postgres for the one raw query shape in
 * `src/lib/stations/nearest-in-box.ts`. It reads the `Prisma.Sql` text and
 * bound values, applies the lat/lng box and optional filters, orders by
 * distance ONLY when the SQL has that ORDER BY before the LIMIT, then applies
 * the LIMIT. Without the ORDER BY, rows come back in storage order, like a heap
 * scan. Keeps the dense-city regression tests honest after the move from
 * findMany to $queryRaw.
 */

export interface ParsedStationBoxQuery {
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLng: number;
  readonly maxLng: number;
  readonly vinFastOnly: boolean | undefined;
  readonly provider: string | undefined;
  /** Present only when the SQL orders by distance before LIMIT. */
  readonly center: { readonly lat: number; readonly lng: number } | undefined;
  readonly limit: number | undefined;
}

export function parseStationBoxQuery(query: Prisma.Sql): ParsedStationBoxQuery {
  const { text, values } = query;
  const param = (re: RegExp): unknown => {
    const m = text.match(re);
    return m ? values[Number(m[1]) - 1] : undefined;
  };
  const params = (re: RegExp): [unknown, unknown] | undefined => {
    const m = text.match(re);
    return m ? [values[Number(m[1]) - 1], values[Number(m[2]) - 1]] : undefined;
  };

  const lat = params(/"latitude" BETWEEN \$(\d+) AND \$(\d+)/);
  const lng = params(/"longitude" BETWEEN \$(\d+) AND \$(\d+)/);
  if (!lat || !lng) throw new Error(`fake: query has no lat/lng box: ${text}`);

  const order = text.match(
    /ORDER BY POWER\("latitude" - \$(\d+), 2\) \+ POWER\(\("longitude" - \$(\d+)\) \* COS\(RADIANS\(\$(\d+)\)\), 2\)/,
  );
  const limitAt = text.search(/LIMIT \$\d+/);
  const orderedBeforeLimit = order !== null && (limitAt === -1 || order.index! < limitAt);

  return {
    minLat: lat[0] as number,
    maxLat: lat[1] as number,
    minLng: lng[0] as number,
    maxLng: lng[1] as number,
    vinFastOnly: param(/"isVinFastOnly" = \$(\d+)/) as boolean | undefined,
    provider: param(/"provider" = \$(\d+)/) as string | undefined,
    center: orderedBeforeLimit
      ? { lat: values[Number(order![1]) - 1] as number, lng: values[Number(order![2]) - 1] as number }
      : undefined,
    limit: param(/LIMIT \$(\d+)/) as number | undefined,
  };
}

type FakeStationRow = {
  readonly latitude: number;
  readonly longitude: number;
  readonly isVinFastOnly?: boolean;
  readonly provider?: string;
};

export function fakeStationQueryRaw<T extends FakeStationRow>(rows: readonly T[]) {
  return async (query: Prisma.Sql): Promise<T[]> => {
    const q = parseStationBoxQuery(query);
    let out = rows.filter((r) =>
      r.latitude >= q.minLat && r.latitude <= q.maxLat
      && r.longitude >= q.minLng && r.longitude <= q.maxLng
      && (q.vinFastOnly === undefined || r.isVinFastOnly === q.vinFastOnly)
      && (q.provider === undefined || r.provider === q.provider));
    if (q.center) {
      const { lat, lng } = q.center;
      const cos = Math.cos((lat * Math.PI) / 180);
      const d = (r: T) => (r.latitude - lat) ** 2 + ((r.longitude - lng) * cos) ** 2;
      out = [...out].sort((a, b) => d(a) - d(b));
    }
    return q.limit === undefined ? out : out.slice(0, q.limit);
  };
}
