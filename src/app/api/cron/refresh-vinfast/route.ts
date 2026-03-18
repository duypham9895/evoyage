import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyCronSecret } from '@/lib/cron-auth';

/**
 * GET /api/cron/refresh-vinfast — Vercel Cron endpoint.
 * Fetches latest VinFast car charging stations from finaldivision API.
 * Runs daily at 01:00 UTC (configured in vercel.json).
 *
 * Deduplication: VinFast stations use `vinfast-{store_id}` as ocmId.
 * Nearby OSM/GMaps stations within 50m are merged (VinFast data wins).
 */

const VINFAST_CAR_API = 'https://api.service.finaldivision.com/stations/charging-stations';
const DEDUP_RADIUS_M = 50;

interface VinFastStation {
  readonly store_id: string;
  readonly name: string;
  readonly address: string;
  readonly lat: string;
  readonly lng: string;
  readonly province_id: string;
  readonly access_type: string;
  readonly charging_publish: boolean;
  readonly charging_status: string;
  readonly category_slug: string;
  readonly open_time_service: string;
  readonly close_time_service: string;
  readonly parking_fee: boolean;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const response = await fetch(VINFAST_CAR_API, {
      headers: { 'Accept-Encoding': 'gzip, deflate' },
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      throw new Error(`VinFast API error: ${response.status}`);
    }

    const stations: VinFastStation[] = await response.json();

    const valid = stations.filter((s) => {
      const lat = parseFloat(s.lat);
      const lng = parseFloat(s.lng);
      if (isNaN(lat) || isNaN(lng)) return false;
      if (lat < 8.0 || lat > 23.5 || lng < 102.0 || lng > 110.0) return false;
      return (
        s.charging_publish &&
        s.category_slug === 'car_charging_station' &&
        s.charging_status !== 'OUTOFSERVICE'
      );
    });

    // Load existing stations for geo-dedup
    const existing = await prisma.chargingStation.findMany({
      select: { id: true, ocmId: true, latitude: true, longitude: true },
    });

    let created = 0;
    let updated = 0;
    let merged = 0;

    for (const s of valid) {
      const lat = parseFloat(s.lat);
      const lng = parseFloat(s.lng);
      const vinfastOcmId = `vinfast-${s.store_id}`;
      const operatingHours =
        s.open_time_service && s.close_time_service
          ? `${s.open_time_service} - ${s.close_time_service}`
          : null;

      const stationData = {
        name: s.name,
        address: s.address,
        province: s.province_id,
        latitude: lat,
        longitude: lng,
        chargerTypes: JSON.stringify(['DC_150kW', 'AC_11kW']),
        connectorTypes: JSON.stringify(['CCS2', 'Type2_AC']),
        portCount: 4,
        maxPowerKw: 150,
        stationType: s.access_type === 'Restricted' ? 'restricted' : 'public',
        isVinFastOnly: true,
        provider: 'VinFast',
        operatingHours,
        scrapedAt: new Date(),
      };

      // Check existing VinFast entry
      const existingByOcmId = existing.find((e) => e.ocmId === vinfastOcmId);
      if (existingByOcmId) {
        await prisma.chargingStation.update({ where: { id: existingByOcmId.id }, data: stationData });
        updated++;
        continue;
      }

      // Check nearby duplicate from OSM/GMaps
      const nearbyDuplicate = existing.find((e) => {
        if (e.ocmId?.startsWith('vinfast-')) return false;
        return haversineMeters(lat, lng, e.latitude, e.longitude) < DEDUP_RADIUS_M;
      });

      if (nearbyDuplicate) {
        await prisma.chargingStation.update({
          where: { id: nearbyDuplicate.id },
          data: { ...stationData, ocmId: vinfastOcmId },
        });
        nearbyDuplicate.ocmId = vinfastOcmId;
        merged++;
        continue;
      }

      // New station
      await prisma.chargingStation.create({ data: { ocmId: vinfastOcmId, ...stationData } });
      existing.push({ id: '', ocmId: vinfastOcmId, latitude: lat, longitude: lng });
      created++;
    }

    return NextResponse.json({
      success: true,
      source: 'vinfast',
      totalFromAPI: stations.length,
      validStations: valid.length,
      created,
      updated,
      merged,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('VinFast refresh error:', error);
    return NextResponse.json({ error: 'VinFast refresh failed' }, { status: 500 });
  }
}
