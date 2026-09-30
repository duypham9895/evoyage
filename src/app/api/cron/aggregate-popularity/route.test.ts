import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const aggregatePopularityMock = vi.fn();
const pruneStaleCachesMock = vi.fn();

// `@/lib/cron-auth` is deliberately NOT mocked: its own edge cases live in
// src/lib/cron-auth.test.ts, and what is untested here is that the real gate is
// wired in front of the jobs. The secret is supplied via the environment.
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/station/aggregate-popularity', () => ({
  aggregatePopularity: (...args: unknown[]) => aggregatePopularityMock(...args),
}));
vi.mock('@/lib/maintenance/prune-stale-caches', () => ({
  pruneStaleCaches: (...args: unknown[]) => pruneStaleCachesMock(...args),
}));

import { POST } from './route';

const SECRET = 'test-cron-secret-0123456789abcdef';
const ORIGINAL_SECRET = process.env.CRON_SECRET;

function makeRequestWith(authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization !== undefined) headers.set('authorization', authorization);
  return new NextRequest('http://localhost/api/cron/aggregate-popularity', {
    method: 'POST',
    headers,
  });
}

function makeRequest(): NextRequest {
  return makeRequestWith(`Bearer ${SECRET}`);
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
  aggregatePopularityMock.mockReset();
  pruneStaleCachesMock.mockReset();
  process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_SECRET;
  vi.restoreAllMocks();
});

describe('POST /api/cron/aggregate-popularity', () => {
  it('returns 401 without a valid cron secret', async () => {
    const res = await POST(makeRequestWith());

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

  it('returns 401 for a wrong secret', async () => {
    const res = await POST(makeRequestWith('Bearer not-the-secret'));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(aggregatePopularityMock).not.toHaveBeenCalled();
    expect(pruneStaleCachesMock).not.toHaveBeenCalled();
  });

  it('returns 401 when CRON_SECRET is not configured on the server', async () => {
    delete process.env.CRON_SECRET;
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(makeRequestWith('Bearer anything'));

    expect(res.status).toBe(401);
    expect(aggregatePopularityMock).not.toHaveBeenCalled();
    expect(pruneStaleCachesMock).not.toHaveBeenCalled();
  });

  it('passes the shared prisma client to both steps', async () => {
    aggregatePopularityMock.mockResolvedValue(popularityOk());
    pruneStaleCachesMock.mockResolvedValue(cachesOk());

    await POST(makeRequest());

    expect(aggregatePopularityMock).toHaveBeenCalledWith({ prisma: {} });
    expect(pruneStaleCachesMock).toHaveBeenCalledWith({ prisma: {} });
  });

  it('reports how long the job took', async () => {
    aggregatePopularityMock.mockResolvedValue(popularityOk());
    pruneStaleCachesMock.mockResolvedValue(cachesOk());

    const data = await (await POST(makeRequest())).json();

    expect(typeof data.durationMs).toBe('number');
    expect(data.durationMs).toBeGreaterThanOrEqual(0);
  });

  // The workflow greps the body, so a failure must still answer 200 and must
  // serialise the exact literal the grep looks for.
  it('still answers 200 and serialises the literal `"ok":false` on failure', async () => {
    aggregatePopularityMock.mockResolvedValue(popularityOk());
    pruneStaleCachesMock.mockResolvedValue(cachesOk(['RouteCache prune failed: lock timeout']));

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('"ok":false');
  });

  // `ok` is spread-then-overridden; if the spread ever moved after it, a failed
  // prune would be reported green.
  it('does not let the aggregation result overwrite the composed flag', async () => {
    aggregatePopularityMock.mockResolvedValue(popularityOk());
    pruneStaleCachesMock.mockResolvedValue(cachesOk(['boom']));

    const data = await (await POST(makeRequest())).json();

    expect(data.ok).toBe(false);
    expect(data.popularityRowsUpserted).toBe(5040);
  });

  it('propagates a throw from the aggregation instead of swallowing it', async () => {
    aggregatePopularityMock.mockRejectedValue(new Error('prisma is down'));

    await expect(POST(makeRequest())).rejects.toThrow('prisma is down');
  });

  it('propagates a throw from the retention prune instead of swallowing it', async () => {
    aggregatePopularityMock.mockResolvedValue(popularityOk());
    pruneStaleCachesMock.mockRejectedValue(new Error('prune exploded'));

    await expect(POST(makeRequest())).rejects.toThrow('prune exploded');
  });
});
