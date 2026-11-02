/**
 * Integration tests for POST /api/cron/aggregate-reliability.
 *
 * Complements `src/lib/cron-auth.test.ts` (the auth primitive in isolation) and
 * `src/lib/station/aggregate-reliability.test.ts` (the job in isolation) by
 * covering only what the route owns: the auth gate is wired in front of the
 * job, and the job's own failure envelope reaches the caller unaltered.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const aggregateReliabilityMock = vi.fn();
const checkObservationFreshnessMock = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/station/aggregate-reliability', () => ({
  aggregateReliability: (...a: unknown[]) => aggregateReliabilityMock(...a),
}));
vi.mock('@/lib/station/observation-freshness', () => ({
  checkObservationFreshness: (...a: unknown[]) => checkObservationFreshnessMock(...a),
}));

import { POST } from './route';

const SECRET = 'test-cron-secret-0123456789abcdef';
const ORIGINAL_SECRET = process.env.CRON_SECRET;

const OK_RESULT = { ok: true, stationsUpserted: 128, errors: [] as string[] };
const FRESH = { ok: true, lastObservedAt: new Date('2026-11-02T10:05:00Z'), ageHours: 2 };
const STALE = {
  ok: false,
  lastObservedAt: new Date('2026-09-30T12:19:00Z'),
  ageHours: 768,
  error: 'newest observation is 768h old, older than the 24h limit',
};

function makeRequest(authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization !== undefined) headers.set('authorization', authorization);
  return new NextRequest('http://localhost/api/cron/aggregate-reliability', {
    method: 'POST',
    headers,
  });
}

const authorized = () => makeRequest(`Bearer ${SECRET}`);

beforeEach(() => {
  aggregateReliabilityMock.mockReset();
  aggregateReliabilityMock.mockResolvedValue(OK_RESULT);
  checkObservationFreshnessMock.mockReset();
  checkObservationFreshnessMock.mockResolvedValue(FRESH);
  process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_SECRET;
  vi.restoreAllMocks();
});

describe('POST /api/cron/aggregate-reliability', () => {
  describe('authorised request', () => {
    it('runs the aggregation and returns its result with a duration', async () => {
      const res = await POST(authorized());

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toMatchObject({ ok: true, stationsUpserted: 128, errors: [] });
      expect(typeof data.durationMs).toBe('number');
      expect(data.durationMs).toBeGreaterThanOrEqual(0);
      expect(aggregateReliabilityMock).toHaveBeenCalledTimes(1);
    });

    it('passes the shared prisma client to the job', async () => {
      await POST(authorized());

      expect(aggregateReliabilityMock).toHaveBeenCalledWith({ prisma: {} });
    });
  });

  describe('rejects unauthorised callers before doing any work', () => {
    it('returns 401 when the Authorization header is missing', async () => {
      const res = await POST(makeRequest());

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
      expect(aggregateReliabilityMock).not.toHaveBeenCalled();
    });

    it('returns 401 for a wrong secret', async () => {
      const res = await POST(makeRequest('Bearer not-the-secret'));

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
      expect(aggregateReliabilityMock).not.toHaveBeenCalled();
    });

    it('returns 401 when CRON_SECRET is not configured on the server', async () => {
      delete process.env.CRON_SECRET;
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const res = await POST(makeRequest('Bearer anything'));

      expect(res.status).toBe(401);
      expect(aggregateReliabilityMock).not.toHaveBeenCalled();
    });
  });

  describe('surfaces job failure instead of swallowing it', () => {
    it('answers 200 but passes ok=false and the errors through to the body', async () => {
      // The sibling workflow greps the body for '"ok":false', so a failure must
      // survive the route verbatim rather than be normalised away.
      aggregateReliabilityMock.mockResolvedValue({
        ok: false,
        stationsUpserted: 0,
        errors: ['reliability upsert failed: deadlock detected'],
      });

      const res = await POST(authorized());

      expect(res.status).toBe(200);
      const body = await res.text();
      // The sibling workflow greps this literal, so assert the serialised form.
      expect(body).toContain('"ok":false');
      expect(JSON.parse(body)).toMatchObject({
        ok: false,
        stationsUpserted: 0,
        errors: ['reliability upsert failed: deadlock detected'],
      });
    });

    it('propagates a throw from the job so the request fails loudly', async () => {
      aggregateReliabilityMock.mockRejectedValue(new Error('prisma is down'));

      await expect(POST(authorized())).rejects.toThrow('prisma is down');
    });
  });

  // Finding A of docs/bugs/2026-11-01-p2-cron-silent-noops-and-observability.md.
  describe('observation freshness', () => {
    it('reports ok=false when the newest observation is stale, even if the upsert succeeded', async () => {
      checkObservationFreshnessMock.mockResolvedValue(STALE);

      const res = await POST(authorized());

      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('"ok":false');
      expect(JSON.parse(body)).toMatchObject({
        stationsUpserted: 128,
        freshness: { ok: false, ageHours: 768, error: STALE.error },
      });
      expect(aggregateReliabilityMock).toHaveBeenCalledTimes(1);
    });

    it('reports the freshness block alongside ok=true when observations are fresh', async () => {
      const data = await (await POST(authorized())).json();

      expect(data.ok).toBe(true);
      expect(data.freshness).toMatchObject({ ok: true, ageHours: 2 });
      expect(checkObservationFreshnessMock).toHaveBeenCalledWith({ prisma: {} });
    });

    it('keeps ok=false from the job when observations are fresh', async () => {
      aggregateReliabilityMock.mockResolvedValue({ ok: false, stationsUpserted: 0, errors: ['boom'] });

      const data = await (await POST(authorized())).json();

      expect(data.ok).toBe(false);
    });
  });
});
