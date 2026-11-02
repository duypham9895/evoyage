import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// scripts/warm-station-pois.ts runs main() on import and is outside the vitest
// include glob, so it is exercised here (cross-cutting test location).
// Only external I/O is mocked: Prisma (DB) and the Overpass HTTP client.

const findMany = vi.fn();
const upsert = vi.fn();
const disconnect = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    chargingStation = { findMany };
    stationPois = { upsert };
    $disconnect = disconnect;
  },
}));

vi.mock('../station/overpass-client', async () => {
  const actual = await vi.importActual<typeof import('../station/overpass-client')>(
    '../station/overpass-client',
  );
  return { ...actual, queryNearbyPois: vi.fn() };
});

import { queryNearbyPois, OverpassError } from '../station/overpass-client';

const mockQuery = vi.mocked(queryNearbyPois);

// One station only, so the script's 3s politeness pause never runs.
const STATION = { id: 'st-1', name: 'Test station', latitude: 11.388681, longitude: 107.542488 };

async function runWarmer(): Promise<void> {
  vi.resetModules();
  await import('../../../scripts/warm-station-pois');
  await vi.waitFor(() => expect(disconnect).toHaveBeenCalled());
}

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([STATION]);
  upsert.mockResolvedValue({});
  disconnect.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('scripts/warm-station-pois.ts', () => {
  // BUG(p1-overpass-amenities-and-warm-pois): the warmer writes a bare v1 array that the amenities route treats as a cache miss, so warmed rows are useless and overwrite valid v2 rows. See docs/bugs/2026-11-01-p1-overpass-amenities-and-warm-pois.md
  it('writes poisJson in the route\'s schema-versioned envelope ({ schemaVersion: 2, rows[].tier })', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mockQuery.mockResolvedValueOnce([
      { id: 1, lat: 11.3888, lng: 107.5426, name: 'Cafe', amenity: 'cafe', tags: {} },
    ]);

    await runWarmer();

    expect(upsert).toHaveBeenCalledTimes(1);
    const created = upsert.mock.calls[0][0].create as { poisJson: string };
    const parsed = JSON.parse(created.poisJson);
    expect(Array.isArray(parsed)).toBe(false);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].tier).toBe('walk');
  });

  // BUG(p1-overpass-amenities-and-warm-pois): failures log only err.kind, so the CI log cannot show the HTTP status (e.g. 502 "at capacity"). See docs/bugs/2026-11-01-p1-overpass-amenities-and-warm-pois.md
  it('logs the Overpass HTTP status code when a station fails', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockQuery.mockRejectedValueOnce(
      new OverpassError('network_error', 'Overpass returned 502', 502),
    );

    await runWarmer();

    const logged = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).toContain('502');
  });
  it('stops cleanly at the 12-minute run budget and reports the stations it did not reach', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    findMany.mockResolvedValue([
      STATION,
      { ...STATION, id: 'st-2', name: 'Second' },
      { ...STATION, id: 'st-3', name: 'Third' },
    ]);
    const start = 1_800_000_000_000;
    const now = vi.spyOn(Date, 'now').mockReturnValue(start);
    mockQuery.mockImplementationOnce(async () => {
      // The first station eats the whole budget (e.g. timeouts + retries).
      now.mockReturnValue(start + 12 * 60 * 1000);
      return [{ id: 1, lat: 11.3888, lng: 107.5426, name: 'Cafe', amenity: 'cafe', tags: {} }];
    });

    await runWarmer();

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    const logged = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).toMatch(/budget/i);
    expect(logged).toContain('not reached 2');
  });

  it('caches a Stage 2 failure for 1h with a failure marker, not 30 days of "nothing nearby"', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mockQuery.mockResolvedValueOnce([]); // Stage 1 empty
    mockQuery.mockRejectedValueOnce(new OverpassError('timeout', 'too slow'));

    await runWarmer();

    const created = upsert.mock.calls[0][0].create as { poisJson: string; expiresAt: Date };
    expect(JSON.parse(created.poisJson).failure).toBe('timeout');
    expect(created.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(60 * 60 * 1000);
  });
});
