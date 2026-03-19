import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { createShortUrl, validateParams } from '@/lib/short-url';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

// Two-tier rate limiting: 10/min and 50/hr
const shortUrlMinuteLimiter = hasRedis
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(10, '60 s'),
      analytics: false,
      prefix: 'evoyage:ratelimit:shorturl:min',
    })
  : null;

const shortUrlHourLimiter = hasRedis
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(50, '3600 s'),
      analytics: false,
      prefix: 'evoyage:ratelimit:shorturl:hr',
    })
  : null;

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIp(request);

    const minuteResult = await checkRateLimit(ip, 10, 60_000, shortUrlMinuteLimiter);
    if (!minuteResult.allowed) {
      return NextResponse.json(
        { error: 'Too many links created. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(minuteResult.retryAfterSec) },
        },
      );
    }

    const hourResult = await checkRateLimit(`${ip}:hr`, 50, 3_600_000, shortUrlHourLimiter);
    if (!hourResult.allowed) {
      return NextResponse.json(
        { error: 'Too many links created. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(hourResult.retryAfterSec) },
        },
      );
    }

    // Parse and validate body
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const validation = validateParams(body.params);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Derive base URL from request
    const proto = request.headers.get('x-forwarded-proto') ?? 'https';
    const host = request.headers.get('host') ?? 'evoyage.app';
    const baseUrl = `${proto}://${host}`;

    // Create the short URL
    const result = await createShortUrl(validation.params, baseUrl);

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error('[short-url] Creation failed:', err);
    return NextResponse.json(
      { error: 'Could not create share link. Please try again.' },
      { status: 500 },
    );
  }
}
