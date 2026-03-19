import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { feedbackRequestSchema } from '@/lib/feedback/schema';
import { sendFeedbackEmail } from '@/lib/feedback/email';
import {
  FEEDBACK_RATE_LIMIT,
  FEEDBACK_RATE_WINDOW_MS,
  MIN_SUBMIT_DELAY_MS,
  type FeedbackCategory,
} from '@/lib/feedback/constants';

const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const feedbackLimiter = hasRedis
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(FEEDBACK_RATE_LIMIT, `${FEEDBACK_RATE_WINDOW_MS / 1000} s`),
      analytics: false,
      prefix: 'evoyage:ratelimit',
    })
  : null;

/** Hash IP with SHA-256 for privacy-safe storage */
function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}

/**
 * POST /api/feedback — Submit user feedback.
 *
 * Validates input, checks honeypot + timing + rate limit,
 * saves to DB, then fires off email notification.
 */
export async function POST(request: NextRequest) {
  // 1. Rate limit check
  const ip = getClientIp(request);
  const limit = await checkRateLimit(
    `feedback:${ip}`,
    FEEDBACK_RATE_LIMIT,
    FEEDBACK_RATE_WINDOW_MS,
    feedbackLimiter,
  );

  if (!limit.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: 'Bạn đã gửi quá nhiều phản hồi. Vui lòng thử lại sau.',
        error_en: 'Too many submissions. Please try again later.',
      },
      { status: 429 },
    );
  }

  // 2. Parse and validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const parsed = feedbackRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Dữ liệu không hợp lệ',
        details: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // 3. Honeypot check — reject if filled
  if (data.honeypot) {
    // Silently accept to not reveal the check to bots
    return NextResponse.json({ success: true, id: 'ok' }, { status: 201 });
  }

  // 4. Timing check — reject if submitted too fast (< 3 seconds)
  if (data.formOpenedAt) {
    const elapsed = Date.now() - data.formOpenedAt;
    if (elapsed < MIN_SUBMIT_DELAY_MS) {
      // Silently accept to not reveal the check
      return NextResponse.json({ success: true, id: 'ok' }, { status: 201 });
    }
  }

  // 5. Save to database
  try {
    const ipHash = hashIp(ip);

    const feedback = await prisma.feedback.create({
      data: {
        category: data.category,
        description: data.description,
        email: data.email || null,
        name: data.name || null,
        phone: data.phone || null,
        stationId: data.stationId || null,
        stationName: data.stationName || null,
        stepsToReproduce: data.stepsToReproduce || null,
        useCase: data.useCase || null,
        correctInfo: data.correctInfo || null,
        rating: data.rating ?? null,
        pageUrl: data.pageUrl || null,
        userAgent: data.userAgent || null,
        viewport: data.viewport || null,
        routeParams: data.routeParams || null,
        ipHash,
      },
    });

    // 6. Send email notification (must await — Vercel kills the function after response)
    try {
      await sendFeedbackEmail({
        feedbackId: feedback.id,
        category: data.category as FeedbackCategory,
        description: data.description,
        email: data.email || undefined,
        name: data.name || undefined,
        phone: data.phone || undefined,
        stationId: data.stationId || undefined,
        stationName: data.stationName || undefined,
        stepsToReproduce: data.stepsToReproduce || undefined,
        useCase: data.useCase || undefined,
        correctInfo: data.correctInfo || undefined,
        rating: data.rating,
        pageUrl: data.pageUrl || undefined,
        userAgent: data.userAgent || undefined,
        viewport: data.viewport || undefined,
      });
    } catch (err) {
      console.error('[feedback] Email notification error:', err);
    }

    return NextResponse.json(
      { success: true, id: feedback.id },
      { status: 201 },
    );
  } catch (err) {
    console.error('[feedback] Database error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
