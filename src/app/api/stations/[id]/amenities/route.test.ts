import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, retryAfterSec: 0 }),
  getClientIp: vi.fn().mockReturnValue('203.0.113.7'),
  stationsLimiter: {},
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    chargingStation: { findUnique: vi.fn() },
    stationPois: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));

vi.mock('@/lib/station/overpass-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/station/overpass-client')>(
    '@/lib/station/overpass-client',
  );
  return {
    ...actual,
    queryNearbyPois: vi.fn(),
  };
});

// ── Imports (after mocks) ──

import { GET } from './route';
import { prisma } from '@/lib/prisma';
import { queryNearbyPois, OverpassError } from '@/lib/station/overpass-client';

const mockFindStation = vi.mocked(prisma.chargingStation.findUnique);
const mockFindCache = vi.mocked(prisma.stationPois.findUnique);
const mockUpsertCache = vi.mocked(prisma.stationPois.upsert);
const mockQueryOverpass = vi.mocked(queryNearbyPois);

const STATION_ID = 'cmolmt2522x8ea2j7';
const STATION = { latitude: 11.388681, longitude: 107.542488 };
const PARAMS = { params: Promise.resolve({ id: STATION_ID }) };

function buildRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/stations/${STATION_ID}/amenities`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindStation.mockResolvedValue(STATION as never);
  mockFindCache.mockResolvedValue(null);
  mockUpsertCache.mockResolvedValue({} as never);
});

describe('GET /api/stations/[id]/amenities — tiered radius', () => {
  it('returns 404 when station is unknown', async () => {
    mockFindStation.mockResolvedValueOnce(null);
    const res = await GET(buildRequest(), PARAMS);
    expect(res.status).toBe(404);
  });

  it('Stage 1 only: returns walk-tier rows when walking band has results, never queries drive band', async () => {
    mockQueryOverpass.mockResolvedValueOnce([
      {
        id: 1,
        lat: 11.3888,
        lng: 107.5426,
        name: 'Phở 24',
        amenity: 'restaurant',
        tags: {},
      },
    ]);

    const res = await GET(buildRequest(), PARAMS);
    const body = await res.json();

    expect(mockQueryOverpass).toHaveBeenCalledTimes(1);
    expect(mockQueryOverpass.mock.calls[0][0].radiusMeters).toBe(500);
    expect(body.fromCache).toBe(false);
    expect(body.pois).toHaveLength(1);
    expect(body.pois[0].tier).toBe('walk');
    expect(body.pois[0].drivingMinutes).toBeUndefined();
  });

  it('Stage 2 fires when walking band is empty: drive-tier rows have drivingMinutes label', async () => {
    // Stage 1 returns nothing within the 7-min round-trip walk
    mockQueryOverpass.mockResolvedValueOnce([]);
    // Stage 2 returns POIs at 1500m radius
    mockQueryOverpass.mockResolvedValueOnce([
      {
        id: 11,
        lat: 11.395, // ~700m away
        lng: 107.5421,
        name: 'Thung lũng xanh',
        amenity: 'restaurant',
        tags: {},
      },
      {
        id: 12,
        lat: 11.398, // further
        lng: 107.5421,
        name: 'Saigon Petro',
        amenity: 'fuel',
        tags: {},
      },
    ]);

    const res = await GET(buildRequest(), PARAMS);
    const body = await res.json();

    expect(mockQueryOverpass).toHaveBeenCalledTimes(2);
    expect(mockQueryOverpass.mock.calls[0][0].radiusMeters).toBe(500);
    expect(mockQueryOverpass.mock.calls[1][0].radiusMeters).toBe(1500);
    expect(body.pois).toHaveLength(2);
    expect(body.pois.every((p: { tier: string }) => p.tier === 'drive')).toBe(true);
    expect(body.pois[0].drivingMinutes).toBeGreaterThanOrEqual(1);
    expect(body.pois[1].drivingMinutes).toBeGreaterThanOrEqual(1);
  });

  it('persists results in the schema-versioned envelope', async () => {
    mockQueryOverpass.mockResolvedValueOnce([
      { id: 1, lat: 11.3888, lng: 107.5426, name: 'Cafe', amenity: 'cafe', tags: {} },
    ]);

    await GET(buildRequest(), PARAMS);

    expect(mockUpsertCache).toHaveBeenCalledTimes(1);
    const created = mockUpsertCache.mock.calls[0][0].create as { poisJson: string };
    const parsed = JSON.parse(created.poisJson);
    expect(parsed.schemaVersion).toBe(2);
    expect(Array.isArray(parsed.rows)).toBe(true);
  });

  it('treats v1 (bare-array) cached payload as a miss and refetches', async () => {
    // Pre-patch cache row: just the array, no envelope
    mockFindCache.mockResolvedValueOnce({
      stationId: STATION_ID,
      poisJson: JSON.stringify([{ id: 999, name: 'Stale', tier: 'walk' }]),
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 1_000_000),
    } as never);
    mockQueryOverpass.mockResolvedValueOnce([
      { id: 1, lat: 11.3888, lng: 107.5426, name: 'Fresh', amenity: 'restaurant', tags: {} },
    ]);

    const res = await GET(buildRequest(), PARAMS);
    const body = await res.json();

    expect(mockQueryOverpass).toHaveBeenCalled();
    expect(body.fromCache).toBe(false);
    expect(body.pois[0].name).toBe('Fresh');
  });

  it('serves a v2 cache hit without calling Overpass', async () => {
    mockFindCache.mockResolvedValueOnce({
      stationId: STATION_ID,
      poisJson: JSON.stringify({
        schemaVersion: 2,
        rows: [{ id: 5, name: 'Cached', tier: 'walk' }],
      }),
      fetchedAt: new Date('2026-05-01'),
      expiresAt: new Date(Date.now() + 1_000_000),
    } as never);

    const res = await GET(buildRequest(), PARAMS);
    const body = await res.json();

    expect(mockQueryOverpass).not.toHaveBeenCalled();
    expect(body.fromCache).toBe(true);
    expect(body.pois[0].name).toBe('Cached');
  });

  it('dedupes the "Ba phương 20k" / "ba phương 20k" duplicate before persisting', async () => {
    mockQueryOverpass.mockResolvedValueOnce([
      {
        id: 1,
        lat: 11.3888,
        lng: 107.5421,
        name: 'Ba phương 20k',
        amenity: 'restaurant',
        tags: {},
      },
      {
        id: 2,
        lat: 11.3888,
        lng: 107.5421,
        name: 'ba phương 20k',
        amenity: 'restaurant',
        tags: {},
      },
    ]);

    const res = await GET(buildRequest(), PARAMS);
    const body = await res.json();

    expect(body.pois).toHaveLength(1);
    expect(body.pois[0].id).toBe(1);
  });

  it('on Stage 1 Overpass failure with no cache, returns empty + error code', async () => {
    mockQueryOverpass.mockRejectedValueOnce(new OverpassError('rate_limited', 'rl', 429));

    const res = await GET(buildRequest(), PARAMS);
    const body = await res.json();

    expect(body.pois).toEqual([]);
    expect(body.error).toBe('rate_limited');
  });

  it('on Stage 2 Overpass failure, persists Stage 1 (empty) result without throwing', async () => {
    mockQueryOverpass.mockResolvedValueOnce([]); // Stage 1 empty
    mockQueryOverpass.mockRejectedValueOnce(new OverpassError('timeout', 'too slow'));

    const res = await GET(buildRequest(), PARAMS);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.pois).toEqual([]);
    expect(mockUpsertCache).toHaveBeenCalledTimes(1);
  });
});
