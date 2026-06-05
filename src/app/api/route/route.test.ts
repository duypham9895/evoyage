import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
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
    provider: 'osrm',
  }),
  fetchDirectionsFromCoords: vi.fn().mockResolvedValue({
    polyline: '_c`|@_c~eS?_ibE?_ibE',
    distanceMeters: 220_000,
    durationSeconds: 10_800,
    startAddress: 'A',
    endAddress: 'B',
    startCoord: { lat: 10, lng: 106 },
    endCoord: { lat: 10, lng: 108 },
    provider: 'osrm',
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

const findStationsMock = vi.mocked(prisma.chargingStation.findMany);

async function postRoute() {
  const response = await POST(new NextRequest('http://localhost/api/route', {
    method: 'POST',
    body: JSON.stringify(BODY),
    headers: { 'content-type': 'application/json' },
  }));
  return response.json();
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.PRECAUTIONARY_STOPS_ENABLED;
});

describe('POST /api/route precautionary-stop flag', () => {
  it('loads only station fields needed by route planning', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T02:00:00Z'));

    await postRoute();

    expect(findStationsMock).toHaveBeenCalledWith(expect.objectContaining({
      select: {
        id: true,
        name: true,
        address: true,
        province: true,
        latitude: true,
        longitude: true,
        chargerTypes: true,
        connectorTypes: true,
        portCount: true,
        maxPowerKw: true,
        stationType: true,
        isVinFastOnly: true,
        operatingHours: true,
        provider: true,
        chargingStatus: true,
        parkingFee: true,
      },
    }));
  });

  it('uses coordinate-first OSRM path when start and end coords are present', async () => {
    const { fetchDirections, fetchDirectionsFromCoords } = await import('@/lib/routing/osrm');

    await POST(new NextRequest('http://localhost/api/route', {
      method: 'POST',
      body: JSON.stringify({
        ...BODY,
        startLat: 10.7769,
        startLng: 106.7009,
        endLat: 11.9404,
        endLng: 108.4583,
      }),
      headers: { 'content-type': 'application/json' },
    }));

    expect(fetchDirectionsFromCoords).toHaveBeenCalledWith(
      { lat: 10.7769, lng: 106.7009 },
      { lat: 11.9404, lng: 108.4583 },
      'A',
      'B',
    );
    expect(fetchDirections).not.toHaveBeenCalled();
  });

  it('uses cached OSRM route when no waypoints are present', async () => {
    const { getCachedRoute } = await import('@/lib/routing/route-cache');
    const { fetchDirectionsFromCoords } = await import('@/lib/routing/osrm');
    vi.mocked(getCachedRoute).mockResolvedValueOnce({
      polyline: '_c`|@_c~eS?_ibE?_ibE',
      distanceMeters: 220_000,
      durationSeconds: 10_800,
    });

    await POST(new NextRequest('http://localhost/api/route', {
      method: 'POST',
      body: JSON.stringify({
        ...BODY,
        startLat: 10.7769,
        startLng: 106.7009,
        endLat: 11.9404,
        endLng: 108.4583,
      }),
      headers: { 'content-type': 'application/json' },
    }));

    expect(getCachedRoute).toHaveBeenCalledWith(10.7769, 106.7009, 11.9404, 108.4583, 'osrm');
    expect(fetchDirectionsFromCoords).not.toHaveBeenCalled();
  });

  it('keeps string geocoding fallback when OSRM coordinates are absent', async () => {
    const { fetchDirections, fetchDirectionsFromCoords } = await import('@/lib/routing/osrm');

    await postRoute();

    expect(fetchDirections).toHaveBeenCalledWith('A', 'B');
    expect(fetchDirectionsFromCoords).not.toHaveBeenCalled();
  });

  it('returns route stage timings outside production', async () => {
    const response = await POST(new NextRequest('http://localhost/api/route', {
      method: 'POST',
      body: JSON.stringify(BODY),
      headers: { 'content-type': 'application/json' },
    }));

    expect(response.headers.get('Server-Timing')).toEqual(expect.stringContaining('directionsMs;dur='));
    expect(response.headers.get('Server-Timing')).toEqual(expect.stringContaining('stationQueryMs;dur='));
    expect(response.headers.get('Server-Timing')).toEqual(expect.stringContaining('plannerMs;dur='));
  });

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
