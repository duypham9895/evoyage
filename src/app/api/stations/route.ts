import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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
  const searchParams = request.nextUrl.searchParams;

  const vinFastOnly = searchParams.get('vinFastOnly');
  const provider = searchParams.get('provider');
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
    const [lat1, lng1, lat2, lng2] = bounds.split(',').map(Number);
    if ([lat1, lng1, lat2, lng2].every((n) => !isNaN(n))) {
      where.latitude = { gte: Math.min(lat1, lat2), lte: Math.max(lat1, lat2) };
      where.longitude = { gte: Math.min(lng1, lng2), lte: Math.max(lng1, lng2) };
    }
  }

  const stations = await prisma.chargingStation.findMany({
    where,
    orderBy: { name: 'asc' },
  });

  // Parse JSON string fields back to arrays
  const parsed = stations.map((s) => ({
    ...s,
    chargerTypes: JSON.parse(s.chargerTypes) as string[],
    connectorTypes: JSON.parse(s.connectorTypes) as string[],
  }));

  return NextResponse.json({ stations: parsed, count: parsed.length });
}
