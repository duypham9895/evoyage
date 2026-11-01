/**
 * Regression tests for scripts/crawl-vinfast-stations.ts (daily VinFast crawl).
 *
 * The script runs main() on import and exports nothing, so these tests drive
 * the whole crawl with only its external I/O mocked: Prisma (DB), Playwright
 * (browser), the CDN locator fetch (network) and node:fs (stats file). The
 * assertions read what the crawl tried to write to the DB.
 *
 * Lives under src/lib/__tests__ because vitest.config.ts only includes
 * src/**\/*.test.ts; a colocated scripts/*.test.ts would never run.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VinfastLocatorRaw } from '@/lib/station/vinfast-api-client';

interface ExistingRow {
  readonly id: string;
  readonly ocmId: string;
  readonly entityId: string;
}

const state = vi.hoisted(() => ({
  feed: [] as unknown[],
  existing: [] as unknown[],
  rawCalls: [] as { sql: string; params: unknown[] }[],
  updateManyCalls: [] as unknown[],
  deleteManyCalls: [] as unknown[],
  taggedRawCalls: [] as unknown[],
  onDisconnect: () => {},
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    chargingStation = {
      findMany: async () => state.existing,
      updateMany: async (args: unknown) => {
        state.updateManyCalls.push(args);
        return { count: 0 };
      },
      deleteMany: async (args: unknown) => {
        state.deleteManyCalls.push(args);
        return { count: 0 };
      },
    };
    $executeRawUnsafe = async (sql: string, ...params: unknown[]) => {
      state.rawCalls.push({ sql, params });
      return 0;
    };
    $executeRaw = async (...args: unknown[]) => {
      state.taggedRawCalls.push(args);
      return 0;
    };
    $disconnect = async () => {
      state.onDisconnect();
    };
  },
}));

vi.mock('playwright', () => ({
  chromium: {
    launch: async () => ({
      newContext: async () => ({
        addInitScript: async () => {},
        newPage: async () => ({}),
        request: { get: async () => ({}) },
      }),
      close: async () => {},
    }),
  },
}));

vi.mock('@/lib/station/vinfast-cdn-locators', () => ({
  fetchVinfastCarChargingStationsFromCdn: async () => state.feed,
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: () => false, writeFileSync: () => {} };
});

// Column order of the bulk upsert params in scripts/crawl-vinfast-stations.ts.
const COLS_PER_ROW = 30;
const COL = { ocmId: 1, latitude: 5, longitude: 6, chargerTypes: 7, connectorTypes: 8, portCount: 9, maxPowerKw: 10 };

// Placeholder coordinate the VinFast feed sends for ~108 out-of-region rows (prod, 2026-11-01).
const PLACEHOLDER_LAT = '10.773106';
const PLACEHOLDER_LNG = '106.694794';

function row(storeId: string, overrides: Partial<VinfastLocatorRaw> = {}): VinfastLocatorRaw {
  return {
    bundle: 'charging_station',
    entity_id: `e-${storeId}`,
    store_id: storeId,
    code: `vfc_${storeId}`,
    name: `Station ${storeId}`,
    address: 'Quận 1, Hồ Chí Minh',
    lat: '10.780000',
    lng: '106.700000',
    hotline: '1900232389',
    province_id: '5072',
    category_name: 'Trạm sạc ô tô điện',
    category_slug: 'car_charging_station',
    marker_icon: '',
    charging_status: 'ACTIVE',
    ...overrides,
  };
}

async function runCrawl(feed: VinfastLocatorRaw[], existing: ExistingRow[] = []): Promise<void> {
  state.feed = feed;
  state.existing = existing;
  const done = new Promise<void>((resolve) => {
    state.onDisconnect = resolve;
  });
  vi.resetModules();
  await import('../../../scripts/crawl-vinfast-stations');
  await done;
  // A crashed crawl must not count as "bug reproduced" inside an it.fails.
  if (exitSpy.mock.calls.length > 0) throw new Error('HARNESS: crawl exited non-zero');
}

function stationUpsert(): { sql: string; rows: unknown[][] } {
  const call = state.rawCalls.find((c) => c.sql.includes('INSERT INTO "ChargingStation"'));
  if (!call) throw new Error('crawl made no ChargingStation upsert');
  const rows: unknown[][] = [];
  for (let i = 0; i < call.params.length; i += COLS_PER_ROW) {
    rows.push(call.params.slice(i, i + COLS_PER_ROW));
  }
  return { sql: call.sql, rows };
}

let exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  state.rawCalls = [];
  state.updateManyCalls = [];
  state.deleteManyCalls = [];
  state.taggedRawCalls = [];
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('crawl-vinfast-stations: harness sanity (passes today)', () => {
  it('upserts every in-feed station and exits cleanly', async () => {
    await runCrawl([row('C.HCM0001'), row('C.HCM0002')]);

    const ocmIds = stationUpsert().rows.map((r) => r[COL.ocmId]);
    expect(ocmIds).toEqual(['vinfast-C.HCM0001', 'vinfast-C.HCM0002']);
  });
});

describe('crawl-vinfast-stations: charger specs', () => {
  // BUG(p2-station-data-integrity): the feed carries no power data, yet every crawled station is stored as 150 kW / 4 ports. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p2-station-data-integrity.md
  it.fails('does not store a fabricated 150 kW / 4-port spec for a station whose feed row has no power data', async () => {
    await runCrawl([row('C.NQ0001', { name: 'Nhượng Quyền Bãi đỗ xe tư nhân' })]);

    const [stored] = stationUpsert().rows;
    expect(stored[COL.maxPowerKw]).not.toBe(150);
    expect(stored[COL.portCount]).not.toBe(4);
  });

  // BUG(p2-station-data-integrity): ON CONFLICT assigns EXCLUDED power/port/connector values, so each daily crawl wipes enriched specs. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p2-station-data-integrity.md
  it.fails('does not overwrite existing maxPowerKw / portCount / chargerTypes / connectorTypes on an existing station', async () => {
    await runCrawl([row('C.HCM0001')], [{ id: 'db-1', ocmId: 'vinfast-C.HCM0001', entityId: 'e-C.HCM0001' }]);

    // A plain `"col" = EXCLUDED."col"` assignment replaces whatever the DB held
    // (e.g. real specs from scripts/enrich-vinfast-detail.ts) with the
    // crawl's placeholder. COALESCE-with-existing or dropping the column from
    // the UPDATE list both satisfy this.
    const { sql } = stationUpsert();
    for (const col of ['maxPowerKw', 'portCount', 'chargerTypes', 'connectorTypes']) {
      expect(sql).not.toMatch(new RegExp(`"${col}"\\s*=\\s*EXCLUDED\\."${col}"\\s*,`));
    }
  });
});

describe('crawl-vinfast-stations: coordinate validation', () => {
  // BUG(p2-station-data-integrity): feed rows with Hanoi/Da Nang addresses share one placeholder coordinate in HCM District 1 and are stored as-is. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p2-station-data-integrity.md
  it.fails('does not upsert out-of-region stations stacked on the feed placeholder coordinate', async () => {
    const real = [row('C.HCM0001'), row('C.HCM0002', { lat: '10.790000', lng: '106.710000' })];
    // Same shape as prod: many distinct Hanoi stations (province_id 2483), all
    // at one HCM coordinate. Any of the detection signals in the fix direction
    // (known placeholder, coordinate shared by many rows, lat vs province_id
    // mismatch) catches these.
    const stacked = Array.from({ length: 10 }, (_, i) =>
      row(`C.HNO70${String(i).padStart(2, '0')}`, {
        name: `NQ Tư nhân ${i}`,
        address: 'Thanh Xuân, Hà Nội',
        province_id: '2483',
        lat: PLACEHOLDER_LAT,
        lng: PLACEHOLDER_LNG,
      }),
    );

    await runCrawl([...real, ...stacked]);

    const atPlaceholder = stationUpsert().rows.filter(
      (r) => r[COL.latitude] === Number(PLACEHOLDER_LAT) && r[COL.longitude] === Number(PLACEHOLDER_LNG),
    );
    expect(atPlaceholder).toEqual([]);
  });
});

describe('crawl-vinfast-stations: retiring stations that left the feed', () => {
  // BUG(p2-station-data-integrity): a VinFast station that drops out of the feed is never retired and stays routable with its last status. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p2-station-data-integrity.md
  it.fails('issues a retirement write for an existing VinFast station that is absent from a plausible feed', async () => {
    await runCrawl(
      [row('C.HCM0001'), row('C.HCM0002')],
      [
        { id: 'db-1', ocmId: 'vinfast-C.HCM0001', entityId: 'e-C.HCM0001' },
        { id: 'db-2', ocmId: 'vinfast-C.HCM0002', entityId: 'e-C.HCM0002' },
        { id: 'db-ghost', ocmId: 'vinfast-C.KHO0092', entityId: 'e-C.KHO0092' },
      ],
    );

    // Fix-agnostic: any DB write other than the two existing INSERT upserts
    // that targets the ghost row by id/ocmId, or selects stale rows by
    // scrapedAt, counts as a retirement step.
    const otherRawWrites = state.rawCalls.filter((c) => !/^\s*INSERT INTO/.test(c.sql));
    const writes = JSON.stringify([
      state.updateManyCalls,
      state.deleteManyCalls,
      state.taggedRawCalls,
      otherRawWrites,
    ]);
    expect(writes).toMatch(/db-ghost|vinfast-C\.KHO0092|scrapedAt/);
  });
});
