import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, retryAfterSec: 0 }),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
  vehiclesLimiter: null,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    eVVehicle: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

// ── Imports (after mocks) ──

import { GET } from './route';
import { checkRateLimit } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { VIETNAM_MODELS } from '@/lib/vietnam-models';

const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockFindUnique = vi.mocked(prisma.eVVehicle.findUnique);
const mockFindMany = vi.mocked(prisma.eVVehicle.findMany);

// ── Mock data ──

/** A row as Prisma returns it — every field the route's mapper reads. */
const DB_VEHICLE = {
  id: 'db-only-car',
  brand: 'Tesla',
  model: 'Model 3',
  variant: 'Long Range',
  modelYear: 2025,
  bodyType: 'Sedan',
  segment: 'D',
  seats: 5,
  doors: 4,
  batteryCapacityKwh: 82,
  usableBatteryKwh: 78,
  officialRangeKm: 600,
  rangeStandard: 'WLTP',
  efficiencyWhPerKm: 140,
  dcMaxChargingPowerKw: 250,
  acChargingPowerKw: 11,
  chargingTimeDC_10to80_min: 27,
  chargingPortType: 'CCS2',
  powerKw: 366,
  torqueNm: 493,
  driveType: 'AWD',
  acceleration0to100: 4.4,
  topSpeedKmh: 201,
  lengthMm: 4720,
  widthMm: 1849,
  heightMm: 1441,
  wheelbaseMm: 2875,
  weightKg: 1823,
  cargoVolumeLiters: 594,
  availableInVietnam: true,
  priceVndMillions: 1500,
  source: 'crawled',
  isUserAdded: false,
};

