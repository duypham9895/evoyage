import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { fetchDirections } from '@/lib/osrm';
import { fetchDirectionsGoogle } from '@/lib/google-directions';
import { fetchDirectionsMapbox } from '@/lib/mapbox-directions';
import { planChargingStops } from '@/lib/route-planner';
import { decodePolyline, encodePolyline } from '@/lib/polyline';
import { getCachedRoute, setCachedRoute } from '@/lib/route-cache';
import type { ChargingStationData, TripPlan } from '@/types';

function safeJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

const routeRequestSchema = z.object({
  start: z.string().min(1).max(200),
  end: z.string().min(1).max(200),
  startLat: z.number().optional(),
  startLng: z.number().optional(),
  endLat: z.number().optional(),
  endLng: z.number().optional(),
  vehicleId: z.string().min(1).max(100).nullable(),
  customVehicle: z
    .object({
      brand: z.string().min(1).max(100),
      model: z.string().min(1).max(100),
      batteryCapacityKwh: z.number().positive(),
      officialRangeKm: z.number().positive(),
      chargingTimeDC_10to80_min: z.number().positive().optional(),
      chargingPortType: z.string().optional(),
    })
    .nullable(),
  currentBatteryPercent: z.number().min(10).max(100),
  minArrivalPercent: z.number().min(5).max(30),
  rangeSafetyFactor: z.number().min(0.5).max(1.0),
  provider: z.enum(['osrm', 'mapbox', 'google']).default('osrm'),
});

/**
 * POST /api/route — Calculate a trip plan with charging stops.
 * Supports both OSRM and Google Directions providers.
 */
