import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { fetchVinFastDetail } from '@/lib/vinfast-client';

/**
 * GET /api/stations/[id]/vinfast-detail
 *
 * On-demand VinFast station detail with Cloudflare bypass.
 * Returns OCPI-level data: per-port connectors, real-time depot status,
 * images, operating hours, hardware specs.
 *
 * Cache: 6 hours in DB. Fallback: basic ChargingStation data.
 */

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: stationId } = await params;

  // Validate stationId format (CUID)
  if (!/^[a-z0-9]{20,36}$/.test(stationId)) {
    return NextResponse.json({ error: 'Invalid station ID' }, { status: 400 });
  }

  // Rate limit: 20 req/min per IP
  const ip = getClientIp(request);
  const limit = await checkRateLimit(`vinfast-detail:${ip}`, 20, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  // Find the station in our DB
  const station = await prisma.chargingStation.findUnique({
    where: { id: stationId },
  });

  if (!station) {
    return NextResponse.json({ error: 'Station not found' }, { status: 404 });
  }

  // Only VinFast stations have detail
  if (!station.isVinFastOnly) {
    return NextResponse.json(
      { error: 'Detail only available for VinFast stations' },
      { status: 400 },
    );
  }

  // Extract store_id: try vinfast- prefix first, then osm- prefix
  const storeId = station.ocmId?.startsWith('vinfast-')
    ? station.ocmId.replace('vinfast-', '')
    : station.ocmId?.replace('osm-', '') ?? station.id;

  // Check cache first
  const cached = await prisma.vinFastStationDetail.findFirst({
    where: { storeId },
  });

  if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    return NextResponse.json({
      detail: JSON.parse(cached.detail),
      cached: true,
      station: {
        id: station.id,
        name: station.name,
        provider: station.provider,
      },
    });
  }

  // Find entity_id by matching storeId in VinFast API
  const entityId = await findEntityId(storeId);

  if (!entityId) {
    // Fallback: return basic station data
    return NextResponse.json({
      detail: null,
      cached: false,
      fallback: true,
      station: {
        id: station.id,
        name: station.name,
        address: station.address,
        provider: station.provider,
        maxPowerKw: station.maxPowerKw,
        connectorTypes: safeJsonArray(station.connectorTypes),
        portCount: station.portCount,
      },
    });
  }

  // Validate entityId format before passing to external API (prevent SSRF)
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(entityId)) {
    return NextResponse.json({ detail: null, cached: false, fallback: true, station: { id: station.id, name: station.name, provider: station.provider } });
  }

  // Fetch fresh detail from VinFast
  const detail = await fetchVinFastDetail(entityId);

  if (!detail) {
    // Cloudflare blocked or API failed — return basic data
    return NextResponse.json({
      detail: cached ? JSON.parse(cached.detail) : null,
      cached: !!cached,
      fallback: !cached,
      station: {
        id: station.id,
        name: station.name,
        address: station.address,
        provider: station.provider,
        maxPowerKw: station.maxPowerKw,
        connectorTypes: safeJsonArray(station.connectorTypes),
        portCount: station.portCount,
      },
    });
  }

  // Guard against pathologically large responses
  const serialized = JSON.stringify(detail);
  if (serialized.length > 100_000) {
    return NextResponse.json({ detail, cached: false, station: { id: station.id, name: station.name, provider: station.provider } });
  }

  // Cache the result
  await prisma.vinFastStationDetail.upsert({
    where: { entityId },
    update: {
      storeId,
      detail: JSON.stringify(detail),
      fetchedAt: new Date(),
    },
    create: {
      entityId,
      storeId,
      detail: JSON.stringify(detail),
      fetchedAt: new Date(),
    },
  });

  return NextResponse.json({
    detail,
    cached: false,
    station: {
      id: station.id,
      name: station.name,
      provider: station.provider,
    },
  });
}

/**
 * Look up VinFast entity_id from store_id via finaldivision API.
 */
async function findEntityId(storeId: string): Promise<string | null> {
  try {
    const response = await fetch(
      'https://api.service.finaldivision.com/stations/charging-stations',
      { headers: { 'Accept-Encoding': 'gzip, deflate' }, signal: AbortSignal.timeout(30_000) },
    );

    if (!response.ok) return null;

    const stations: Array<{ entity_id: string; store_id: string }> = await response.json();
    const match = stations.find((s) => s.store_id === storeId);
    return match?.entity_id ?? null;
  } catch {
    return null;
  }
}

function safeJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
