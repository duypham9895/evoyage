import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { checkRateLimit, getClientIp, __resetRateLimitForTests } from './rate-limit';

describe('getClientIp', () => {
  it('prefers x-vercel-forwarded-for (unspoofable)', () => {
    const headers = new Headers({
      'x-vercel-forwarded-for': '1.2.3.4',
      'x-forwarded-for': '5.6.7.8',
    });
    const req = { headers } as unknown as Request;
    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('falls back to x-forwarded-for', () => {
    const headers = new Headers({
      'x-forwarded-for': '5.6.7.8, 9.10.11.12',
    });
    const req = { headers } as unknown as Request;
    expect(getClientIp(req)).toBe('5.6.7.8');
  });

  it('falls back to x-real-ip', () => {
    const headers = new Headers({
      'x-real-ip': '10.0.0.1',
    });
    const req = { headers } as unknown as Request;
    expect(getClientIp(req)).toBe('10.0.0.1');
  });

  it('returns anonymous when no IP headers', () => {
    const headers = new Headers({});
    const req = { headers } as unknown as Request;
    expect(getClientIp(req)).toBe('anonymous');
  });

  it('takes first IP from comma-separated vercel header', () => {
    const headers = new Headers({
      'x-vercel-forwarded-for': '1.2.3.4, 5.6.7.8',
    });
    const req = { headers } as unknown as Request;
    expect(getClientIp(req)).toBe('1.2.3.4');
  });
});

describe('checkRateLimit when the Redis backend is unreachable', () => {
  beforeEach(() => {
    __resetRateLimitForTests();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Regression: Upstash DNS stopped resolving and every rate-limited endpoint
  // returned 500 in production -- /api/route, /api/stations, /api/vehicles.
  // checkRateLimit awaited limiter.limit() with no try/catch, so an unreachable
  // backend propagated out of the rate-limit check and crashed the request.
  // The in-memory path existed but was only chosen when the env vars were
  // ABSENT, never when the configured host was dead.
  const throwingLimiter = {
    limit: async () => {
      throw new TypeError('fetch failed');
    },
  } as unknown as Parameters<typeof checkRateLimit>[3];

  it('falls back to the in-memory limiter instead of throwing', async () => {
    await expect(
      checkRateLimit('ip-unreachable', 5, 60_000, throwingLimiter),
    ).resolves.toMatchObject({ allowed: true });
  });

  it('still enforces a limit through the fallback', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await checkRateLimit('ip-enforced', 3, 60_000, throwingLimiter);
      expect(r.allowed).toBe(true);
    }
    const blocked = await checkRateLimit('ip-enforced', 3, 60_000, throwingLimiter);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });
});

describe('checkRateLimit latency when the Redis backend is slow or dead', () => {
  beforeEach(() => {
    __resetRateLimitForTests();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // Regression: if the Redis backend is slow or unreachable, @upstash/redis
  // retries 5 times with exponential backoff (~4.3 s) before throwing, and every
  // rate-limited request waits that long before the fallback runs.
  it('falls back to the in-memory limiter after a bounded wait when Redis hangs', async () => {
    const hangingLimiter = {
      limit: () => new Promise(() => {}),
    } as unknown as Parameters<typeof checkRateLimit>[3];

    let settled: unknown;
    void checkRateLimit('ip-hang', 5, 60_000, hangingLimiter).then((r) => {
      settled = r;
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(settled).toMatchObject({ allowed: true });
  });
});

describe('Redis client configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('@upstash/redis');
    vi.resetModules();
  });

  it('disables client-side retries so a dead host fails on the first attempt', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token');
    const fromEnv = vi.fn(() => ({}));
    vi.resetModules();
    vi.doMock('@upstash/redis', () => ({ Redis: { fromEnv } }));

    await import('./rate-limit');

    expect(fromEnv).toHaveBeenCalled();
    for (const call of fromEnv.mock.calls as unknown as Array<[unknown]>) {
      expect(call[0]).toMatchObject({ retry: { retries: 0 } });
    }
  });
});
