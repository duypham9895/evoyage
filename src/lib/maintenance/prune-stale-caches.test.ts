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

function sqlAt(prisma: MockPrisma, index: number): string {
  return (prisma.$executeRaw.mock.calls[index]![0] as TemplateStringsArray).join('?');
}

describe('pruneStaleCaches', () => {
  it('reports deleted row counts for every pruned table on success', async () => {
    const prisma = makePrismaMock();
    prisma.$executeRaw
      .mockResolvedValueOnce(42)
      .mockResolvedValueOnce(17)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(300)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(96);

    const result = await pruneStaleCaches(makeDeps(prisma));

    expect(result.ok).toBe(true);
    expect(result.routeCachePruned).toBe(42);
    expect(result.vinfastDetailPruned).toBe(17);
    expect(result.shortUrlPruned).toBe(4);
    expect(result.statusReportPruned).toBe(300);
    expect(result.reliabilityPruned).toBe(8);
    expect(result.popularityPruned).toBe(96);
    expect(result.errors).toEqual([]);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(6);
  });

  it('uses a 30-day window in both cache DELETE statements', async () => {
    const prisma = makePrismaMock();
    prisma.$executeRaw.mockResolvedValue(0);

    await pruneStaleCaches(makeDeps(prisma));

    const routeSql = sqlAt(prisma, 0);
    const detailSql = sqlAt(prisma, 1);
    expect(routeSql).toContain('RouteCache');
    expect(routeSql).toContain("INTERVAL '30 days'");
    expect(detailSql).toContain('VinFastStationDetail');
    expect(detailSql).toContain("INTERVAL '30 days'");
  });

  it('continues to the second prune even if the first fails', async () => {
    const prisma = makePrismaMock();
    prisma.$executeRaw
      .mockRejectedValueOnce(new Error('RouteCache lock timeout'))
      .mockResolvedValueOnce(9)
      .mockResolvedValue(0);

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
      .mockRejectedValueOnce(new Error('VinFastStationDetail constraint'))
      .mockResolvedValue(0);

    const result = await pruneStaleCaches(makeDeps(prisma));

    expect(result.ok).toBe(false);
    expect(result.routeCachePruned).toBe(5);
    expect(result.vinfastDetailPruned).toBe(0);
    expect(result.errors[0]).toContain('VinFastStationDetail prune failed');
  });

  // Retention beyond the two caches — see NEW-OPS-8. ShortUrl backs links people
  // may still be opening, so only rows the resolver already treats as dead may go.
  it('deletes only already-expired ShortUrl rows, never the NULL-expiry legacy ones', async () => {
    const prisma = makePrismaMock();
    prisma.$executeRaw.mockResolvedValue(0);

    await pruneStaleCaches(makeDeps(prisma));

    const shortUrlSql = sqlAt(prisma, 2);
    expect(shortUrlSql).toContain('ShortUrl');
    expect(shortUrlSql).toContain('"expiresAt" IS NOT NULL');
    expect(shortUrlSql).toContain("INTERVAL '30 days'");
    expect(shortUrlSql).not.toContain('createdAt');
  });

  it('prunes StationStatusReport rows older than 180 days', async () => {
    const prisma = makePrismaMock();
    prisma.$executeRaw.mockResolvedValue(0);

    await pruneStaleCaches(makeDeps(prisma));

    const reportSql = sqlAt(prisma, 3);
    expect(reportSql).toContain('StationStatusReport');
    expect(reportSql).toContain("INTERVAL '180 days'");
  });

  // Feedback is user-submitted correspondence, not a cache. Deliberately excluded.
  it('never deletes from Feedback', async () => {
    const prisma = makePrismaMock();
    prisma.$executeRaw.mockResolvedValue(0);

    await pruneStaleCaches(makeDeps(prisma));

    const allSql = prisma.$executeRaw.mock.calls
      .map((call) => (call[0] as TemplateStringsArray).join('?'))
      .join('\n');
    expect(allSql).not.toContain('Feedback');
  });

  it('reports ok=false and keeps going when the ShortUrl prune fails', async () => {
    const prisma = makePrismaMock();
    prisma.$executeRaw
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockRejectedValueOnce(new Error('ShortUrl statement timeout'))
      .mockResolvedValueOnce(7);

    const result = await pruneStaleCaches(makeDeps(prisma));

    expect(result.ok).toBe(false);
    expect(result.shortUrlPruned).toBe(0);
    expect(result.statusReportPruned).toBe(7);
    expect(result.errors[0]).toContain('ShortUrl prune failed');
  });

  it('reports ok=false when the StationStatusReport prune fails', async () => {
    const prisma = makePrismaMock();
    prisma.$executeRaw
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockRejectedValueOnce(new Error('StationStatusReport lock timeout'));

    const result = await pruneStaleCaches(makeDeps(prisma));

    expect(result.ok).toBe(false);
    expect(result.statusReportPruned).toBe(0);
    expect(result.errors[0]).toContain('StationStatusReport prune failed');
  });
  // StationReliability and StationPopularity are derived aggregates rebuilt
  // nightly — see NEW-OPS-7. A row whose station still exists must never be
  // deleted for age alone, or ADR-0007 ranking loses its input.
  it('prunes StationReliability rows whose station no longer exists', async () => {
    const prisma = makePrismaMock();
    prisma.$executeRaw.mockResolvedValue(0);

    await pruneStaleCaches(makeDeps(prisma));

    const sql = sqlAt(prisma, 4);
    expect(sql).toContain('StationReliability');
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('ChargingStation');
  });

  it('measures StationReliability staleness against the newest row, not wall-clock, so a stalled cron prunes nothing', async () => {
    const prisma = makePrismaMock();
    prisma.$executeRaw.mockResolvedValue(0);

    await pruneStaleCaches(makeDeps(prisma));

    const sql = sqlAt(prisma, 4);
    expect(sql).toContain('MAX("computedAt")');
    expect(sql).toContain("INTERVAL '60 days'");
    expect(sql).not.toContain('NOW()');
  });

  it('prunes StationPopularity rows whose station no longer exists', async () => {
    const prisma = makePrismaMock();
    prisma.$executeRaw.mockResolvedValue(0);

    await pruneStaleCaches(makeDeps(prisma));

    const sql = sqlAt(prisma, 5);
    expect(sql).toContain('StationPopularity');
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('ChargingStation');
  });

  it('measures StationPopularity staleness against the newest row, not wall-clock, so a stalled cron prunes nothing', async () => {
    const prisma = makePrismaMock();
    prisma.$executeRaw.mockResolvedValue(0);

    await pruneStaleCaches(makeDeps(prisma));

    const sql = sqlAt(prisma, 5);
    expect(sql).toContain('MAX("updatedAt")');
    expect(sql).toContain("INTERVAL '90 days'");
    expect(sql).not.toContain('NOW()');
  });

  it('reports ok=false and keeps going when the StationReliability prune fails', async () => {
    const prisma = makePrismaMock();
    prisma.$executeRaw
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockRejectedValueOnce(new Error('StationReliability lock timeout'))
      .mockResolvedValueOnce(5);

    const result = await pruneStaleCaches(makeDeps(prisma));

    expect(result.ok).toBe(false);
    expect(result.reliabilityPruned).toBe(0);
    expect(result.popularityPruned).toBe(5);
    expect(result.errors[0]).toContain('StationReliability prune failed');
  });

  it('reports ok=false when the StationPopularity prune fails', async () => {
    const prisma = makePrismaMock();
    prisma.$executeRaw
      .mockResolvedValue(0)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(5)
      .mockRejectedValueOnce(new Error('StationPopularity statement timeout'));

    const result = await pruneStaleCaches(makeDeps(prisma));

    expect(result.ok).toBe(false);
    expect(result.reliabilityPruned).toBe(5);
    expect(result.popularityPruned).toBe(0);
    expect(result.errors[0]).toContain('StationPopularity prune failed');
  });
});
