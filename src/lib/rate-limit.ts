/**
 * Distributed rate limiter using Upstash Redis.
 * Works across Vercel serverless function instances.
 * Falls back gracefully when Redis is not configured (local dev).
 */
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

function createRedisRatelimiter(maxRequests: number, windowSec: number): Ratelimit {
  return new Ratelimit({
    // No client retries: against an unreachable host the default (5 retries,
    // exponential backoff) would hold each request ~4.3 s before the fallback.
    redis: Redis.fromEnv({ retry: { retries: 0 } }),
    limiter: Ratelimit.slidingWindow(maxRequests, `${windowSec} s`),
    analytics: false,
    prefix: 'evoyage:ratelimit',
    // On expiry the library resolves { success: true, reason: 'timeout' };
    // checkRateLimit treats that as a Redis failure, not as allowed.
    timeout: 500,
  });
}

// In-memory fallback for local development without Redis
const localStore = new Map<string, { count: number; resetAt: number }>();

/** Test-only: clear the in-memory rate-limit store between cases. */
export function __resetRateLimitForTests(): void {
  localStore.clear();
  redisFailureLogged = false;
  redisSkipUntil = 0;
}

// After a Redis failure, skip Redis for this long and use the in-memory
// limiter, so a dead host is not contacted on every request.
const REDIS_SKIP_AFTER_FAILURE_MS = 60_000;
let redisSkipUntil = 0;

// Logged once per process. A dead Redis fails on every request, and one line
// per request would bury the signal it is meant to raise.
let redisFailureLogged = false;

function warnRedisUnavailableOnce(err: unknown): void {
  if (redisFailureLogged) return;
  redisFailureLogged = true;
  const reason = err instanceof Error ? err.message : String(err);
  console.error(
    `[SECURITY] Redis rate limiter unreachable (${reason}); falling back to the ` +
      'per-instance in-memory limiter. Distributed rate limiting is DEGRADED — ' +
      'check UPSTASH_REDIS_REST_URL / KV_REST_API_URL.',
  );
}

function checkLocalRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  const existing = localStore.get(key);

  if (!existing || now > existing.resetAt) {
    localStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, retryAfterSec: 0 };
  }

  if (existing.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  localStore.set(key, { count: existing.count + 1, resetAt: existing.resetAt });
  return { allowed: true, remaining: maxRequests - existing.count - 1, retryAfterSec: 0 };
}

// Accept either the Upstash-native env-var names or the Vercel KV naming
// convention. The Vercel Marketplace integration for Upstash for Redis
// adds `KV_REST_API_URL` / `KV_REST_API_TOKEN`; `Redis.fromEnv()` falls back
// to those automatically (see @upstash/redis nodejs.js:fromEnv), but our
// own guards need to recognise both forms.
const hasRedis = !!(
  (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
  (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)
);

if (process.env.NODE_ENV === 'production' && !hasRedis) {
  console.error('[SECURITY] Rate limiting is disabled — set UPSTASH_REDIS_REST_URL/_TOKEN or KV_REST_API_URL/_TOKEN');
}

// Pre-configured rate limiters
export const routeLimiter = hasRedis ? createRedisRatelimiter(10, 60) : null;
export const routeMultiWaypointLimiter = hasRedis ? createRedisRatelimiter(5, 60) : null;
export const stationsLimiter = hasRedis ? createRedisRatelimiter(30, 60) : null;
export const vehiclesLimiter = hasRedis ? createRedisRatelimiter(30, 60) : null;
export const shareCardLimiter = hasRedis ? createRedisRatelimiter(3, 60) : null;
export const eviLimiter = hasRedis ? createRedisRatelimiter(20, 60) : null;
// Station detail can launch a headless browser against VinFast on a cache miss,
// so it needs the distributed limit, not only the per-instance fallback.
export const vinfastDetailLimiter = hasRedis ? createRedisRatelimiter(20, 60) : null;
// Groq Whisper is a paid endpoint billed per minute of audio. 10 req/min/IP
// is generous for a real user (one voice message every ~6 s) and tight enough
// to cap cost-abuse from anonymous scripted requests.
export const transcribeLimiter = hasRedis ? createRedisRatelimiter(10, 60) : null;
// Feedback image uploads hit Vercel Blob (paid storage). 5 uploads/hour per IP
// caps storage abuse without blocking a real reporter who attaches 2-3 photos
// to a single station-data-error submission.
export const feedbackUploadLimiter = hasRedis ? createRedisRatelimiter(5, 3600) : null;

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSec: number;
}

// Upper bound on one Redis round trip. A hung (not refused) connection would
// otherwise hold every rate-limited request until fetch gives up.
const REDIS_LIMIT_TIMEOUT_MS = 1_000;

export async function checkRateLimit(
  identifier: string,
  maxRequests: number,
  windowMs: number,
  limiter?: Ratelimit | null,
): Promise<RateLimitResult> {
  // Use Upstash Redis if available.
  //
  // `limiter` is non-null whenever the env vars are SET, which is not the same
  // as the backend being REACHABLE. When the Upstash host stopped resolving,
  // this await threw and the error propagated out of every rate-limited route:
  // /api/route, /api/stations and /api/vehicles all returned 500. Rate limiting
  // is a guard, not the feature — a guard that is unreachable must degrade, not
  // take the endpoint down with it.
  if (limiter && Date.now() >= redisSkipUntil) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        limiter.limit(identifier),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Redis rate limit timed out after ${REDIS_LIMIT_TIMEOUT_MS} ms`)),
            REDIS_LIMIT_TIMEOUT_MS,
          );
        }),
      ]);
      if (result.reason === 'timeout') {
        throw new Error('Redis rate limit timed out');
      }
      return {
        allowed: result.success,
        remaining: result.remaining,
        retryAfterSec: result.success ? 0 : Math.ceil((result.reset - Date.now()) / 1000),
      };
    } catch (err) {
      // Fall through to the in-memory limiter. Per-instance rather than
      // distributed, so protection is weaker but the endpoint stays up.
      redisSkipUntil = Date.now() + REDIS_SKIP_AFTER_FAILURE_MS;
      warnRedisUnavailableOnce(err);
    } finally {
      clearTimeout(timer);
    }
  }

  // Fallback to in-memory for local dev
  const result = checkLocalRateLimit(identifier, maxRequests, windowMs);
  return result;
}

/** Extract client IP — prefers unspoofable Vercel header */
export function getClientIp(request: Request): string {
  // x-vercel-forwarded-for cannot be spoofed on Vercel
  const vercelIp = request.headers.get('x-vercel-forwarded-for');
  if (vercelIp) return vercelIp.split(',')[0].trim();

  // Fallback for local development
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();

  return request.headers.get('x-real-ip') ?? 'anonymous';
}

export const RATE_LIMIT_ERROR_VI = 'Bạn đang gửi yêu cầu quá nhanh. Vui lòng thử lại sau {seconds} giây.';
export const RATE_LIMIT_ERROR_EN = 'Too many requests. Please try again in {seconds} seconds.';
