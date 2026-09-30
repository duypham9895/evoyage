/**
 * Integration tests for POST /api/cron/poll-station-status.
 *
 * Complements `src/lib/cron-auth.test.ts` (the auth primitive in isolation) and
 * `src/lib/station/poll-status.test.ts` (the poller in isolation) by covering
 * only what the route owns: the auth gate is wired in front of the poller, the
 * poller gets its default deps built from the shared prisma client, and a
 * partial failure comes back as a 200 envelope rather than a 4xx/5xx — the
 * external cron service must not retry-storm.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const pollStationStatusMock = vi.fn();
const makeDefaultDepsMock = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma: { __brand: 'prisma' } }));
vi.mock('@/lib/station/poll-status', () => ({
  pollStationStatus: (...a: unknown[]) => pollStationStatusMock(...a),
  makeDefaultDeps: (...a: unknown[]) => makeDefaultDepsMock(...a),
}));

import { POST } from './route';

const SECRET = 'test-cron-secret-0123456789abcdef';
const ORIGINAL_SECRET = process.env.CRON_SECRET;

const DEPS = { deps: 'built' };
const OK_RESULT = {
  ok: true,
  stationsPolled: 310,
  observationsInserted: 12,
  errors: [] as string[],
};

function makeRequest(authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization !== undefined) headers.set('authorization', authorization);
  return new NextRequest('http://localhost/api/cron/poll-station-status', {
    method: 'POST',
    headers,
  });
}

const authorized = () => makeRequest(`Bearer ${SECRET}`);

beforeEach(() => {
  pollStationStatusMock.mockReset();
  makeDefaultDepsMock.mockReset();
  makeDefaultDepsMock.mockReturnValue(DEPS);
  pollStationStatusMock.mockResolvedValue(OK_RESULT);
  process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_SECRET;
  vi.restoreAllMocks();
});

describe('POST /api/cron/poll-station-status', () => {
  describe('authorised request', () => {
    it('runs the poller and returns its result with a duration', async () => {
      const res = await POST(authorized());

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toMatchObject({ ok: true, stationsPolled: 310, observationsInserted: 12 });
      expect(typeof data.durationMs).toBe('number');
      expect(data.durationMs).toBeGreaterThanOrEqual(0);
      expect(pollStationStatusMock).toHaveBeenCalledTimes(1);
    });

    it('builds the poller deps from the shared prisma client', async () => {
      await POST(authorized());

      expect(makeDefaultDepsMock).toHaveBeenCalledWith({ __brand: 'prisma' });
      expect(pollStationStatusMock).toHaveBeenCalledWith(DEPS);
    });
  });

  describe('rejects unauthorised callers before doing any work', () => {
    it('returns 401 when the Authorization header is missing', async () => {
      const res = await POST(makeRequest());

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
      expect(pollStationStatusMock).not.toHaveBeenCalled();
      expect(makeDefaultDepsMock).not.toHaveBeenCalled();
    });

    it('returns 401 for a wrong secret', async () => {
      const res = await POST(makeRequest('Bearer not-the-secret'));

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
      expect(pollStationStatusMock).not.toHaveBeenCalled();
      expect(makeDefaultDepsMock).not.toHaveBeenCalled();
    });

    it('returns 401 when CRON_SECRET is not configured on the server', async () => {
      delete process.env.CRON_SECRET;
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const res = await POST(makeRequest('Bearer anything'));

      expect(res.status).toBe(401);
      expect(pollStationStatusMock).not.toHaveBeenCalled();
    });
  });

  describe('surfaces poll failure instead of swallowing it', () => {
    it('answers 200 with ok=false and the failure reason, so the caller does not retry-storm', async () => {
      pollStationStatusMock.mockResolvedValue({
        ok: false,
        reason: 'cookies_expired',
        stationsPolled: 0,
        observationsInserted: 0,
        errors: ['VinFast returned 403'],
      });

      const res = await POST(authorized());

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        ok: false,
        reason: 'cookies_expired',
        errors: ['VinFast returned 403'],
      });
    });

    it('keeps the 200 envelope for a missing-cookies failure too', async () => {
      pollStationStatusMock.mockResolvedValue({
        ok: false,
        reason: 'cookies_missing',
        stationsPolled: 0,
        observationsInserted: 0,
        errors: [],
      });

      const res = await POST(authorized());

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({ ok: false, reason: 'cookies_missing' });
    });

    it('propagates a throw from the poller so the request fails loudly', async () => {
      pollStationStatusMock.mockRejectedValue(new Error('prisma is down'));

      await expect(POST(authorized())).rejects.toThrow('prisma is down');
    });
  });
});
