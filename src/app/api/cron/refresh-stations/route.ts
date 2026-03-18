import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/cron/refresh-stations — Vercel Cron endpoint.
 * Fetches latest EV charging stations from OpenStreetMap Overpass API.
 * Runs daily at 00:00 UTC (configured in vercel.json).
 */

const VIETNAM_BBOX = '8.0,102.0,23.5,110.0';

function parseConnectorTypes(tags: Record<string, string>): string[] {
  const connectors: string[] = [];
  if (tags['socket:type2'] || tags['socket:type2_combo']) connectors.push('Type2_AC');
  if (tags['socket:type2_combo'] || tags['socket:ccs']) connectors.push('CCS2');
  if (tags['socket:chademo']) connectors.push('CHAdeMO');
  if (tags['socket:type1']) connectors.push('Type1');
  if (tags['socket:type1_combo']) connectors.push('CCS1');
  if (connectors.length === 0 && tags['socket:type2_cable']) connectors.push('Type2_AC');
  return connectors.length > 0 ? connectors : ['Unknown'];
}

function parseMaxPower(tags: Record<string, string>): number {
  for (const key of ['charging_station:output', 'capacity', 'maxpower']) {
    const val = tags[key];
    if (val) {
      const num = parseFloat(val);
      if (!isNaN(num) && num > 0) return num;
    }
  }
  for (const key of Object.keys(tags)) {
    if (key.startsWith('socket:') && key.endsWith(':output')) {
      const match = tags[key]?.match(/(\d+)/);
      if (match) return parseInt(match[1], 10);
    }
  }
  return 22;
}

function parseProvider(tags: Record<string, string>): { provider: string; isVinFast: boolean } {
  const operator = (tags['operator'] ?? tags['brand'] ?? tags['network'] ?? '').toLowerCase();
  if (operator.includes('vinfast') || operator.includes('v-green') || operator.includes('vgreen')) {
    return { provider: 'VinFast', isVinFast: true };
  }
  if (operator.includes('evercharge')) return { provider: 'EverCharge', isVinFast: false };
  if (operator.includes('evone')) return { provider: 'EVONE', isVinFast: false };
  if (operator.includes('evpower')) return { provider: 'EVPower', isVinFast: false };
  if (operator.includes('charge+')) return { provider: 'CHARGE+', isVinFast: false };
  if (operator) return { provider: operator.slice(0, 50), isVinFast: false };
  return { provider: 'Other', isVinFast: false };
}

function inferProvince(lat: number): string {
  if (lat > 20.5) return 'Northern Vietnam';
  if (lat > 15.5) return 'Central Vietnam';
  if (lat > 11.5) return 'Central Highlands';
  if (lat > 10.5) return 'Southern Vietnam';
  return 'Mekong Delta';
}

export async function GET(request: NextRequest) {
  // Verify cron secret in production
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('CRON_SECRET environment variable is not set');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const expectedToken = `Bearer ${cronSecret}`;
  const providedToken = authHeader ?? '';
  const isValid =
    expectedToken.length === providedToken.length &&
    timingSafeEqual(Buffer.from(expectedToken), Buffer.from(providedToken));

  if (!isValid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const query = `[out:json][timeout:30];node["amenity"="charging_station"](${VIETNAM_BBOX});out body;`;
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.status}`);
    }

    const data = await response.json();
    const elements: Array<{ id: number; lat: number; lon: number; tags?: Record<string, string> }> =
      data.elements ?? [];

    let upserted = 0;
    let skippedVinFast = 0;

    // Load VinFast station coordinates to avoid overwriting them with inferior OSM data
    const vinfastStations = await prisma.chargingStation.findMany({
      where: { ocmId: { startsWith: 'vinfast-' } },
      select: { latitude: true, longitude: true },
    });

    for (const el of elements) {
      const tags = el.tags ?? {};
      const name = tags['name'] ?? tags['operator'] ?? `OSM Station #${el.id}`;

      // Skip e-bike only stations
      if (name.toLowerCase().includes('e-bike') && !tags['motorcar']) continue;

      // Skip if this station is near an existing VinFast-sourced entry (within 50m)
      const nearVinFast = vinfastStations.some((vf) => {
        const dLat = (el.lat - vf.latitude) * 111_320;
        const dLng = (el.lon - vf.longitude) * 111_320 * Math.cos((el.lat * Math.PI) / 180);
        return Math.sqrt(dLat * dLat + dLng * dLng) < 50;
      });
      if (nearVinFast) {
        skippedVinFast++;
        continue;
      }

      const connectorTypes = parseConnectorTypes(tags);
      const maxPower = parseMaxPower(tags);
      const { provider, isVinFast } = parseProvider(tags);
      const chargerTypes = connectorTypes.map(() =>
        maxPower >= 20 ? `DC_${maxPower}kW` : `AC_${maxPower}kW`,
      );
      const portCount = parseInt(tags['capacity'] ?? '1', 10) || 1;
      const ocmId = `osm-${el.id}`;

      await prisma.chargingStation.upsert({
        where: { ocmId },
        update: {
          name,
          address: tags['addr:street']
            ? `${tags['addr:housenumber'] ?? ''} ${tags['addr:street']}, ${tags['addr:city'] ?? ''}`.trim()
            : inferProvince(el.lat),
          province: tags['addr:city'] ?? tags['addr:province'] ?? inferProvince(el.lat),
          latitude: el.lat,
          longitude: el.lon,
          chargerTypes: JSON.stringify([...new Set(chargerTypes)]),
          connectorTypes: JSON.stringify([...new Set(connectorTypes)]),
          portCount,
          maxPowerKw: maxPower,
          stationType: 'public',
          isVinFastOnly: isVinFast,
          provider,
          scrapedAt: new Date(),
        },
        create: {
          ocmId,
          name,
          address: tags['addr:street']
            ? `${tags['addr:housenumber'] ?? ''} ${tags['addr:street']}, ${tags['addr:city'] ?? ''}`.trim()
            : inferProvince(el.lat),
          province: tags['addr:city'] ?? tags['addr:province'] ?? inferProvince(el.lat),
          latitude: el.lat,
          longitude: el.lon,
          chargerTypes: JSON.stringify([...new Set(chargerTypes)]),
          connectorTypes: JSON.stringify([...new Set(connectorTypes)]),
          portCount,
          maxPowerKw: maxPower,
          stationType: 'public',
          isVinFastOnly: isVinFast,
          provider,
          scrapedAt: new Date(),
        },
      });

      upserted++;
    }

    return NextResponse.json({
      success: true,
      stationsProcessed: upserted,
      skippedVinFast,
      totalFromOSM: elements.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Station refresh error:', error);
    return NextResponse.json({ error: 'Station refresh failed' }, { status: 500 });
  }
}