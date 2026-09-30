import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const verifyCronSecretMock = vi.fn();
const aggregatePopularityMock = vi.fn();
const pruneStaleCachesMock = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/cron-auth', () => ({
  verifyCronSecret: (...args: unknown[]) => verifyCronSecretMock(...args),
}));
vi.mock('@/lib/station/aggregate-popularity', () => ({
  aggregatePopularity: (...args: unknown[]) => aggregatePopularityMock(...args),
}));
vi.mock('@/lib/maintenance/prune-stale-caches', () => ({
  pruneStaleCaches: (...args: unknown[]) => pruneStaleCachesMock(...args),
}));

import { POST } from './route';

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/cron/aggregate-popularity', {
    method: 'POST',
  });
}

function popularityOk(errors: string[] = []) {
  return { ok: true, popularityRowsUpserted: 5040, observationsPruned: 200, errors };
}

function cachesOk(errors: string[] = []) {
  return {
    ok: errors.length === 0,
    routeCachePruned: 42,
    vinfastDetailPruned: 17,
    shortUrlPruned: 3,
    statusReportPruned: 8,
    errors,
  };
}

beforeEach(() => {
  verifyCronSecretMock.mockReset().mockReturnValue(true);
  aggregatePopularityMock.mockReset();
  pruneStaleCachesMock.mockReset();
});

describe('POST /api/cron/aggregate-popularity', () => {
  it('returns 401 without a valid cron secret', async () => {
    verifyCronSecretMock.mockReturnValue(false);

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    expect(aggregatePopularityMock).not.toHaveBeenCalled();
    expect(pruneStaleCachesMock).not.toHaveBeenCalled();
  });

  it('reports ok=true with every prune count when all steps succeed', async () => {
    aggregatePopularityMock.mockResolvedValue(popularityOk());
    pruneStaleCachesMock.mockResolvedValue(cachesOk());

    const data = await (await POST(makeRequest())).json();

    expect(data.ok).toBe(true);
    expect(data.popularityRowsUpserted).toBe(5040);
    expect(data.routeCachePruned).toBe(42);
    expect(data.vinfastDetailPruned).toBe(17);
    expect(data.shortUrlPruned).toBe(3);
    expect(data.statusReportPruned).toBe(8);
    expect(data.cacheErrors).toEqual([]);
  });

  // The GHA workflow's only health gate is grep '"ok":false' on this body.
  it('reports ok=false when a retention prune fails', async () => {
    aggregatePopularityMock.mockResolvedValue(popularityOk());
    pruneStaleCachesMock.mockResolvedValue(cachesOk(['RouteCache prune failed: lock timeout']));

    const data = await (await POST(makeRequest())).json();

    expect(data.ok).toBe(false);
    expect(data.cacheErrors).toEqual(['RouteCache prune failed: lock timeout']);
  });

  it('reports ok=false when the observation prune inside the aggregation fails', async () => {
    aggregatePopularityMock.mockResolvedValue(popularityOk(['prune failed: lock timeout']));
    pruneStaleCachesMock.mockResolvedValue(cachesOk());

    const data = await (await POST(makeRequest())).json();

    expect(data.ok).toBe(false);
    expect(data.errors).toEqual(['prune failed: lock timeout']);
  });

  it('reports ok=false when the aggregation itself fails', async () => {
    aggregatePopularityMock.mockResolvedValue({
      ok: false,
      popularityRowsUpserted: 0,
      observationsPruned: 0,
      errors: ['aggregation failed: relation does not exist'],
    });
    pruneStaleCachesMock.mockResolvedValue(cachesOk());

    const data = await (await POST(makeRequest())).json();

    expect(data.ok).toBe(false);
  });

  it('still runs the retention prune when the aggregation fails', async () => {
    aggregatePopularityMock.mockResolvedValue({
      ok: false,
      popularityRowsUpserted: 0,
      observationsPruned: 0,
      errors: ['aggregation failed: relation does not exist'],
    });
    pruneStaleCachesMock.mockResolvedValue(cachesOk());

    await POST(makeRequest());

    expect(pruneStaleCachesMock).toHaveBeenCalledTimes(1);
  });
});
