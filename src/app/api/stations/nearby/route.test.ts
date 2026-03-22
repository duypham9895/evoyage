import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { ChargingStationData } from '@/types';

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
    eVVehicle: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

// ── Imports (after mocks) ──

import { POST } from './route';
import { checkRateLimit } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';

const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockFindManyStations = vi.mocked(prisma.chargingStation.findMany);
const mockFindUniqueVehicle = vi.mocked(prisma.eVVehicle.findUnique);

// ── Mock Data ──

/** Station in District 1, HCMC — ~0.5 km from request center */
const STATION_DISTRICT_1: ChargingStationData = {
  id: 'station-d1',
  name: 'VinFast Charging - Nguyen Hue',
  address: '15 Nguyen Hue, Ben Nghe, Quan 1, TP.HCM',
  province: 'Ho Chi Minh',
  latitude: 10.7739,
  longitude: 106.7030,
  chargerTypes: ['DC'],
  connectorTypes: ['CCS2'],
  portCount: 4,
  maxPowerKw: 150,
  stationType: 'public',
  isVinFastOnly: true,
  operatingHours: '24/7',
  provider: 'VinFast',
  chargingStatus: 'available',
  parkingFee: false,
};

/** Station in District 3, HCMC — ~2.5 km from request center */
const STATION_DISTRICT_3: ChargingStationData = {
  id: 'station-d3',
  name: 'EverCharge - Vo Van Tan',
  address: '120 Vo Van Tan, Quan 3, TP.HCM',
  province: 'Ho Chi Minh',
  latitude: 10.7811,
  longitude: 106.6912,
  chargerTypes: ['DC', 'AC'],
  connectorTypes: ['CCS2', 'Type 2'],
  portCount: 6,
  maxPowerKw: 60,
  stationType: 'public',
  isVinFastOnly: false,
  operatingHours: '06:00-23:00',
  provider: 'EverCharge',
  chargingStatus: 'available',
  parkingFee: true,
};

/** Station far away — ~50 km from request center, should be excluded at small radius */
const STATION_FAR_AWAY: ChargingStationData = {
  id: 'station-far',
  name: 'VinFast Charging - Bien Hoa',
  address: '50 Pham Van Thuan, Bien Hoa, Dong Nai',
  province: 'Dong Nai',
  latitude: 10.9500,
  longitude: 106.8200,
  chargerTypes: ['DC'],
  connectorTypes: ['CCS2', 'CHAdeMO'],
  portCount: 8,
  maxPowerKw: 250,
  stationType: 'public',
  isVinFastOnly: true,
  operatingHours: '24/7',
  provider: 'VinFast',
  chargingStatus: 'available',
  parkingFee: false,
};

const MOCK_VF8_VEHICLE = {
  id: 'vf8-plus',
  brand: 'VinFast',
  batteryCapacityKwh: 87.7,
  dcMaxChargingPowerKw: 150,
};

// ── Request center: District 1, HCMC ──
const CENTER_LAT = 10.7769;
const CENTER_LNG = 106.7009;

// ── Helpers ──

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/stations/nearby', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Simulate Prisma returning raw DB rows (JSON fields as strings) */
function toPrismaRow(station: ChargingStationData) {
  return {
    ...station,
    chargerTypes: JSON.stringify(station.chargerTypes),
    connectorTypes: JSON.stringify(station.connectorTypes),
  };
}

// ── Tests ──

