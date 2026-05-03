import { describe, it, expect, vi } from 'vitest';
import { pollStationStatus, type PollStatusDeps } from './poll-status';
import type { VinfastLocatorRaw, VinfastCookie } from './vinfast-api-client';
import { VinfastApiError } from './vinfast-api-client';

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 1000);

const COOKIES: readonly VinfastCookie[] = [
  { name: 'cf', value: 'x', domain: '.x.com', path: '/' },
];

function makeStation(overrides: Partial<VinfastLocatorRaw> = {}): VinfastLocatorRaw {
  return {
    entity_id: 'ent-1',
    store_id: 'store-1',
    code: 'vfc_HCM0001',
    name: 'Test',
    address: 'X',
    lat: '10.7',
    lng: '106.7',
    hotline: '',
    province_id: '',
    access_type: 'Public',
    party_id: 'VFC',
    charging_publish: true,
    charging_status: 'ACTIVE',
    category_name: '',
    category_slug: 'car_charging_station',
    hotline_xdv: '',
    open_time_service: '00:00',
    close_time_service: '23:59',
    parking_fee: false,
    has_link: true,
    marker_icon: '',
    ...overrides,
  };
}

interface MockPrisma {
  vinfastApiCookies: { findFirst: ReturnType<typeof vi.fn> };
  chargingStation: { findMany: ReturnType<typeof vi.fn> };
  stationStatusObservation: { createMany: ReturnType<typeof vi.fn> };
  $queryRaw: ReturnType<typeof vi.fn>;
}

function makePrismaMock(): MockPrisma {
  return {
    vinfastApiCookies: { findFirst: vi.fn() },
    chargingStation: { findMany: vi.fn().mockResolvedValue([]) },
    stationStatusObservation: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
}

function makeDeps(overrides: Partial<PollStatusDeps> = {}): PollStatusDeps {
  const prisma = makePrismaMock();
  const fetchLocators = vi.fn().mockResolvedValue([]);
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma: prisma as any,
    fetchLocators,
    ...overrides,
  };
}

