import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    eVVehicle: { findUnique: vi.fn() },
    chargingStation: { findMany: vi.fn().mockResolvedValue([]) },
    stationReliability: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  getClientIp: vi.fn(() => '127.0.0.1'),
  routeLimiter: {},
}));

vi.mock('@/lib/routing/osrm', () => ({
  fetchDirections: vi.fn().mockResolvedValue({
    polyline: '_c`|@_c~eS?_ibE?_ibE',
    distanceMeters: 220_000,
    durationSeconds: 10_800,
    startAddress: 'A',
    endAddress: 'B',
    startCoord: { lat: 10, lng: 106 },
    endCoord: { lat: 10, lng: 108 },
  }),
  fetchDirectionsWithWaypoints: vi.fn(),
}));

vi.mock('@/lib/routing/mapbox-directions', () => ({
  fetchDirectionsMapbox: vi.fn(),
}));

vi.mock('@/lib/routing/mapbox-traffic', () => ({
  fetchTrafficAwareDirections: vi.fn(),
  MapboxTrafficError: class MapboxTrafficError extends Error {
    kind = 'network';
    statusCode = 500;
  },
}));

vi.mock('@/lib/routing/route-cache', () => ({
  getCachedRoute: vi.fn().mockResolvedValue(null),
  setCachedRoute: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/station/popularity-query', () => ({
  queryStationPopularity: vi.fn().mockResolvedValue({ kind: 'insufficient-data' }),
}));

vi.mock('@/lib/analytics', () => ({
  trackReliabilityCalibration: vi.fn(),
}));

const BODY = {
  start: 'A',
  end: 'B',
  vehicleId: null,
  customVehicle: {
    brand: 'VinFast',
    model: 'VF 8',
    batteryCapacityKwh: 87.7,
    officialRangeKm: 471,
    chargingTimeDC_10to80_min: 31,
  },
  currentBatteryPercent: 80,
  minArrivalPercent: 15,
  rangeSafetyFactor: 0.80,
  provider: 'osrm',
};

async function postRoute() {
  const response = await POST(new NextRequest('http://localhost/api/route', {
    method: 'POST',
    body: JSON.stringify(BODY),
    headers: { 'content-type': 'application/json' },
  }));
  return response.json();
}

afterEach(() => {
  vi.useRealTimers();
  delete process.env.PRECAUTIONARY_STOPS_ENABLED;
});

describe('POST /api/route precautionary-stop flag', () => {
  it('returns byte-identical JSON when PRECAUTIONARY_STOPS_ENABLED is unset or false', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T02:00:00Z'));

    delete process.env.PRECAUTIONARY_STOPS_ENABLED;
    const unset = await postRoute();

    process.env.PRECAUTIONARY_STOPS_ENABLED = 'false';
    const explicitFalse = await postRoute();

    expect(JSON.stringify(explicitFalse)).toBe(JSON.stringify(unset));
  });
});
