import { describe, it, expect, vi } from 'vitest';
import { queryStationPopularity } from './popularity-query';

interface MockPrisma {
  stationPopularity: {
    findUnique: ReturnType<typeof vi.fn>;
  };
}

function makePrismaMock(): MockPrisma {
  return {
    stationPopularity: {
      findUnique: vi.fn(),
    },
  };
}

const ARRIVAL_FRIDAY_5PM_VN = '2026-05-08T10:00:00Z'; // 17:00 Asia/Ho_Chi_Minh, dayOfWeek=5

describe('queryStationPopularity', () => {
  it('returns insufficient-data when no row exists', async () => {
    const prisma = makePrismaMock();
    prisma.stationPopularity.findUnique.mockResolvedValue(null);

    const result = await queryStationPopularity({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma: prisma as any,
      stationId: 'st-1',
      arrivalAtIso: ARRIVAL_FRIDAY_5PM_VN,
    });

    expect(result.kind).toBe('insufficient-data');
  });

  it('returns insufficient-data when sampleCount is below threshold', async () => {
    const prisma = makePrismaMock();
    prisma.stationPopularity.findUnique.mockResolvedValue({
      stationId: 'st-1',
      dayOfWeek: 5,
      hour: 17,
      busyProbability: 0.8,
      sampleCount: 5, // below 20
      updatedAt: new Date(),
    });

    const result = await queryStationPopularity({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma: prisma as any,
      stationId: 'st-1',
      arrivalAtIso: ARRIVAL_FRIDAY_5PM_VN,
    });

    expect(result.kind).toBe('insufficient-data');
  });

  it('returns ready verdict when sample count meets threshold', async () => {
    const prisma = makePrismaMock();
    prisma.stationPopularity.findUnique.mockResolvedValue({
      stationId: 'st-1',
      dayOfWeek: 5,
      hour: 17,
      busyProbability: 0.75,
      sampleCount: 50,
      updatedAt: new Date(),
    });

    const result = await queryStationPopularity({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma: prisma as any,
      stationId: 'st-1',
      arrivalAtIso: ARRIVAL_FRIDAY_5PM_VN,
    });

    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.busyProbability).toBeCloseTo(0.75, 2);
      expect(result.sampleCount).toBe(50);
      expect(result.dayOfWeek).toBe(5);
      expect(result.hour).toBe(17);
      expect(result.isHolidayBoosted).toBe(false);
    }
  });

  it('boosts probability +0.15 inside a travel-heavy holiday window (capped at 1.0)', async () => {
    const prisma = makePrismaMock();
    prisma.stationPopularity.findUnique.mockResolvedValue({
      stationId: 'st-1',
      dayOfWeek: 4, // Apr 30 2026 = Thursday
      hour: 17,
      busyProbability: 0.6,
      sampleCount: 30,
      updatedAt: new Date(),
    });

    // 30/4 (Reunification Day) at 17:00 VN
    const result = await queryStationPopularity({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma: prisma as any,
      stationId: 'st-1',
      arrivalAtIso: '2026-04-30T10:00:00Z',
    });

    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.busyProbability).toBeCloseTo(0.75, 2); // 0.6 + 0.15
      expect(result.isHolidayBoosted).toBe(true);
    }
  });

  it('caps the holiday-boosted probability at 1.0', async () => {
    const prisma = makePrismaMock();
    prisma.stationPopularity.findUnique.mockResolvedValue({
      stationId: 'st-1',
      dayOfWeek: 4,
      hour: 17,
      busyProbability: 0.95,
      sampleCount: 30,
      updatedAt: new Date(),
    });

    const result = await queryStationPopularity({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma: prisma as any,
      stationId: 'st-1',
      arrivalAtIso: '2026-04-30T10:00:00Z',
    });

    if (result.kind === 'ready') {
      expect(result.busyProbability).toBe(1.0);
    }
  });

  it('does NOT boost when the holiday is local-kind (e.g. Hùng Vương)', async () => {
    const prisma = makePrismaMock();
    prisma.stationPopularity.findUnique.mockResolvedValue({
      stationId: 'st-1',
      dayOfWeek: 1,
      hour: 12,
      busyProbability: 0.5,
      sampleCount: 30,
      updatedAt: new Date(),
    });

    // 2026-04-06 = Hùng Kings Festival (kind: local)
    const result = await queryStationPopularity({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma: prisma as any,
      stationId: 'st-1',
      arrivalAtIso: '2026-04-06T05:00:00Z',
    });

    if (result.kind === 'ready') {
      expect(result.busyProbability).toBeCloseTo(0.5, 2);
      expect(result.isHolidayBoosted).toBe(false);
    }
  });

  it('looks up the right (dayOfWeek, hour) cell in Asia/Ho_Chi_Minh time', async () => {
    const prisma = makePrismaMock();
    prisma.stationPopularity.findUnique.mockResolvedValue(null);

    // 2026-05-04T18:30:00Z = 2026-05-05T01:30 VN = Tuesday early morning
    await queryStationPopularity({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma: prisma as any,
      stationId: 'st-1',
      arrivalAtIso: '2026-05-04T18:30:00Z',
    });

    expect(prisma.stationPopularity.findUnique).toHaveBeenCalledWith({
      where: {
        stationId_dayOfWeek_hour: {
          stationId: 'st-1',
          dayOfWeek: 2, // Tuesday in VN
          hour: 1,
        },
      },
    });
  });
});
