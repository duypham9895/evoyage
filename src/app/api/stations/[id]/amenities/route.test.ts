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

  // BUG(p1-overpass-amenities-and-warm-pois): a Stage 1 Overpass failure with no prior cache writes nothing, so every view of that station re-hits Overpass and waits again. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p1-overpass-amenities-and-warm-pois.md
  it('on Stage 1 Overpass failure with no cache, writes a short-TTL negative cache row', async () => {
    mockQueryOverpass.mockRejectedValueOnce(
      new OverpassError('network_error', 'Overpass returned 502', 502),
    );

    const before = Date.now();
    const res = await GET(buildRequest(), PARAMS);
    const body = await res.json();

    expect(body.pois).toEqual([]);
    expect(mockUpsertCache).toHaveBeenCalledTimes(1);
    const created = mockUpsertCache.mock.calls[0][0].create as { expiresAt: Date };
    const ttlMs = created.expiresAt.getTime() - before;
    // Short negative TTL: must expire in the future, but well before the 30-day success TTL.
    expect(ttlMs).toBeGreaterThan(0);
    expect(ttlMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });
  it('caps each interactive Overpass call at 8s with no retry (keeps the user wait small)', async () => {
    mockQueryOverpass.mockResolvedValueOnce([]); // Stage 1 empty → Stage 2 runs too
    mockQueryOverpass.mockResolvedValueOnce([]);

    await GET(buildRequest(), PARAMS);

    expect(mockQueryOverpass).toHaveBeenCalledTimes(2);
    for (const [opts] of mockQueryOverpass.mock.calls) {
      expect(opts).toMatchObject({ timeoutMs: 8_000, retries: 0 });
    }
  });

  it('marks the Stage 1 negative cache row as a failure (so it is not read as "nothing nearby")', async () => {
    mockQueryOverpass.mockRejectedValueOnce(new OverpassError('timeout', 'too slow'));

    const res = await GET(buildRequest(), PARAMS);
    const body = await res.json();

    expect(body.error).toBe('timeout');
    const created = mockUpsertCache.mock.calls[0][0].create as { poisJson: string; expiresAt: Date };
    const parsed = JSON.parse(created.poisJson);
    expect(parsed).toMatchObject({ schemaVersion: 2, rows: [], failure: 'timeout' });
    expect(created.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it('serves an unexpired failure row with its error and does not call Overpass', async () => {
    mockFindCache.mockResolvedValueOnce({
      stationId: STATION_ID,
      poisJson: JSON.stringify({ schemaVersion: 2, rows: [], failure: 'network_error' }),
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    } as never);

    const res = await GET(buildRequest(), PARAMS);
    const body = await res.json();

    expect(mockQueryOverpass).not.toHaveBeenCalled();
    expect(body.pois).toEqual([]);
    expect(body.fromCache).toBe(true);
    expect(body.error).toBe('network_error');
  });

  it('serves a successful empty cache row without an error (real "nothing nearby")', async () => {
    mockFindCache.mockResolvedValueOnce({
      stationId: STATION_ID,
      poisJson: JSON.stringify({ schemaVersion: 2, rows: [] }),
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 1_000_000),
    } as never);

    const res = await GET(buildRequest(), PARAMS);
    const body = await res.json();

    expect(body.pois).toEqual([]);
    expect(body.error).toBeUndefined();
  });

  it('on Stage 1 failure with an expired failure row, writes a fresh negative row (outage keeps being cached)', async () => {
    mockFindCache.mockResolvedValueOnce({
      stationId: STATION_ID,
      poisJson: JSON.stringify({ schemaVersion: 2, rows: [], failure: 'network_error' }),
      fetchedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() - 60 * 60 * 1000),
    } as never);
    mockQueryOverpass.mockRejectedValueOnce(new OverpassError('network_error', '502', 502));

    const res = await GET(buildRequest(), PARAMS);
    const body = await res.json();

    expect(body.error).toBe('network_error');
    expect(mockUpsertCache).toHaveBeenCalledTimes(1);
    const updated = mockUpsertCache.mock.calls[0][0].update as { expiresAt: Date };
    expect(updated.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('on Stage 1 failure with stale non-empty rows, serves them and does not overwrite the row', async () => {
    mockFindCache.mockResolvedValueOnce({
      stationId: STATION_ID,
      poisJson: JSON.stringify({ schemaVersion: 2, rows: [{ id: 5, name: 'Stale', tier: 'walk' }] }),
      fetchedAt: new Date('2026-05-01'),
      expiresAt: new Date(Date.now() - 1_000),
    } as never);
    mockQueryOverpass.mockRejectedValueOnce(new OverpassError('timeout', 'too slow'));

    const res = await GET(buildRequest(), PARAMS);
    const body = await res.json();

    expect(body.pois[0].name).toBe('Stale');
    expect(body.staleReason).toBe('timeout');
    expect(mockUpsertCache).not.toHaveBeenCalled();
  });

  it('on Stage 1 failure, a failed negative-cache write still returns 200 with the error', async () => {
    mockQueryOverpass.mockRejectedValueOnce(new OverpassError('timeout', 'too slow'));
    mockUpsertCache.mockRejectedValueOnce(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await GET(buildRequest(), PARAMS);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBe('timeout');
    vi.restoreAllMocks();
  });

  it('on Stage 2 failure, caches the empty result for 1h as a failure, not 30 days of "nothing nearby"', async () => {
    mockQueryOverpass.mockResolvedValueOnce([]); // Stage 1 empty
    mockQueryOverpass.mockRejectedValueOnce(new OverpassError('timeout', 'too slow'));

    const res = await GET(buildRequest(), PARAMS);
    const body = await res.json();

    expect(body.error).toBe('timeout');
    const created = mockUpsertCache.mock.calls[0][0].create as { poisJson: string; expiresAt: Date };
    expect(JSON.parse(created.poisJson).failure).toBe('timeout');
    expect(created.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it('a successful empty result is still cached for 30 days with no failure marker', async () => {
    mockQueryOverpass.mockResolvedValueOnce([]);
    mockQueryOverpass.mockResolvedValueOnce([]);

    const res = await GET(buildRequest(), PARAMS);
    const body = await res.json();

    expect(body.error).toBeUndefined();
    const created = mockUpsertCache.mock.calls[0][0].create as { poisJson: string; expiresAt: Date };
    expect(JSON.parse(created.poisJson).failure).toBeUndefined();
    expect(created.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
  });
});