function makeRequest(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/vehicles${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, retryAfterSec: 0 });
  mockFindUnique.mockResolvedValue(null);
  mockFindMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/vehicles', () => {
  describe('rate limiting', () => {
    it('returns 429 with a Retry-After header when the limit is exceeded', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 17 });

      const res = await GET(makeRequest());

      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBe('17');
      expect((await res.json()).retryAfter).toBe(17);
    });

    it('does not query the database when rate-limited', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 17 });

      await GET(makeRequest('?id=vf3'));

      expect(mockFindUnique).not.toHaveBeenCalled();
      expect(mockFindMany).not.toHaveBeenCalled();
    });

    it('checks the limit against the vehicles bucket, keyed by IP', async () => {
      await GET(makeRequest());

      expect(mockCheckRateLimit).toHaveBeenCalledWith('vehicles:127.0.0.1', 30, 60_000, null);
    });
  });

  describe('single-vehicle lookup by id', () => {
    it('returns the DB row when one matches', async () => {
      mockFindUnique.mockResolvedValue(DB_VEHICLE as never);

      const res = await GET(makeRequest('?id=db-only-car'));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe('db-only-car');
      expect(data.brand).toBe('Tesla');
      expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: 'db-only-car' } });
    });

    it('falls back to the hardcoded models when the DB has no such row', async () => {
      mockFindUnique.mockResolvedValue(null);

      const res = await GET(makeRequest('?id=vf3'));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe('vf3');
      expect(data.brand).toBe('VinFast');
    });

    it('falls back to the hardcoded models when the DB query throws', async () => {
      mockFindUnique.mockRejectedValue(new Error('connection refused'));

      const res = await GET(makeRequest('?id=vf3'));

      expect(res.status).toBe(200);
      expect((await res.json()).id).toBe('vf3');
    });

    it('returns 404 when the id matches neither the DB nor the fallback', async () => {
      const res = await GET(makeRequest('?id=no-such-vehicle'));

      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe('Vehicle not found');
    });

    it('truncates an over-long id to 100 characters before querying', async () => {
      await GET(makeRequest(`?id=${'x'.repeat(250)}`));

      expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: 'x'.repeat(100) } });
    });
  });

  describe('list — data source', () => {
    it('returns the DB rows when the table is populated', async () => {
      mockFindMany.mockResolvedValue([DB_VEHICLE] as never);

      const res = await GET(makeRequest());

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.count).toBe(1);
      expect(data.vehicles[0].id).toBe('db-only-car');
    });

    it('falls back to the hardcoded models when the table is empty', async () => {
      mockFindMany.mockResolvedValue([]);

      const data = await (await GET(makeRequest())).json();

      expect(data.count).toBe(VIETNAM_MODELS.length);
    });

    it('falls back to the hardcoded models when the DB query throws', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFindMany.mockRejectedValue(new Error('connection refused'));

      const res = await GET(makeRequest());

      expect(res.status).toBe(200);
      expect((await res.json()).count).toBe(VIETNAM_MODELS.length);
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('list — filters', () => {
    it('returns only Vietnam-available vehicles by default', async () => {
      mockFindMany.mockResolvedValue([DB_VEHICLE, { ...DB_VEHICLE, id: 'abroad', availableInVietnam: false }] as never);

      const data = await (await GET(makeRequest())).json();

      expect(data.count).toBe(1);
      expect(data.vehicles[0].id).toBe('db-only-car');
    });

    it('includes vehicles unavailable in Vietnam when vietnamOnly=false', async () => {
      mockFindMany.mockResolvedValue([DB_VEHICLE, { ...DB_VEHICLE, id: 'abroad', availableInVietnam: false }] as never);

      const data = await (await GET(makeRequest('?vietnamOnly=false'))).json();

      expect(data.count).toBe(2);
    });

    it('filters by bodyType', async () => {
      const data = await (await GET(makeRequest('?bodyType=Hatchback'))).json();

      expect(data.count).toBeGreaterThan(0);
      expect(data.vehicles.every((v: { bodyType: string }) => v.bodyType === 'Hatchback')).toBe(true);
    });

    it('filters by brand', async () => {
      const data = await (await GET(makeRequest('?brand=BYD'))).json();

      expect(data.count).toBeGreaterThan(0);
      expect(data.vehicles.every((v: { brand: string }) => v.brand === 'BYD')).toBe(true);
    });

    it('filters by seat count', async () => {
      const data = await (await GET(makeRequest('?seats=4'))).json();

      expect(data.vehicles.every((v: { seats: number }) => v.seats === 4)).toBe(true);
    });

    it('filters by minimum official range', async () => {
      const data = await (await GET(makeRequest('?minRange=400'))).json();

      expect(data.vehicles.every((v: { officialRangeKm: number }) => v.officialRangeKm >= 400)).toBe(true);
    });

    it('searches brand, model and variant case-insensitively', async () => {
      const data = await (await GET(makeRequest('?q=dolphin'))).json();

      expect(data.count).toBe(1);
      expect(data.vehicles[0].model).toBe('Dolphin');
    });

    it('returns an empty list rather than an error when nothing matches', async () => {
      const res = await GET(makeRequest('?q=zzzznotacar'));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.count).toBe(0);
      expect(data.vehicles).toEqual([]);
    });

    it('combines filters', async () => {
      const data = await (await GET(makeRequest('?brand=VinFast&bodyType=SUV'))).json();

      expect(data.vehicles.every((v: { brand: string; bodyType: string }) =>
        v.brand === 'VinFast' && v.bodyType === 'SUV')).toBe(true);
    });
  });

  describe('list — parameter validation', () => {
    it.each([
      ['non-numeric', '?seats=many'],
      ['below range', '?seats=0'],
      ['above range', '?seats=21'],
    ])('returns 400 for a seats parameter that is %s', async (_label, query) => {
      const res = await GET(makeRequest(query));

      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/seats/i);
    });

    it.each([
      ['non-numeric', '?minRange=far'],
      ['negative', '?minRange=-1'],
      ['above range', '?minRange=2001'],
      ['infinite', '?minRange=Infinity'],
    ])('returns 400 for a minRange parameter that is %s', async (_label, query) => {
      const res = await GET(makeRequest(query));

      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/minRange/i);
    });

    it('accepts seats at the boundaries of the allowed range', async () => {
      expect((await GET(makeRequest('?seats=1'))).status).toBe(200);
      expect((await GET(makeRequest('?seats=20'))).status).toBe(200);
    });

    it('accepts minRange at the boundaries of the allowed range', async () => {
      expect((await GET(makeRequest('?minRange=0'))).status).toBe(200);
      expect((await GET(makeRequest('?minRange=2000'))).status).toBe(200);
    });
  });
});
