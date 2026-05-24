import { describe, it, expect, vi } from 'vitest';
import {
  pruneStaleCaches,
  type PruneStaleCachesDeps,
} from './prune-stale-caches';

interface MockPrisma {
  $executeRaw: ReturnType<typeof vi.fn>;
}

function makePrismaMock(): MockPrisma {
  return { $executeRaw: vi.fn() };
}

function makeDeps(prisma: MockPrisma): PruneStaleCachesDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { prisma: prisma as any };
}

describe('pruneStaleCaches', () => {
  it('reports deleted row counts for both caches on success', async () => {
    const prisma = makePrismaMock();
    prisma.$executeRaw.mockResolvedValueOnce(42).mockResolvedValueOnce(17);

    const result = await pruneStaleCaches(makeDeps(prisma));

    expect(result.ok).toBe(true);
    expect(result.routeCachePruned).toBe(42);
    expect(result.vinfastDetailPruned).toBe(17);
    expect(result.errors).toEqual([]);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('uses a 30-day window in both DELETE statements', async () => {
    const prisma = makePrismaMock();
    prisma.$executeRaw.mockResolvedValue(0);

    await pruneStaleCaches(makeDeps(prisma));

    const routeSql = (prisma.$executeRaw.mock.calls[0]![0] as TemplateStringsArray).join('?');
    const detailSql = (prisma.$executeRaw.mock.calls[1]![0] as TemplateStringsArray).join('?');
    expect(routeSql).toContain('RouteCache');
    expect(routeSql).toContain("INTERVAL '30 days'");
    expect(detailSql).toContain('VinFastStationDetail');
    expect(detailSql).toContain("INTERVAL '30 days'");
  });

  it('continues to the second prune even if the first fails', async () => {
    const prisma = makePrismaMock();
    prisma.$executeRaw
      .mockRejectedValueOnce(new Error('RouteCache lock timeout'))
      .mockResolvedValueOnce(9);

    const result = await pruneStaleCaches(makeDeps(prisma));

    expect(result.ok).toBe(false);
    expect(result.routeCachePruned).toBe(0);
    expect(result.vinfastDetailPruned).toBe(9);
    expect(result.errors[0]).toContain('RouteCache prune failed');
  });

  it('returns ok=false when either prune fails', async () => {
    const prisma = makePrismaMock();
    prisma.$executeRaw
      .mockResolvedValueOnce(5)
      .mockRejectedValueOnce(new Error('VinFastStationDetail constraint'));

    const result = await pruneStaleCaches(makeDeps(prisma));

    expect(result.ok).toBe(false);
    expect(result.routeCachePruned).toBe(5);
    expect(result.vinfastDetailPruned).toBe(0);
    expect(result.errors[0]).toContain('VinFastStationDetail prune failed');
  });
});