describe('pollStationStatus', () => {
  it('returns cookies_missing when no row exists in VinfastApiCookies', async () => {
    const prisma = makePrismaMock();
    prisma.vinfastApiCookies.findFirst.mockResolvedValue(null);

    const result = await pollStationStatus(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeDeps({ prisma: prisma as any }),
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('cookies_missing');
    expect(result.stationsPolled).toBe(0);
  });

  it('returns cookies_expired when latest cookie row is past expiry', async () => {
    const prisma = makePrismaMock();
    prisma.vinfastApiCookies.findFirst.mockResolvedValue({
      id: 1,
      cookieJson: JSON.stringify(COOKIES),
      refreshedAt: PAST,
      expiresAt: PAST,
    });

    const result = await pollStationStatus(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeDeps({ prisma: prisma as any }),
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('cookies_expired');
  });

  it('inserts observation when station status differs from prior observation', async () => {
    const prisma = makePrismaMock();
    prisma.vinfastApiCookies.findFirst.mockResolvedValue({
      id: 1,
      cookieJson: JSON.stringify(COOKIES),
      refreshedAt: new Date(),
      expiresAt: FUTURE,
    });
    prisma.chargingStation.findMany.mockResolvedValue([
      { id: 'db-1', entityId: 'ent-1', storeId: 'store-1', ocmId: 'vinfast-store-1' },
    ]);
    prisma.$queryRaw.mockResolvedValue([
      { station_id: 'db-1', status: 'BUSY' },
    ]);

    const result = await pollStationStatus(
      makeDeps({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prisma: prisma as any,
        fetchLocators: vi.fn().mockResolvedValue([
          makeStation({ entity_id: 'ent-1', charging_status: 'ACTIVE' }),
        ]),
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.stationsPolled).toBe(1);
    expect(result.observationsInserted).toBe(1);
    expect(prisma.stationStatusObservation.createMany).toHaveBeenCalledWith({
      data: [{ stationId: 'db-1', status: 'ACTIVE' }],
    });
  });

  it('skips insertion when status matches prior observation (dedup)', async () => {
    const prisma = makePrismaMock();
    prisma.vinfastApiCookies.findFirst.mockResolvedValue({
      id: 1,
      cookieJson: JSON.stringify(COOKIES),
      refreshedAt: new Date(),
      expiresAt: FUTURE,
    });
    prisma.chargingStation.findMany.mockResolvedValue([
      { id: 'db-1', entityId: 'ent-1', storeId: 'store-1', ocmId: 'vinfast-store-1' },
    ]);
    prisma.$queryRaw.mockResolvedValue([
      { station_id: 'db-1', status: 'ACTIVE' }, // same as incoming
    ]);

    const result = await pollStationStatus(
      makeDeps({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prisma: prisma as any,
        fetchLocators: vi.fn().mockResolvedValue([
          makeStation({ entity_id: 'ent-1', charging_status: 'ACTIVE' }),
        ]),
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.stationsPolled).toBe(1);
    expect(result.observationsInserted).toBe(0);
    expect(prisma.stationStatusObservation.createMany).not.toHaveBeenCalled();
  });

  it('inserts first-time observation when station has no prior log', async () => {
    const prisma = makePrismaMock();
    prisma.vinfastApiCookies.findFirst.mockResolvedValue({
      id: 1,
      cookieJson: JSON.stringify(COOKIES),
      refreshedAt: new Date(),
      expiresAt: FUTURE,
    });
    prisma.chargingStation.findMany.mockResolvedValue([
      { id: 'db-1', entityId: 'ent-1', storeId: 'store-1', ocmId: 'vinfast-store-1' },
    ]);
    prisma.$queryRaw.mockResolvedValue([]); // no prior observation

    const result = await pollStationStatus(
      makeDeps({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prisma: prisma as any,
        fetchLocators: vi.fn().mockResolvedValue([
          makeStation({ entity_id: 'ent-1', charging_status: 'ACTIVE' }),
        ]),
      }),
    );

    expect(result.observationsInserted).toBe(1);
  });

  it('skips stations not present in our ChargingStation table', async () => {
    const prisma = makePrismaMock();
    prisma.vinfastApiCookies.findFirst.mockResolvedValue({
      id: 1,
      cookieJson: JSON.stringify(COOKIES),
      refreshedAt: new Date(),
      expiresAt: FUTURE,
    });
    prisma.chargingStation.findMany.mockResolvedValue([]); // empty DB

    const result = await pollStationStatus(
      makeDeps({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prisma: prisma as any,
        fetchLocators: vi.fn().mockResolvedValue([makeStation()]),
      }),
    );

    expect(result.stationsPolled).toBe(1);
    expect(result.observationsInserted).toBe(0);
  });

  it('skips stations with empty charging_status', async () => {
    const prisma = makePrismaMock();
    prisma.vinfastApiCookies.findFirst.mockResolvedValue({
      id: 1,
      cookieJson: JSON.stringify(COOKIES),
      refreshedAt: new Date(),
      expiresAt: FUTURE,
    });
    prisma.chargingStation.findMany.mockResolvedValue([
      { id: 'db-1', entityId: 'ent-1', storeId: 'store-1', ocmId: 'vinfast-store-1' },
    ]);

    const result = await pollStationStatus(
      makeDeps({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prisma: prisma as any,
        fetchLocators: vi.fn().mockResolvedValue([
          makeStation({ entity_id: 'ent-1', charging_status: '' }),
        ]),
      }),
    );

    expect(result.observationsInserted).toBe(0);
  });

  it('returns upstream_failed when fetchLocators throws VinfastApiError', async () => {
    const prisma = makePrismaMock();
    prisma.vinfastApiCookies.findFirst.mockResolvedValue({
      id: 1,
      cookieJson: JSON.stringify(COOKIES),
      refreshedAt: new Date(),
      expiresAt: FUTURE,
    });

    const result = await pollStationStatus(
      makeDeps({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prisma: prisma as any,
        fetchLocators: vi.fn().mockRejectedValue(
          new VinfastApiError('http_error', 'Upstream returned 503', 503),
        ),
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('upstream_failed');
    expect(result.errors[0]).toContain('http_error');
  });

  it('matches stations by entityId first, falling back to ocmId by storeId', async () => {
    const prisma = makePrismaMock();
    prisma.vinfastApiCookies.findFirst.mockResolvedValue({
      id: 1,
      cookieJson: JSON.stringify(COOKIES),
      refreshedAt: new Date(),
      expiresAt: FUTURE,
    });
    prisma.chargingStation.findMany.mockResolvedValue([
      { id: 'db-1', entityId: 'ent-1', storeId: null, ocmId: 'vinfast-store-1' },
      { id: 'db-2', entityId: null, storeId: null, ocmId: 'vinfast-store-2' },
    ]);

    const result = await pollStationStatus(
      makeDeps({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prisma: prisma as any,
        fetchLocators: vi.fn().mockResolvedValue([
          makeStation({ entity_id: 'ent-1', store_id: 'store-1', charging_status: 'ACTIVE' }),
          makeStation({ entity_id: 'ent-99', store_id: 'store-2', charging_status: 'BUSY' }),
        ]),
      }),
    );

    expect(result.observationsInserted).toBe(2);
    const inserted = prisma.stationStatusObservation.createMany.mock.calls[0]![0].data;
    expect(inserted).toEqual(
      expect.arrayContaining([
        { stationId: 'db-1', status: 'ACTIVE' },
        { stationId: 'db-2', status: 'BUSY' },
      ]),
    );
  });
});
