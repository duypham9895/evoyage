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
});