describe('POST /api/stations/nearby', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, retryAfterSec: 0 });
    mockFindManyStations.mockResolvedValue([]);
    mockFindUniqueVehicle.mockResolvedValue(null);
  });

  // D1: Valid request → returns sorted stations with distance
  it('returns stations sorted by distance with distanceKm', async () => {
    mockFindManyStations.mockResolvedValue([
      toPrismaRow(STATION_DISTRICT_3),
      toPrismaRow(STATION_DISTRICT_1),
    ] as never);

    const res = await POST(createRequest({
      latitude: CENTER_LAT,
      longitude: CENTER_LNG,
      radiusKm: 5,
    }));

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.count).toBe(2);
    expect(data.stations).toHaveLength(2);

    // Sorted by distance: District 1 is closer than District 3
    expect(data.stations[0].station.id).toBe('station-d1');
    expect(data.stations[1].station.id).toBe('station-d3');

    // Distance values are present and positive
    expect(data.stations[0].distanceKm).toBeGreaterThan(0);
    expect(data.stations[1].distanceKm).toBeGreaterThan(0);

    // Closer station has smaller distance
    expect(data.stations[0].distanceKm).toBeLessThan(data.stations[1].distanceKm);
  });

  // D2: With vehicleId → includes compatibility + charge time
  it('includes compatibility and charge time when vehicleId is provided', async () => {
    mockFindManyStations.mockResolvedValue([
      toPrismaRow(STATION_DISTRICT_1),
    ] as never);
    mockFindUniqueVehicle.mockResolvedValue(MOCK_VF8_VEHICLE as never);

    const res = await POST(createRequest({
      latitude: CENTER_LAT,
      longitude: CENTER_LNG,
      radiusKm: 5,
      vehicleId: 'vf8-plus',
      currentBattery: 30,
    }));

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.stations).toHaveLength(1);
    const result = data.stations[0];

    // VinFast vehicle is compatible with VinFast-only station
    expect(result.isCompatible).toBe(true);

    // Charge time should be calculated (battery 30% → 80%)
    expect(result.estimatedChargeTimeMin).toBeTypeOf('number');
    expect(result.estimatedChargeTimeMin).toBeGreaterThan(0);
  });

  // D3: Without vehicleId → stations only, no charge time
  it('returns stations without charge time when vehicleId is absent', async () => {
    mockFindManyStations.mockResolvedValue([
      toPrismaRow(STATION_DISTRICT_1),
      toPrismaRow(STATION_DISTRICT_3),
    ] as never);

    const res = await POST(createRequest({
      latitude: CENTER_LAT,
      longitude: CENTER_LNG,
      radiusKm: 5,
    }));

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.stations).toHaveLength(2);

    // No charge time when no vehicle specified
    for (const result of data.stations) {
      expect(result.estimatedChargeTimeMin).toBeNull();
    }

    // Vehicle lookup should not have been called
    expect(mockFindUniqueVehicle).not.toHaveBeenCalled();
  });

  // D4: Invalid coords → 400 error
  it('returns 400 for invalid coordinates', async () => {
    const res = await POST(createRequest({
      latitude: 999,
      longitude: -200,
      radiusKm: 5,
    }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid request');
    expect(data.details).toBeDefined();
  });

  // D5: Rate limited → 429 with Retry-After
  it('returns 429 with Retry-After when rate limited', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 45 });

    const res = await POST(createRequest({
      latitude: CENTER_LAT,
      longitude: CENTER_LNG,
      radiusKm: 5,
    }));

    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toContain('Too many requests');
    expect(data.retryAfter).toBe(45);
    expect(res.headers.get('Retry-After')).toBe('45');
  });

  // D6: Vehicle not found → returns stations without charge time
  it('returns stations without charge time when vehicleId is not found in DB', async () => {
    mockFindManyStations.mockResolvedValue([
      toPrismaRow(STATION_DISTRICT_1),
    ] as never);
    mockFindUniqueVehicle.mockResolvedValue(null);

    const res = await POST(createRequest({
      latitude: CENTER_LAT,
      longitude: CENTER_LNG,
      radiusKm: 5,
      vehicleId: 'nonexistent-vehicle',
      currentBattery: 50,
    }));

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.stations).toHaveLength(1);
    // No charge time when vehicle not found
    expect(data.stations[0].estimatedChargeTimeMin).toBeNull();
  });

  // D7: No stations in radius → empty array
  it('returns empty array when no stations are within radius', async () => {
    // Return stations from DB, but they are far away (beyond radiusKm)
    mockFindManyStations.mockResolvedValue([
      toPrismaRow(STATION_FAR_AWAY),
    ] as never);

    const res = await POST(createRequest({
      latitude: CENTER_LAT,
      longitude: CENTER_LNG,
      radiusKm: 2,
    }));

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.stations).toHaveLength(0);
    expect(data.count).toBe(0);
  });
});
