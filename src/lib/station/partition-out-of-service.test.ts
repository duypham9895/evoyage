import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  markExistingOutOfService,
  partitionOutOfService,
} from './partition-out-of-service';
import type { VinfastLocatorRaw } from './vinfast-api-client';

const ROW: VinfastLocatorRaw = {
  bundle: 'charging_station',
  entity_id: '65481',
  store_id: 'M.HNO0035',
  code: 'vfs_M.HNO0035',
  name: 'Vinhomes Skylake',
  address: 'Vinhomes Skylake, o dat E1.3',
  lat: '21.019840',
  lng: '105.780830',
  hotline: '1900232389',
  province_id: '2483',
  category_name: 'Tram sac o to dien',
  category_slug: 'car_charging_station',
  marker_icon: '',
  charging_status: 'ACTIVE',
};

const OOS_ROW: VinfastLocatorRaw = { ...ROW, charging_status: 'OUTOFSERVICE' };

const noMap = new Map<string, string>();

describe('partitionOutOfService', () => {
  it('returns the DB id of an existing station that the feed now reports OUTOFSERVICE (#84)', () => {
    const byOcm = new Map([['vinfast-M.HNO0035', 'db-1']]);

    const result = partitionOutOfService([OOS_ROW], byOcm, noMap);

    expect(result.outOfServiceExistingIds).toEqual(['db-1']);
    expect(result.toUpsert).toEqual([]);
    expect(result.skippedNew).toBe(0);
  });

  it('falls back to the entityId map when the ocmId is unknown, like the upsert does', () => {
    const byEntity = new Map([['65481', 'db-2']]);

    const result = partitionOutOfService([OOS_ROW], noMap, byEntity);

    expect(result.outOfServiceExistingIds).toEqual(['db-2']);
  });

  it('skips an OUTOFSERVICE station that is not in the DB, without inserting it', () => {
    const result = partitionOutOfService([OOS_ROW], noMap, noMap);

    expect(result.outOfServiceExistingIds).toEqual([]);
    expect(result.toUpsert).toEqual([]);
    expect(result.skippedNew).toBe(1);
  });

  it('prefers the ocmId match over the entityId match when they disagree', () => {
    const byOcm = new Map([['vinfast-M.HNO0035', 'db-ocm']]);
    const byEntity = new Map([['65481', 'db-entity']]);

    const result = partitionOutOfService([OOS_ROW], byOcm, byEntity);

    expect(result.outOfServiceExistingIds).toEqual(['db-ocm']);
  });

  it('passes every non-OUTOFSERVICE row to the upsert unchanged and in input order', () => {
    const active = { ...ROW, store_id: 'A' };
    const noStatus = { ...ROW, store_id: 'B', charging_status: undefined };
    const empty = { ...ROW, store_id: 'C', charging_status: '' };
    const byOcm = new Map([['vinfast-A', 'db-a']]);

    const result = partitionOutOfService([active, noStatus, empty], byOcm, noMap);

    expect(result.toUpsert).toEqual([active, noStatus, empty]);
    expect(result.outOfServiceExistingIds).toEqual([]);
    expect(result.skippedNew).toBe(0);
  });

  it('lists an existing id once when two OUTOFSERVICE rows resolve to it', () => {
    const byOcm = new Map([['vinfast-M.HNO0035', 'db-1']]);
    const byEntity = new Map([['77777', 'db-1']]);
    const second = { ...OOS_ROW, store_id: 'OTHER', entity_id: '77777' };

    const result = partitionOutOfService([OOS_ROW, second], byOcm, byEntity);

    expect(result.outOfServiceExistingIds).toEqual(['db-1']);
  });

  it('marks an id out of service even when an ACTIVE row for the same id is also upserted', () => {
    // The OOS write runs after the upsert, so the station ends OUTOFSERVICE:
    // the safe side for routing.
    const byOcm = new Map([['vinfast-M.HNO0035', 'db-1']]);
    const byEntity = new Map([['77777', 'db-1']]);
    const oosDuplicate = { ...OOS_ROW, store_id: 'OTHER', entity_id: '77777' };

    const result = partitionOutOfService([ROW, oosDuplicate], byOcm, byEntity);

    expect(result.toUpsert).toEqual([ROW]);
    expect(result.outOfServiceExistingIds).toEqual(['db-1']);
  });

  it('returns empty results for empty input', () => {
    expect(partitionOutOfService([], noMap, noMap)).toEqual({
      toUpsert: [],
      outOfServiceExistingIds: [],
      skippedNew: 0,
    });
  });
});

describe('markExistingOutOfService', () => {
  function makePrisma(counts: number[] = []) {
    const updateMany = vi.fn();
    for (const count of counts) updateMany.mockResolvedValueOnce({ count });
    const prisma = { chargingStation: { updateMany } } as unknown as PrismaClient;
    return { prisma, updateMany };
  }

  it('sets chargingStatus to OUTOFSERVICE on the given VinFast ids only', async () => {
    const { prisma, updateMany } = makePrisma([2]);

    const marked = await markExistingOutOfService(prisma, ['db-1', 'db-2'], 1000);

    expect(marked).toBe(2);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['db-1', 'db-2'] }, provider: 'VinFast' },
      data: { chargingStatus: 'OUTOFSERVICE' },
    });
  });

  it('splits the ids into batches and sums the updated counts', async () => {
    const { prisma, updateMany } = makePrisma([2, 1]);

    const marked = await markExistingOutOfService(prisma, ['a', 'b', 'c'], 2);

    expect(marked).toBe(3);
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany.mock.calls[0][0].where.id.in).toEqual(['a', 'b']);
    expect(updateMany.mock.calls[1][0].where.id.in).toEqual(['c']);
  });

  it('makes no DB call when there is nothing to mark', async () => {
    const { prisma, updateMany } = makePrisma();

    const marked = await markExistingOutOfService(prisma, [], 1000);

    expect(marked).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
