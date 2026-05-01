import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { normalizeStationStatus } from '@/lib/stations/station-status-validation';

/**
 * 1-tap crowdsourced station status report.
 *
 * Users tap one of 3 text buttons (Working / Broken / Busy) on a station card
 * to confirm what they see at a charger. We store every report (cheap, useful
 * for trends) and denormalize the latest WORKING report's timestamp onto
 * ChargingStation.lastVerifiedAt so the UI can show "verified X min ago"
 * without a join.
 *
 * Rate limit: 5 reports per IP per minute — enough for a driver moving between
 * chargers, low enough to dampen spam.
 */

const STATUS_REPORT_LIMIT = 5;
const STATUS_REPORT_WINDOW_MS = 60_000;

const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

const statusReportLimiter = hasRedis
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(STATUS_REPORT_LIMIT, `${STATUS_REPORT_WINDOW_MS / 1000} s`),
      analytics: false,
      prefix: 'evoyage:ratelimit',
    })
  : null;

/** SHA-256 of the client IP — never store raw IPs. */
function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: stationId } = await params;

  // 1. Reject malformed station IDs early — Prisma cuids are 25 chars but legacy
  // entries can vary; we just guard against absurd inputs.
  if (typeof stationId !== 'string' || stationId.length < 5 || stationId.length > 64) {
    return NextResponse.json(
      { success: false, error: 'INVALID_STATION_ID' },
      { status: 400 },
    );
  }

  // 2. Rate limit per IP — 5 reports / minute.
  const ip = getClientIp(request);
  const limit = await checkRateLimit(
    `status-report:${ip}`,
    STATUS_REPORT_LIMIT,
    STATUS_REPORT_WINDOW_MS,
    statusReportLimiter,
  );

  if (!limit.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: 'RATE_LIMITED',
        retryAfterSec: limit.retryAfterSec,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfterSec) },
      },
    );
  }

  // 3. Parse body and validate status enum.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'INVALID_JSON' },
      { status: 400 },
    );
  }

  const rawStatus = (body as { status?: unknown } | null)?.status;
  const status = normalizeStationStatus(rawStatus);
  if (!status) {
    return NextResponse.json(
      { success: false, error: 'INVALID_STATUS' },
      { status: 400 },
    );
  }

  // 4. Make sure the station exists before recording a report against it.
  const station = await prisma.chargingStation.findUnique({
    where: { id: stationId },
    select: { id: true },
  });

  if (!station) {
    return NextResponse.json(
      { success: false, error: 'STATION_NOT_FOUND' },
      { status: 404 },
    );
  }

  // 5. Persist the report. Trim user-agent so we don't store enormous headers.
  const userAgentHeader = request.headers.get('user-agent');
  const userAgent = userAgentHeader ? userAgentHeader.slice(0, 500) : null;

  try {
    const reportedAt = new Date();

    await prisma.stationStatusReport.create({
      data: {
        stationId,
        status,
        ipHash: hashIp(ip),
        userAgent,
        createdAt: reportedAt,
      },
    });

    // 6. Denormalize lastVerifiedAt only on WORKING reports — the other two
    // statuses don't tell us the station is up.
    if (status === 'WORKING') {
      await prisma.chargingStation.update({
        where: { id: stationId },
        data: { lastVerifiedAt: reportedAt },
      });
    }

    return NextResponse.json(
      { success: true, reportedAt: reportedAt.toISOString() },
      { status: 201 },
    );
  } catch (err) {
    console.error('[station-status-report] Database error:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
