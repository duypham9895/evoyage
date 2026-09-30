import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { ChargingStation, EVVehicle } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { POST, maxDuration } from './route';

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

async function postRoute(body: Record<string, unknown> = BODY) {
  const response = await POST(new NextRequest('http://localhost/api/route', {
    method: 'POST',
    body: JSON.stringify(body),
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
  delete process.env.MAPBOX_ACCESS_TOKEN;
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

// ── Station-ranking fixtures ──
// The mocked OSRM polyline is (10,106) → (10,107) → (10,108) ≈ 219km.
// VF 3 at 80% with a 0.80 safety factor reaches ~109km, so the corridor
// search window opens just past (10,107). A station at lng 107.05 sits
// on the route inside that window and becomes the only candidate.
const VF3_DB_ROW = {
  id: 'vf3',
  brand: 'VinFast',
  model: 'VF 3',
  variant: null,
  officialRangeKm: 210,
  batteryCapacityKwh: 18.64,
  chargingTimeDC_10to80_min: 36,
  dcMaxChargingPowerKw: 30,
} as unknown as EVVehicle;

const VF3_BODY = { ...BODY, vehicleId: 'vf3', customVehicle: null };

function corridorStation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'station-1',
    name: 'Corridor Station',
    address: 'QL1A',
    province: 'Đồng Nai',
    latitude: 10,
    longitude: 107.05,
    chargerTypes: '["DC"]',
    connectorTypes: '["CCS2"]',
    portCount: 4,
    maxPowerKw: 120,
    stationType: 'public',
    isVinFastOnly: false,
    operatingHours: null,
    provider: 'vinfast',
    chargingStatus: 'ACTIVE',
    parkingFee: false,
    ...overrides,
  } as unknown as ChargingStation;
}

describe('POST /api/route station selection', () => {
  beforeEach(() => {
    vi.mocked(prisma.eVVehicle.findUnique).mockResolvedValue(VF3_DB_ROW);
    vi.mocked(prisma.stationReliability.findMany).mockResolvedValue([]);
  });

  it('caps the charging estimate at the vehicle DC max, not the station power', async () => {
    findStationsMock.mockResolvedValueOnce([corridorStation({ maxPowerKw: 120 })]);

    const plan = await postRoute(VF3_BODY);

    // VF 3 accepts at most 30 kW DC. Charging 20% → 80% of its 18.64 kWh pack
    // is 11.184 kWh, which at 30 kW (with the 1.15 efficiency factor) takes
    // ~25.7 min. Uncapped at the station's 120 kW it would read ~6.4 min.
    expect(plan.chargingStops).toHaveLength(1);
    expect(plan.chargingStops[0].selected.estimatedChargeTimeMin).toBeCloseTo(25.7, 1);
  });

  it('never routes to a station that is OUTOFSERVICE', async () => {
    findStationsMock.mockResolvedValueOnce([corridorStation({ chargingStatus: 'OUTOFSERVICE' })]);

    const plan = await postRoute(VF3_BODY);

    expect(plan.chargingStops).toHaveLength(0);
    expect(findStationsMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { chargingStatus: { notIn: expect.arrayContaining(['OUTOFSERVICE']) } },
        ]),
      }),
    }));
  });
});

// ── Provider resilience ──
const MAPBOX_BODY = {
  ...BODY,
  provider: 'mapbox',
  startLat: 10,
  startLng: 106,
  endLat: 10,
  endLng: 108,
};

describe('POST /api/route provider resilience', () => {
  it('falls back to OSRM when the Mapbox Directions call fails', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'server-token';
    const { fetchDirectionsMapbox } = await import('@/lib/routing/mapbox-directions');
    const { fetchDirectionsFromCoords } = await import('@/lib/routing/osrm');
    vi.mocked(fetchDirectionsMapbox).mockRejectedValueOnce(
      new Error('Mapbox Directions API error: 503'),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const plan = await postRoute(MAPBOX_BODY);

    expect(fetchDirectionsFromCoords).toHaveBeenCalledWith(
      { lat: 10, lng: 106 },
      { lat: 10, lng: 108 },
      'A',
      'B',
    );
    expect(plan.error).toBeUndefined();
    expect(plan.totalDistanceKm).toBeCloseTo(220, 5);
    warn.mockRestore();
  });

  it('falls back to OSRM when MAPBOX_ACCESS_TOKEN is missing instead of returning 500', async () => {
    delete process.env.MAPBOX_ACCESS_TOKEN;
    const { fetchDirectionsMapbox } = await import('@/lib/routing/mapbox-directions');
    const { fetchDirectionsFromCoords } = await import('@/lib/routing/osrm');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const plan = await postRoute(MAPBOX_BODY);

    expect(fetchDirectionsMapbox).not.toHaveBeenCalled();
    expect(fetchDirectionsFromCoords).toHaveBeenCalled();
    expect(plan.error).toBeUndefined();
    expect(plan.totalDistanceKm).toBeCloseTo(220, 5);
    warn.mockRestore();
  });

  it('still uses Mapbox when the Mapbox call succeeds', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'server-token';
    const { fetchDirectionsMapbox } = await import('@/lib/routing/mapbox-directions');
    const { fetchDirectionsFromCoords } = await import('@/lib/routing/osrm');
    // Precision-6 encoding of the same (10,106) → (10,107) → (10,108) path.
    vi.mocked(fetchDirectionsMapbox).mockResolvedValueOnce({
      polyline: '_gjaR_gvdiE?_c`|@?_c`|@',
      distanceMeters: 220_000,
      durationSeconds: 10_800,
      startAddress: 'A',
      endAddress: 'B',
      startCoord: { lat: 10, lng: 106 },
      endCoord: { lat: 10, lng: 108 },
    });

    const plan = await postRoute(MAPBOX_BODY);

    expect(fetchDirectionsMapbox).toHaveBeenCalled();
    expect(fetchDirectionsFromCoords).not.toHaveBeenCalled();
    expect(plan.error).toBeUndefined();
  });
});

describe('POST /api/route platform budget', () => {
  it('declares a maxDuration longer than the client abort so the platform never truncates the response', () => {
    // src/app/plan/page.tsx aborts at TRIP_CALC_ABORT_MS = 25_000. Without an
    // explicit maxDuration the platform default kills the function first and
    // returns a non-JSON body.
    expect(maxDuration).toBeGreaterThan(25);
  });
});
