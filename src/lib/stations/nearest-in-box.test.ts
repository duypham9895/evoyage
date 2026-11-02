import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Prisma } from '@prisma/client';

vi.mock('@/lib/prisma', () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([]) },
}));

import { findStationsInBoxNearest } from './nearest-in-box';
import { prisma } from '@/lib/prisma';

const mockQueryRaw = vi.mocked(prisma.$queryRaw);

const BOX = { minLat: 10.7, maxLat: 10.8, minLng: 106.6, maxLng: 106.8 };
const CENTER = { lat: 10.75, lng: 106.7 };

function lastSql(): Prisma.Sql {
  return mockQueryRaw.mock.calls.at(-1)![0] as unknown as Prisma.Sql;
}

beforeEach(() => {
  mockQueryRaw.mockResolvedValue([] as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('findStationsInBoxNearest', () => {
  it('orders by distance from the centre before applying the limit', async () => {
    await findStationsInBoxNearest({ ...BOX, center: CENTER, limit: 500 });

    const { text, values } = lastSql();
    const orderAt = text.indexOf('ORDER BY POWER("latitude"');
    expect(orderAt).toBeGreaterThan(-1);
    expect(orderAt).toBeLessThan(text.indexOf('LIMIT'));
    expect(values).toEqual([10.7, 10.8, 106.6, 106.8, 10.75, 106.7, 10.75, 500]);
  });

  it('adds no vinFastOnly or provider clause when they are not given', async () => {
    await findStationsInBoxNearest({ ...BOX, center: CENTER, provider: null, limit: 500 });

    const { text } = lastSql();
    expect(text).not.toContain('"isVinFastOnly"');
    expect(text).not.toContain('"provider"');
  });

  it('filters on vinFastOnly=false (not dropped as falsy) and on provider', async () => {
    await findStationsInBoxNearest({ ...BOX, center: CENTER, vinFastOnly: false, provider: 'VinFast', limit: 500 });

    const { text, values } = lastSql();
    expect(text).toMatch(/"isVinFastOnly" = \$\d+/);
    expect(text).toMatch(/"provider" = \$\d+/);
    expect(values).toContain(false);
    expect(values).toContain('VinFast');
  });

  it('binds a hostile provider string as a parameter, never as SQL text', async () => {
    const hostile = `x'; DROP TABLE "ChargingStation"; --`;
    await findStationsInBoxNearest({ ...BOX, center: CENTER, provider: hostile, limit: 500 });

    const sql = lastSql();
    expect(sql.text).not.toContain('DROP TABLE');
    expect(sql.values).toContain(hostile);
  });

  it('returns the rows from the database unchanged', async () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    mockQueryRaw.mockResolvedValue(rows as never);

    await expect(findStationsInBoxNearest({ ...BOX, center: CENTER, limit: 500 })).resolves.toBe(rows);
  });
});
