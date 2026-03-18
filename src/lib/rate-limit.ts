/**
 * Distributed rate limiter using Upstash Redis.
 * Works across Vercel serverless function instances.
 * Falls back gracefully when Redis is not configured (local dev).
 */
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

function createRedisRatelimiter(maxRequests: number, windowSec: number): Ratelimit {
  return new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(maxRequests, `${windowSec} s`),
    analytics: false,
    prefix: 'evoyage:ratelimit',
  });
}

// In-memory fallback for local development without Redis
const localStore = new Map<string, { count: number; resetAt: number }>();

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

const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

// Pre-configured rate limiters
export const routeLimiter = hasRedis ? createRedisRatelimiter(10, 60) : null;
export const routeMultiWaypointLimiter = hasRedis ? createRedisRatelimiter(5, 60) : null;
export const stationsLimiter = hasRedis ? createRedisRatelimiter(30, 60) : null;
export const vehiclesLimiter = hasRedis ? createRedisRatelimiter(30, 60) : null;
export const shareCardLimiter = hasRedis ? createRedisRatelimiter(3, 60) : null;

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSec: number;
}

export async function checkRateLimit(
  identifier: string,
  maxRequests: number,
  windowMs: number,
  limiter?: Ratelimit | null,
): Promise<RateLimitResult> {
  // Use Upstash Redis if available
  if (limiter) {
    const result = await limiter.limit(identifier);
    return {
      allowed: result.success,
      remaining: result.remaining,
      retryAfterSec: result.success ? 0 : Math.ceil((result.reset - Date.now()) / 1000),
    };
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