export async function POST(request: NextRequest) {
  // Rate limiting: 10 requests per minute per IP
  const ip = getClientIp(request);
  const limit = checkRateLimit(`route:${ip}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = routeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const {
    start,
    end,
    startLat,
    startLng,
    endLat,
    endLng,
    vehicleId,
    customVehicle,
    currentBatteryPercent,
    minArrivalPercent,
    rangeSafetyFactor,
    provider,
  } = parsed.data;

  // Resolve vehicle
  let vehicle: {
    brand: string;
    model: string;
    variant: string | null;
    officialRangeKm: number;
    batteryCapacityKwh: number;
    chargingTimeDC_10to80_min: number | null;
  };

  if (vehicleId) {
    const dbVehicle = await prisma.eVVehicle.findUnique({
      where: { id: vehicleId },
    });
    if (!dbVehicle) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
    }
    vehicle = {
      brand: dbVehicle.brand,
      model: dbVehicle.model,
      variant: dbVehicle.variant,
      officialRangeKm: dbVehicle.officialRangeKm,
      batteryCapacityKwh: dbVehicle.batteryCapacityKwh,
      chargingTimeDC_10to80_min: dbVehicle.chargingTimeDC_10to80_min,
    };
  } else if (customVehicle) {
    vehicle = {
      brand: customVehicle.brand,
      model: customVehicle.model,
      variant: null,
      officialRangeKm: customVehicle.officialRangeKm,
      batteryCapacityKwh: customVehicle.batteryCapacityKwh,
      chargingTimeDC_10to80_min: customVehicle.chargingTimeDC_10to80_min ?? null,
    };
  } else {
    return NextResponse.json(
      { error: 'Either vehicleId or customVehicle must be provided' },
      { status: 400 },
    );
  }

  try {
    // Shared coordinate validation for Google and Mapbox
    if (provider !== 'osrm') {
      if (startLat == null || startLng == null || endLat == null || endLng == null) {
        return NextResponse.json(
          { error: `${provider === 'google' ? 'Google' : 'Mapbox'} mode requires coordinates — select locations from the autocomplete dropdown` },
          { status: 400 },
        );
      }
    }

    // Get route from selected provider
    let directions;
    if (provider === 'google') {
      const cached = await getCachedRoute(startLat!, startLng!, endLat!, endLng!, 'google');
      if (cached) {
        directions = {
          polyline: cached.polyline,
          distanceMeters: cached.distanceMeters,
          durationSeconds: cached.durationSeconds,
          startAddress: start,
          endAddress: end,
        };
      } else {
        const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
        if (!googleApiKey) {
          return NextResponse.json(
            { error: 'Google Maps API key not configured on server' },
            { status: 500 },
          );
        }
        directions = await fetchDirectionsGoogle(
          startLat!, startLng!, endLat!, endLng!,
          googleApiKey,
        );
        await setCachedRoute(startLat!, startLng!, endLat!, endLng!, 'google', {
          polyline: directions.polyline,
          distanceMeters: directions.distanceMeters,
          durationSeconds: directions.durationSeconds,
        });
      }
    } else if (provider === 'mapbox') {
      const cached = await getCachedRoute(startLat!, startLng!, endLat!, endLng!, 'mapbox');
      if (cached) {
        directions = {
          polyline: cached.polyline,
          distanceMeters: cached.distanceMeters,
          durationSeconds: cached.durationSeconds,
          startAddress: start,
          endAddress: end,
        };
      } else {
        const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
        if (!mapboxToken) {
          return NextResponse.json(
            { error: 'Mapbox access token not configured on server' },
            { status: 500 },
          );
        }
        const mapboxResult = await fetchDirectionsMapbox(
          startLat!, startLng!, endLat!, endLng!,
          mapboxToken,
        );
        // Normalize precision-6 polyline to precision-5 for uniform downstream use
        const decoded = decodePolyline(mapboxResult.polyline, 6);
        const normalizedPolyline = encodePolyline(decoded, 5);

        directions = {
          polyline: normalizedPolyline,
          distanceMeters: mapboxResult.distanceMeters,
          durationSeconds: mapboxResult.durationSeconds,
          startAddress: mapboxResult.startAddress,
          endAddress: mapboxResult.endAddress,
        };
        await setCachedRoute(startLat!, startLng!, endLat!, endLng!, 'mapbox', {
          polyline: normalizedPolyline,
          distanceMeters: directions.distanceMeters,
          durationSeconds: directions.durationSeconds,
        });
      }
    } else {
      directions = await fetchDirections(start, end);
    }

    const totalDistanceKm = directions.distanceMeters / 1000;
    const totalDurationMin = Math.round(directions.durationSeconds / 60);

    // Get charging stations within route corridor bounding box
    const routePoints = decodePolyline(directions.polyline);
    const lats = routePoints.map(p => p.lat);
    const lngs = routePoints.map(p => p.lng);
    const BUFFER_DEG = 0.5; // ~55km buffer around route corridor
    const minLat = Math.min(...lats) - BUFFER_DEG;
    const maxLat = Math.max(...lats) + BUFFER_DEG;
    const minLng = Math.min(...lngs) - BUFFER_DEG;
    const maxLng = Math.max(...lngs) + BUFFER_DEG;

    const dbStations = await prisma.chargingStation.findMany({
      where: {
        latitude: { gte: minLat, lte: maxLat },
        longitude: { gte: minLng, lte: maxLng },
      },
    });
    const stations: ChargingStationData[] = dbStations.map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      province: s.province,
      latitude: s.latitude,
      longitude: s.longitude,
      chargerTypes: safeJsonArray(s.chargerTypes),
      connectorTypes: safeJsonArray(s.connectorTypes),
      portCount: s.portCount,
      maxPowerKw: s.maxPowerKw,
      stationType: s.stationType as 'public' | 'private',
      isVinFastOnly: s.isVinFastOnly,
      operatingHours: s.operatingHours,
      provider: s.provider,
    }));

    // Plan charging stops
    const plan = planChargingStops({
      encodedPolyline: directions.polyline,
      totalDistanceKm,
      vehicle,
      currentBatteryPercent,
      minArrivalPercent,
      rangeSafetyFactor,
      stations,
    });

    const totalChargingTimeMin = plan.chargingStops.reduce(
      (sum, stop) => sum + stop.estimatedChargingTimeMin,
      0,
    );

    const tripPlan: TripPlan = {
      totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
      totalDurationMin,
      chargingStops: plan.chargingStops,
      warnings: plan.warnings,
      batterySegments: plan.batterySegments,
      arrivalBatteryPercent: plan.arrivalBatteryPercent,
      totalChargingTimeMin,
      polyline: directions.polyline,
      startAddress: directions.startAddress,
      endAddress: directions.endAddress,
    };

    return NextResponse.json(tripPlan);
  } catch (error) {
    console.error('Route calculation error:', error);
    return NextResponse.json({ error: 'Route calculation failed. Please try again.' }, { status: 500 });
  }
}
