import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, getClientIp, stationsLimiter } from '@/lib/rate-limit';
import { safeJsonArray } from '@/lib/safe-json';
import { findStationsNearPoint, filterCompatibleStations } from '@/lib/routing/station-finder';
import { getEffectivePowerKw, calculateChargeTimeMin } from '@/lib/routing/station-ranker';
import type { ChargingStationData } from '@/types';

const NearbyRequest = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusKm: z.number().min(1).max(50).default(5),
  vehicleId: z.string().nullable().optional(),
  currentBattery: z.number().min(1).max(100).nullable().optional(),
});

export interface NearbyStationResult {
  readonly station: ChargingStationData;
  readonly distanceKm: number;
  readonly isCompatible: boolean;
  readonly estimatedChargeTimeMin: number | null;
}

/**
 * POST /api/stations/nearby — Find nearby stations with optional personalization.
 *
 * When vehicleId is provided: filters by compatibility, estimates charge time.
 * When vehicleId is absent: returns all stations, no charge time.
 */
export async function POST(request: NextRequest) {
  // Rate limit: shares counter with GET /api/stations
  const ip = getClientIp(request);
  const limit = await checkRateLimit(`stations:${ip}`, 30, 60_000, stationsLimiter);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.',
        retryAfter: limit.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = NearbyRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const { latitude, longitude, radiusKm, vehicleId, currentBattery } = parsed.data;

  // Bounding box pre-filter (1° ≈ 80-111 km)
  const degBuffer = radiusKm / 80;
  const minLat = latitude - degBuffer;
  const maxLat = latitude + degBuffer;
  const minLng = longitude - degBuffer;
  const maxLng = longitude + degBuffer;

  const rawStations = await prisma.chargingStation.findMany({
    where: {
      latitude: { gte: minLat, lte: maxLat },
      longitude: { gte: minLng, lte: maxLng },
    },
    take: 500,
  });

  const stations: ChargingStationData[] = rawStations.map((s) => ({
    ...s,
    chargerTypes: safeJsonArray(s.chargerTypes),
    connectorTypes: safeJsonArray(s.connectorTypes),
  })) as ChargingStationData[];

  // Find stations within radius, sorted by distance
  const nearbyStations = findStationsNearPoint(
    { lat: latitude, lng: longitude },
    stations,
    radiusKm,
  );

  // Look up vehicle data if provided
  let vehicleData: { batteryCapacityKwh: number; dcMaxChargingPowerKw: number | null; brand: string } | null = null;
  if (vehicleId) {
    const vehicle = await prisma.eVVehicle.findUnique({
      where: { id: vehicleId },
      select: { batteryCapacityKwh: true, dcMaxChargingPowerKw: true, brand: true },
    });
    if (vehicle) {
      vehicleData = vehicle;
    }
  }

  const isVinFastVehicle = vehicleData?.brand?.toLowerCase() === 'vinfast';

  // Filter by compatibility and compute charge times
  const compatibleStations = filterCompatibleStations(nearbyStations, isVinFastVehicle);

  const results: NearbyStationResult[] = nearbyStations.map((s) => {
    const isCompatible = compatibleStations.some((cs) => cs.id === s.id);

    let estimatedChargeTimeMin: number | null = null;
    if (vehicleData && currentBattery != null && currentBattery < 80) {
      const batteryCapacity = vehicleData.batteryCapacityKwh;
      const energyNeededKwh = (0.80 - currentBattery / 100) * batteryCapacity;
      const effectivePower = getEffectivePowerKw(s, vehicleData.dcMaxChargingPowerKw ?? undefined);
      estimatedChargeTimeMin = Math.round(calculateChargeTimeMin(energyNeededKwh, effectivePower));
    }

    return {
      station: {
        id: s.id,
        name: s.name,
        address: s.address,
        province: s.province,
        latitude: s.latitude,
        longitude: s.longitude,
        chargerTypes: s.chargerTypes,
        connectorTypes: s.connectorTypes,
        portCount: s.portCount,
        maxPowerKw: s.maxPowerKw,
        stationType: s.stationType,
        isVinFastOnly: s.isVinFastOnly,
        operatingHours: s.operatingHours,
        provider: s.provider,
        chargingStatus: s.chargingStatus,
        parkingFee: s.parkingFee,
      },
      distanceKm: Math.round(s.distanceKm * 10) / 10,
      isCompatible,
      estimatedChargeTimeMin,
    };
  });

  return NextResponse.json({ stations: results, count: results.length });
}
