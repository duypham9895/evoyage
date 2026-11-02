/**
 * GET /api/health — Finding C of
 * docs/bugs/2026-11-01-p2-cron-silent-noops-and-observability.md.
 *
 * Public and unauthenticated, so beyond the happy path these tests pin that a
 * DB failure leaks no error text and that stale data does not turn into a 503
 * (the post-deploy smoke step would otherwise fail deploys over a data issue).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const queryRawMock = vi.fn();
const chargingStationAggregateMock = vi.fn();
const checkObservationFreshnessMock = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: (...a: unknown[]) => queryRawMock(...a),
    chargingStation: { aggregate: (...a: unknown[]) => chargingStationAggregateMock(...a) },
  },
}));
vi.mock('@/lib/station/observation-freshness', () => ({
  checkObservationFreshness: (...a: unknown[]) => checkObservationFreshnessMock(...a),
}));

import { GET } from './route';

const LAST_OBSERVED = new Date('2026-11-02T10:05:00Z');
const LAST_CRAWLED = new Date('2026-11-02T01:20:00Z');

beforeEach(() => {
  queryRawMock.mockReset();
  queryRawMock.mockResolvedValue([{ '?column?': 1 }]);
  chargingStationAggregateMock.mockReset();
  chargingStationAggregateMock.mockResolvedValue({ _max: { scrapedAt: LAST_CRAWLED } });
  checkObservationFreshnessMock.mockReset();
  checkObservationFreshnessMock.mockResolvedValue({
    ok: true,
    lastObservedAt: LAST_OBSERVED,
    ageHours: 2,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/health', () => {
  it('answers 200 with db up and fresh observation and crawl timestamps', async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      db: 'up',
      observations: { stale: false, lastObservedAt: LAST_OBSERVED.toISOString(), ageHours: 2 },
      lastCrawledAt: LAST_CRAWLED.toISOString(),
    });
  });

  it('runs a trivial SELECT 1 against the database', async () => {
    await GET();

    expect(queryRawMock).toHaveBeenCalledTimes(1);
    const [strings] = queryRawMock.mock.calls[0] as [TemplateStringsArray];
    expect(strings.join('?').trim()).toBe('SELECT 1');
  });

  it('still answers 200 when observations are stale, flagging them as stale', async () => {
    checkObservationFreshnessMock.mockResolvedValue({
      ok: false,
      lastObservedAt: new Date('2026-09-30T12:19:00Z'),
      ageHours: 768,
      error: 'newest observation is 768h old, older than the 24h limit',
    });

    const res = await GET();

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.observations).toEqual({
      stale: true,
      lastObservedAt: '2026-09-30T12:19:00.000Z',
      ageHours: 768,
    });
  });

  it('reports a null crawl timestamp when no station rows exist', async () => {
    chargingStationAggregateMock.mockResolvedValue({ _max: { scrapedAt: null } });

    const data = await (await GET()).json();

    expect(data.lastCrawledAt).toBeNull();
  });

  it('answers 503 with no error detail when the database is unreachable', async () => {
    queryRawMock.mockRejectedValue(new Error('password authentication failed for user "postgres"'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await GET();

    expect(res.status).toBe(503);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ ok: false, db: 'down' });
    expect(body).not.toContain('password');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('answers 503 when the crawl-age query throws after SELECT 1 succeeded', async () => {
    chargingStationAggregateMock.mockRejectedValue(new Error('statement timeout'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await GET();

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, db: 'down' });
  });

  it('lets the CDN cache a healthy answer briefly so public traffic cannot hammer the DB', async () => {
    const res = await GET();

    expect(res.headers.get('cache-control')).toBe('public, s-maxage=30');
  });
});
