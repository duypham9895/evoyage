import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, retryAfterSec: 0 }),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
  stationsLimiter: null,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    chargingStation: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

// ── Imports (after mocks) ──

import { GET } from './route';
import { checkRateLimit } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';

const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockFindMany = vi.mocked(prisma.chargingStation.findMany);

// ── Mock data ──

/** Shape as stored by Prisma: chargerTypes/connectorTypes are JSON strings. */
const STATION_ROW = {
  id: 'station-1',
  name: 'VinFast Charging - Nguyen Hue',
  address: '15 Nguyen Hue, Quan 1, TP.HCM',
  province: 'Ho Chi Minh',
  latitude: 10.7739,
  longitude: 106.703,
  chargerTypes: '["DC"]',
  connectorTypes: '["CCS2"]',
  provider: 'VinFast',
  isVinFastOnly: true,
};

function makeRequest(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/stations${query}`);
}

/** The `where` object passed to the single findMany call. */
function whereOfLastCall(): Record<string, unknown> {
  const arg = mockFindMany.mock.calls.at(-1)![0] as { where: Record<string, unknown> };
  return arg.where;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, retryAfterSec: 0 });
  mockFindMany.mockResolvedValue([]);
});

describe('GET /api/stations', () => {
  describe('happy path', () => {
    it('returns 200 with the stations and a count', async () => {
      mockFindMany.mockResolvedValue([STATION_ROW] as never);

      const res = await GET(makeRequest());

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.count).toBe(1);
      expect(data.stations).toHaveLength(1);
      expect(data.stations[0].id).toBe('station-1');
    });

    it('parses the JSON string columns back into arrays', async () => {
      mockFindMany.mockResolvedValue([STATION_ROW] as never);

      const data = await (await GET(makeRequest())).json();

      expect(data.stations[0].chargerTypes).toEqual(['DC']);
      expect(data.stations[0].connectorTypes).toEqual(['CCS2']);
    });

    it('returns empty arrays rather than throwing on a corrupt JSON column', async () => {
      mockFindMany.mockResolvedValue([{ ...STATION_ROW, chargerTypes: 'not-json' }] as never);

      const res = await GET(makeRequest());

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.stations[0].chargerTypes).toEqual([]);
    });

    it('caps the result set at 500 rows and orders by name', async () => {
      await GET(makeRequest());

      const arg = mockFindMany.mock.calls[0]![0] as Record<string, unknown>;
      expect(arg.take).toBe(500);
      expect(arg.orderBy).toEqual({ name: 'asc' });
    });
  });

  describe('no-bounds case (must keep working — it is the documented default)', () => {
    it('queries with no geographic filter when `bounds` is absent', async () => {
      const res = await GET(makeRequest());

      expect(res.status).toBe(200);
      const where = whereOfLastCall();
      expect(where.latitude).toBeUndefined();
      expect(where.longitude).toBeUndefined();
    });

    it('treats an empty `bounds=` as absent rather than malformed', async () => {
      const res = await GET(makeRequest('?bounds='));

      expect(res.status).toBe(200);
      expect(whereOfLastCall().latitude).toBeUndefined();
    });
  });

  describe('bounds — well-formed', () => {
    it('applies a latitude/longitude range filter', async () => {
      const res = await GET(makeRequest('?bounds=10.7,106.6,10.8,106.8'));

      expect(res.status).toBe(200);
      const where = whereOfLastCall();
      expect(where.latitude).toEqual({ gte: 10.7, lte: 10.8 });
      expect(where.longitude).toEqual({ gte: 106.6, lte: 106.8 });
    });

    it('normalises a reversed box (max given before min)', async () => {
      await GET(makeRequest('?bounds=10.8,106.8,10.7,106.6'));

      const where = whereOfLastCall();
      expect(where.latitude).toEqual({ gte: 10.7, lte: 10.8 });
      expect(where.longitude).toEqual({ gte: 106.6, lte: 106.8 });
    });

    it('accepts negative coordinates', async () => {
      const res = await GET(makeRequest('?bounds=-10.8,-106.8,-10.7,-106.6'));

      expect(res.status).toBe(200);
      expect(whereOfLastCall().latitude).toEqual({ gte: -10.8, lte: -10.7 });
    });

    // Regression guard: these are the only two shapes the app actually sends.
    it('accepts the MapLocateButton viewport shape (±5 km box)', async () => {
      const lat = 10.7769;
      const lng = 106.7009;
      const deg = 5 / 80;
      const bounds = [lat - deg, lng - deg, lat + deg, lng + deg].join(',');

      const res = await GET(makeRequest(`?bounds=${bounds}`));

      expect(res.status).toBe(200);
      expect(whereOfLastCall().latitude).toBeDefined();
    });

    it('accepts the NearbyStations boundsFromRadius shape', async () => {
      const lat = 21.0278;
      const lng = 105.8342;
      const latDelta = 10 / 111;
      const lngDelta = 10 / (111 * Math.cos((lat * Math.PI) / 180));
      const bounds = `${lat - latDelta},${lng - lngDelta},${lat + latDelta},${lng + lngDelta}`;

      const res = await GET(makeRequest(`?bounds=${bounds}`));

      expect(res.status).toBe(200);
      expect(whereOfLastCall().longitude).toBeDefined();
    });
  });

  describe('bounds — malformed input is rejected, not silently ignored', () => {
    // Regression: the parse guard used to fall through to an unfiltered query,
    // so `?bounds=abc` answered 200 with up to 500 rows while
    // `?bounds=0,0,100,200` answered 400 — an inconsistent contract.
    it.each([
      ['non-numeric', '?bounds=abc'],
      ['too few parts', '?bounds=10.7,106.6'],
      ['single value', '?bounds=10.7'],
      ['one non-numeric part', '?bounds=10.7,106.6,10.8,foo'],
      ['too many parts', '?bounds=10.7,106.6,10.8,106.8,11.0'],
      ['empty parts', '?bounds=,,,'],
      ['whitespace only', '?bounds=%20'],
      ['infinite value', '?bounds=10.7,106.6,10.8,Infinity'],
    ])('returns 400 for %s', async (_label, query) => {
      const res = await GET(makeRequest(query));

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/bounds/i);
    });

    it('does not hit the database when bounds are malformed', async () => {
      await GET(makeRequest('?bounds=abc'));

      expect(mockFindMany).not.toHaveBeenCalled();
    });
  });

  describe('bounds — out of geographic range', () => {
    it('returns 400 when latitude exceeds ±90', async () => {
      const res = await GET(makeRequest('?bounds=-91,106.6,10.8,106.8'));

      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/-90 to 90/);
    });

    it('returns 400 when longitude exceeds ±180', async () => {
      const res = await GET(makeRequest('?bounds=10.7,-181,10.8,106.8'));

      expect(res.status).toBe(400);
    });

    it('does not hit the database when bounds are out of range', async () => {
      await GET(makeRequest('?bounds=0,0,100,200'));

      expect(mockFindMany).not.toHaveBeenCalled();
    });
  });

  describe('bounds — oversized box guard (prevents full table scans)', () => {
    it('returns 400 when the box is wider than 5° of latitude', async () => {
      const res = await GET(makeRequest('?bounds=10,106,16,106.5'));

      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/too large/i);
    });

    it('returns 400 when the box is wider than 5° of longitude', async () => {
      const res = await GET(makeRequest('?bounds=10,100,10.5,106'));

      expect(res.status).toBe(400);
    });

    it('accepts a box exactly at the 5° limit', async () => {
      const res = await GET(makeRequest('?bounds=10,106,15,111'));

      expect(res.status).toBe(200);
    });
  });

  describe('vinFastOnly filter', () => {
    it('filters to VinFast-only stations when "true"', async () => {
      await GET(makeRequest('?vinFastOnly=true'));

      expect(whereOfLastCall().isVinFastOnly).toBe(true);
    });

    it('filters to non-VinFast-only stations when "false"', async () => {
      await GET(makeRequest('?vinFastOnly=false'));

      expect(whereOfLastCall().isVinFastOnly).toBe(false);
    });

    it('ignores any other value', async () => {
      await GET(makeRequest('?vinFastOnly=maybe'));

      expect(whereOfLastCall().isVinFastOnly).toBeUndefined();
    });
  });

  describe('provider allowlist', () => {
    it('applies an allowlisted provider', async () => {
      await GET(makeRequest('?provider=VinFast'));

      expect(whereOfLastCall().provider).toBe('VinFast');
    });

    it('silently drops a provider outside the allowlist', async () => {
      const res = await GET(makeRequest('?provider=DROP%20TABLE'));

      expect(res.status).toBe(200);
      expect(whereOfLastCall().provider).toBeUndefined();
    });

    it('is case-sensitive — "vinfast" is not allowlisted', async () => {
      await GET(makeRequest('?provider=vinfast'));

      expect(whereOfLastCall().provider).toBeUndefined();
    });
  });

  describe('rate limiting', () => {
    it('returns 429 with a Retry-After header when the limit is exceeded', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 42 });

      const res = await GET(makeRequest());

      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBe('42');
      const data = await res.json();
      expect(data.retryAfter).toBe(42);
    });

    it('does not query the database when rate-limited', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 42 });

      await GET(makeRequest());

      expect(mockFindMany).not.toHaveBeenCalled();
    });

    it('checks the limit against the shared stations bucket, keyed by IP', async () => {
      await GET(makeRequest());

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        'stations:127.0.0.1',
        30,
        60_000,
        null,
      );
    });
  });
});
