import { describe, it, expect, vi } from 'vitest';
import {
  aggregatePopularity,
  type AggregatePopularityDeps,
} from './aggregate-popularity';

interface MockPrisma {
  $executeRaw: ReturnType<typeof vi.fn>;
}

function makePrismaMock(): MockPrisma {
  return {
    $executeRaw: vi.fn(),
  };
}

function makeDeps(prisma: MockPrisma): AggregatePopularityDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { prisma: prisma as any };
}

describe('aggregatePopularity', () => {
  it('returns ok with row counts on successful execution', async () => {
    const prisma = makePrismaMock();
    // 1st call: aggregation upsert affects 5040 rows (30 stations × 168 cells)
    // 2nd call: prune deletes 200 stale observations
    prisma.$executeRaw.mockResolvedValueOnce(5040).mockResolvedValueOnce(200);

    const result = await aggregatePopularity(makeDeps(prisma));

    expect(result.ok).toBe(true);
    expect(result.popularityRowsUpserted).toBe(5040);
    expect(result.observationsPruned).toBe(200);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('returns ok=false when aggregation SQL throws', async () => {
    const prisma = makePrismaMock();
    prisma.$executeRaw.mockRejectedValueOnce(new Error('relation does not exist'));

    const result = await aggregatePopularity(makeDeps(prisma));

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('aggregation');
    expect(result.popularityRowsUpserted).toBe(0);
  });

  it('still records aggregation success when prune fails', async () => {
    const prisma = makePrismaMock();
    prisma.$executeRaw
      .mockResolvedValueOnce(100) // aggregation succeeds
      .mockRejectedValueOnce(new Error('lock timeout')); // prune fails

    const result = await aggregatePopularity(makeDeps(prisma));

    // Aggregation succeeded — that's the critical operation
    expect(result.ok).toBe(true);
    expect(result.popularityRowsUpserted).toBe(100);
    expect(result.observationsPruned).toBe(0);
    expect(result.errors[0]).toContain('prune');
  });

  it('uses Asia/Ho_Chi_Minh timezone in the SQL', async () => {
    const prisma = makePrismaMock();
    prisma.$executeRaw.mockResolvedValue(0);

    await aggregatePopularity(makeDeps(prisma));

    // Verify the first call (aggregation) includes the VN timezone
    const firstCallArgs = prisma.$executeRaw.mock.calls[0]!;
    const sqlTemplate = firstCallArgs[0] as TemplateStringsArray;
    const fullSql = sqlTemplate.join('?');
    expect(fullSql).toContain('Asia/Ho_Chi_Minh');
  });

  it('prunes observations older than 90 days', async () => {
    const prisma = makePrismaMock();
    prisma.$executeRaw.mockResolvedValue(0);

    await aggregatePopularity(makeDeps(prisma));

    const pruneCallArgs = prisma.$executeRaw.mock.calls[1]!;
    const sqlTemplate = pruneCallArgs[0] as TemplateStringsArray;
    const fullSql = sqlTemplate.join('?');
    expect(fullSql).toContain("INTERVAL '90 days'");
    expect(fullSql).toContain('DELETE');
  });

  // BUG(p2-cron-silent-noops-and-observability): an empty 60-day observation window upserts 0 heatmap rows yet returns ok:true, so the workflow gate stays green. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p2-cron-silent-noops-and-observability.md
  it.fails('reports an unhealthy run when the 60-day window upserts zero heatmap rows', async () => {
    const prisma = makePrismaMock();
    // 1st call: aggregation upserts nothing (no observations in window)
    // 2nd call: observation prune deletes nothing
    prisma.$executeRaw.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    const result = await aggregatePopularity(makeDeps(prisma));

    expect(result.popularityRowsUpserted).toBe(0);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
