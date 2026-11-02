import { describe, it, expect, vi } from 'vitest';
import {
  checkObservationFreshness,
  OBSERVATION_MAX_AGE_HOURS,
} from './observation-freshness';

const NOW = new Date('2026-11-02T12:00:00Z');
const HOUR_MS = 60 * 60 * 1000;

function makePrisma(maxObservedAt: Date | null | Error) {
  const aggregate = vi.fn();
  if (maxObservedAt instanceof Error) aggregate.mockRejectedValue(maxObservedAt);
  else aggregate.mockResolvedValue({ _max: { observedAt: maxObservedAt } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { prisma: { stationStatusObservation: { aggregate } } as any, aggregate };
}

describe('checkObservationFreshness', () => {
  it('reads the newest observedAt via an aggregate, not a row scan', async () => {
    const { prisma, aggregate } = makePrisma(new Date(NOW.getTime() - HOUR_MS));

    await checkObservationFreshness({ prisma, now: NOW });

    expect(aggregate).toHaveBeenCalledWith({ _max: { observedAt: true } });
  });

  it('is healthy when the newest observation is 1 hour old', async () => {
    const latest = new Date(NOW.getTime() - HOUR_MS);
    const { prisma } = makePrisma(latest);

    const result = await checkObservationFreshness({ prisma, now: NOW });

    expect(result).toEqual({ ok: true, lastObservedAt: latest, ageHours: 1 });
  });

  it('is healthy at exactly the limit (inclusive)', async () => {
    const { prisma } = makePrisma(new Date(NOW.getTime() - OBSERVATION_MAX_AGE_HOURS * HOUR_MS));

    const result = await checkObservationFreshness({ prisma, now: NOW });

    expect(result.ok).toBe(true);
  });

  it('is unhealthy when the newest observation is older than the limit', async () => {
    const { prisma } = makePrisma(new Date(NOW.getTime() - (OBSERVATION_MAX_AGE_HOURS + 1) * HOUR_MS));

    const result = await checkObservationFreshness({ prisma, now: NOW });

    expect(result.ok).toBe(false);
    expect(result.ageHours).toBe(OBSERVATION_MAX_AGE_HOURS + 1);
    expect(result.error).toMatch(/older than/);
  });

  it('honours a custom limit', async () => {
    const { prisma } = makePrisma(new Date(NOW.getTime() - 5 * HOUR_MS));

    const result = await checkObservationFreshness({ prisma, now: NOW, maxAgeHours: 4 });

    expect(result.ok).toBe(false);
  });

  it('is unhealthy when the table holds no observations at all', async () => {
    const { prisma } = makePrisma(null);

    const result = await checkObservationFreshness({ prisma, now: NOW });

    expect(result).toMatchObject({ ok: false, lastObservedAt: null, ageHours: null });
    expect(result.error).toMatch(/no observations/);
  });

  it('reports a query failure as unhealthy instead of throwing', async () => {
    const { prisma } = makePrisma(new Error('connection refused'));

    const result = await checkObservationFreshness({ prisma, now: NOW });

    expect(result).toMatchObject({ ok: false, lastObservedAt: null, ageHours: null });
    expect(result.error).toContain('connection refused');
  });
});
