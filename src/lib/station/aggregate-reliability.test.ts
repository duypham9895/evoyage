import { describe, it, expect, vi } from 'vitest';
import {
  aggregateReliability,
  type AggregateReliabilityDeps,
} from './aggregate-reliability';

interface MockPrisma {
  $executeRaw: ReturnType<typeof vi.fn>;
}

function makePrismaMock(): MockPrisma {
  return {
    $executeRaw: vi.fn(),
  };
}

function makeDeps(prisma: MockPrisma): AggregateReliabilityDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { prisma: prisma as any };
}

describe('aggregateReliability', () => {
  it('returns ok with stationsUpserted count on success', async () => {
    const prisma = makePrismaMock();
    prisma.$executeRaw.mockResolvedValueOnce(150);

    const result = await aggregateReliability(makeDeps(prisma));

    expect(result.ok).toBe(true);
    expect(result.stationsUpserted).toBe(150);
  });

  it('returns ok=false with error message when SQL throws', async () => {
    const prisma = makePrismaMock();
    prisma.$executeRaw.mockRejectedValueOnce(new Error('relation does not exist'));

    const result = await aggregateReliability(makeDeps(prisma));

    expect(result.ok).toBe(false);
    expect(result.stationsUpserted).toBe(0);
    expect(result.errors[0]).toContain('aggregation failed');
    expect(result.errors[0]).toContain('relation does not exist');
  });

  it('uses a 30-day window in the SQL', async () => {
    const prisma = makePrismaMock();
    prisma.$executeRaw.mockResolvedValueOnce(0);

    await aggregateReliability(makeDeps(prisma));

    const callArgs = prisma.$executeRaw.mock.calls[0]!;
    const sqlTemplate = callArgs[0] as TemplateStringsArray;
    const fullSql = sqlTemplate.join('?');
    expect(fullSql).toContain("INTERVAL '30 days'");
  });

  it('counts ACTIVE and BUSY as up-time in the SQL', async () => {
    const prisma = makePrismaMock();
    prisma.$executeRaw.mockResolvedValueOnce(0);

    await aggregateReliability(makeDeps(prisma));

    const callArgs = prisma.$executeRaw.mock.calls[0]!;
    const sqlTemplate = callArgs[0] as TemplateStringsArray;
    const fullSql = sqlTemplate.join('?');
    expect(fullSql).toContain("'ACTIVE'");
    expect(fullSql).toContain("'BUSY'");
  });

  it('uses ON CONFLICT upsert keyed on stationId', async () => {
    const prisma = makePrismaMock();
    prisma.$executeRaw.mockResolvedValueOnce(0);

    await aggregateReliability(makeDeps(prisma));

    const callArgs = prisma.$executeRaw.mock.calls[0]!;
    const sqlTemplate = callArgs[0] as TemplateStringsArray;
    const fullSql = sqlTemplate.join('?');
    expect(fullSql).toContain('ON CONFLICT');
    expect(fullSql).toContain('"stationId"');
  });

  // BUG(p2-cron-silent-noops-and-observability): an empty 30-day observation window upserts 0 rows yet returns ok:true, so the workflow gate (grep "ok":false) stays green. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p2-cron-silent-noops-and-observability.md
  it.fails('reports an unhealthy run when the 30-day window upserts zero stations', async () => {
    const prisma = makePrismaMock();
    // 0 rows = no StationStatusObservation inside the window (poller stalled).
    prisma.$executeRaw.mockResolvedValue(0);

    const result = await aggregateReliability(makeDeps(prisma));

    expect(result.stationsUpserted).toBe(0);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
