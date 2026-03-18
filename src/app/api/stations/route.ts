import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, getClientIp, stationsLimiter } from '@/lib/rate-limit';
import { safeJsonArray } from '@/lib/safe-json';

/**
 * GET /api/stations — Get charging stations with optional filters.
 *
 * Query params:
 *   vinFastOnly - "true" to show only VinFast stations
 *   connectorType - Filter by connector type (CCS2, CHAdeMO, etc.)
 *   provider    - Filter by provider name
 *   bounds      - "lat1,lng1,lat2,lng2" bounding box for map viewport
 */
export async function GET(request: NextRequest) {
  // Rate limiting: 30 requests per minute per IP
  const ip = getClientIp(request);
  const limit = await checkRateLimit(`stations:${ip}`, 30, 60_000, stationsLimiter);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.',
        retryAfter: limit.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  const searchParams = request.nextUrl.searchParams;

  const vinFastOnly = searchParams.get('vinFastOnly');
  const ALLOWED_PROVIDERS = new Set(['VinFast', 'EverCharge', 'EVONE', 'EVPower', 'CHARGE+', 'Other']);
  const rawProvider = searchParams.get('provider')?.slice(0, 100) ?? null;
  const provider = rawProvider && ALLOWED_PROVIDERS.has(rawProvider) ? rawProvider : null;
  const bounds = searchParams.get('bounds');

  const where: Record<string, unknown> = {};

  if (vinFastOnly === 'true') {
    where.isVinFastOnly = true;
  } else if (vinFastOnly === 'false') {
    where.isVinFastOnly = false;
  }

  if (provider) {
    where.provider = provider;
  }

  if (bounds) {
    const parts = bounds.split(',').map(Number);
    const [lat1, lng1, lat2, lng2] = parts;
    if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
      // Validate geographic bounds
      const minLat = Math.min(lat1, lat2);
      const maxLat = Math.max(lat1, lat2);
      const minLng = Math.min(lng1, lng2);
      const maxLng = Math.max(lng1, lng2);

      if (minLat < -90 || maxLat > 90 || minLng < -180 || maxLng > 180) {
        return NextResponse.json(
          { error: 'Invalid bounds: lat must be -90 to 90, lng must be -180 to 180' },
          { status: 400 },
        );
      }

      // Reject overly large bounding boxes to prevent full table scans
      if ((maxLat - minLat) > 5 || (maxLng - minLng) > 5) {
        return NextResponse.json(
          { error: 'Bounding box too large (max 5° × 5°)' },
          { status: 400 },
        );
      }

      where.latitude = { gte: minLat, lte: maxLat };
      where.longitude = { gte: minLng, lte: maxLng };
    }
  }

  const stations = await prisma.chargingStation.findMany({
    where,
    orderBy: { name: 'asc' },
    take: 500,
  });

  // Parse JSON string fields back to arrays
  const parsed = stations.map((s) => ({
    ...s,
    chargerTypes: safeJsonArray(s.chargerTypes),
    connectorTypes: safeJsonArray(s.connectorTypes),
  }));

  return NextResponse.json({ stations: parsed, count: parsed.length });
}
