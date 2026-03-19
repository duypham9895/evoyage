import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, getClientIp, routeLimiter } from '@/lib/rate-limit';
import { isValidCoordinate, COORDINATE_ERROR_EN } from '@/lib/coordinate-validation';
import { fetchDirections, fetchDirectionsWithWaypoints } from '@/lib/osrm';
import { fetchDirectionsGoogle } from '@/lib/google-directions';
import { fetchDirectionsMapbox } from '@/lib/mapbox-directions';
import { planChargingStops, findChargingDecisionPoints } from '@/lib/route-planner';
import { decodePolyline, encodePolyline } from '@/lib/polyline';
import { getCachedRoute, setCachedRoute } from '@/lib/route-cache';
import { fetchMatrixDurations } from '@/lib/matrix-api';
import { getEffectivePowerKw, scoreStation, rankStations } from '@/lib/station-ranker';
import { estimateDetourTimeSec, type StationWithRouteInfo } from '@/lib/station-finder';
import { cacheTripPlan } from '@/lib/trip-cache';
import { safeJsonArray } from '@/lib/safe-json';
import type { ChargingStationData, ChargingStop, ChargingStopWithAlternatives, TripPlan, RankedStation } from '@/types';

const routeRequestSchema = z.object({
  start: z.string().min(1).max(200),
  end: z.string().min(1).max(200),
  startLat: z.number().optional(),
  startLng: z.number().optional(),
  endLat: z.number().optional(),
  endLng: z.number().optional(),
  vehicleId: z.string().min(1).max(36).regex(/^[a-z0-9]+$/).nullable(),
  customVehicle: z
    .object({
      brand: z.string().min(1).max(100),
      model: z.string().min(1).max(100),
      batteryCapacityKwh: z.number().positive(),
      officialRangeKm: z.number().positive(),
      chargingTimeDC_10to80_min: z.number().positive().optional(),
      chargingPortType: z.string().max(50).optional(),
    })
    .nullable(),
  currentBatteryPercent: z.number().min(10).max(100),
  minArrivalPercent: z.number().min(5).max(30),
  rangeSafetyFactor: z.number().min(0.5).max(1.0),
  provider: z.enum(['osrm', 'mapbox', 'google']).default('osrm'),
  waypoints: z.array(z.object({
    lat: z.number().min(0).max(30),
    lng: z.number().min(95).max(115),
    name: z.string().max(200).optional(),
  })).max(5).optional().default([]),
});

/**
 * POST /api/route — Calculate a trip plan with charging stops.
 * Supports both OSRM and Google Directions providers.
 */
export async function POST(request: NextRequest) {
  // Rate limiting: 10 requests per minute per IP
  const ip = getClientIp(request);
  const limit = await checkRateLimit(`route:${ip}`, 10, 60_000, routeLimiter);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Bạn đang gửi yêu cầu quá nhanh. Vui lòng thử lại sau.',
        error_en: 'Too many requests. Please try again later.',
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
    waypoints,
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
      // Validate coordinates within Southeast Asia bounds
      if (!isValidCoordinate(startLat, startLng) || !isValidCoordinate(endLat, endLng)) {
        return NextResponse.json(
          { error: COORDINATE_ERROR_EN },
          { status: 400 },
        );
      }
    }

    // Get route from selected provider
    let directions;
    const hasWaypoints = waypoints && waypoints.length > 0;
    if (provider === 'google') {
      const cached = hasWaypoints ? null : await getCachedRoute(startLat!, startLng!, endLat!, endLng!, 'google');
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
          waypoints,
        );
        if (!hasWaypoints) {
          await setCachedRoute(startLat!, startLng!, endLat!, endLng!, 'google', {
            polyline: directions.polyline,
            distanceMeters: directions.distanceMeters,
            durationSeconds: directions.durationSeconds,
          });
        }
      }
    } else if (provider === 'mapbox') {
      const cached = hasWaypoints ? null : await getCachedRoute(startLat!, startLng!, endLat!, endLng!, 'mapbox');
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
          waypoints,
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
        if (!hasWaypoints) {
          await setCachedRoute(startLat!, startLng!, endLat!, endLng!, 'mapbox', {
            polyline: normalizedPolyline,
            distanceMeters: directions.distanceMeters,
            durationSeconds: directions.durationSeconds,
          });
        }
      }
    } else {
      if (waypoints && waypoints.length > 0) {
        directions = await fetchDirectionsWithWaypoints(start, end, waypoints);
      } else {
        directions = await fetchDirections(start, end);
      }
    }

    if (!directions) {
      return NextResponse.json(
        { error: 'Failed to get directions from provider' },
        { status: 502 },
      );
    }

    const totalDistanceKm = directions.distanceMeters / 1000;
    const totalDurationMin = Math.round(directions.durationSeconds / 60);

    // Get charging stations within route corridor bounding box
    const routePoints = decodePolyline(directions.polyline);

    if (routePoints.length === 0) {
      return NextResponse.json(
        { error: 'Route polyline is empty — the directions provider returned no path' },
        { status: 502 },
      );
    }

    // Use reduce instead of Math.min/max(...array) to avoid stack overflow
    // on large polylines (V8 limits spread to ~65K arguments)
    const BUFFER_DEG = 0.5; // ~55km buffer around route corridor
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (const p of routePoints) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }
    minLat -= BUFFER_DEG;
    maxLat += BUFFER_DEG;
    minLng -= BUFFER_DEG;
    maxLng += BUFFER_DEG;

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
      chargingStatus: s.chargingStatus ?? null,
      parkingFee: s.parkingFee ?? null,
    }));

    // Filter out stations that are unavailable or inactive
    const EXCLUDED_STATUSES = new Set(['UNAVAILABLE', 'INACTIVE']);
    const availableStations = stations.filter((s) => {
      const status = s.chargingStatus?.toUpperCase();
      return !status || !EXCLUDED_STATUSES.has(status);
    });

    // Smart station ranking: corridor scoring + Matrix API fallback
    let rankedStationsPerStop: ReadonlyMap<number, readonly RankedStation[]> | undefined;
    const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;

    const planInput = {
      encodedPolyline: directions.polyline,
      totalDistanceKm,
      vehicle,
      currentBatteryPercent,
      minArrivalPercent,
      rangeSafetyFactor,
      stations: availableStations,
    };

    // Pre-compute decision points once (shared between ranking and planning)
    const decisionPoints = availableStations.length > 0
      ? findChargingDecisionPoints(planInput)
      : [];

    if (decisionPoints.length > 0) {
      const isVinFast = vehicle.brand.toLowerCase() === 'vinfast';
      const vehicleMaxChargeKw = ('dcMaxChargingPowerKw' in vehicle && vehicle.dcMaxChargingPowerKw)
        ? vehicle.dcMaxChargingPowerKw as number
        : undefined;
      const energyToCharge = vehicle.batteryCapacityKwh * 0.6; // rough: 20% → 80%

      const rankedMap = new Map<number, readonly RankedStation[]>();

      for (let dpIdx = 0; dpIdx < decisionPoints.length; dpIdx++) {
        const dp = decisionPoints[dpIdx];
        if (dp.candidates.length === 0) continue;

        try {
          if (dp.useCorridorScoring) {
            // Corridor candidates: estimate detour from distance-to-route
            // This avoids Matrix API bias for stations spread along the route
            const scored = dp.candidates.map((station) => {
              const routeInfo = station as StationWithRouteInfo;
              const detourSec = routeInfo.distanceToRouteKm !== undefined
                ? estimateDetourTimeSec(routeInfo.distanceToRouteKm)
                : 300; // fallback: 5 min

              return scoreStation({
                detourDriveTimeSec: detourSec,
                stationPowerKw: getEffectivePowerKw(station, vehicleMaxChargeKw),
                energyNeededKwh: energyToCharge,
                isVinFastStation: station.isVinFastOnly,
                isVinFastVehicle: isVinFast,
                vehicleMaxChargeKw,
                station,
              });
            });

            const ranked = rankStations(scored);
            rankedMap.set(dpIdx, ranked);
          } else if (mapboxToken) {
            // Non-corridor (fallback) candidates: use Matrix API for actual drive times
            const matrix = await fetchMatrixDurations(
              dp.point,
              dp.candidates.map(s => ({ lat: s.latitude, lng: s.longitude })),
              mapboxToken,
            );

            const scored = dp.candidates.map((station, j) =>
              scoreStation({
                detourDriveTimeSec: matrix.durations[j] ?? 0,
                stationPowerKw: getEffectivePowerKw(station, vehicleMaxChargeKw),
                energyNeededKwh: energyToCharge,
                isVinFastStation: station.isVinFastOnly,
                isVinFastVehicle: isVinFast,
                vehicleMaxChargeKw,
                station,
              }),
            );

            const ranked = rankStations(scored);
            rankedMap.set(dpIdx, ranked);
          }
        } catch (scoringError) {
          console.error('Station scoring error at decision point', dpIdx, scoringError);
        }
      }

      if (rankedMap.size > 0) {
        rankedStationsPerStop = rankedMap;
      }
    }

    // Plan charging stops (uses ranked stations if available, else haversine)
    const plan = planChargingStops({
      encodedPolyline: directions.polyline,
      totalDistanceKm,
      vehicle,
      currentBatteryPercent,
      minArrivalPercent,
      rangeSafetyFactor,
      stations: availableStations,
      rankedStationsPerStop,
      precomputedDecisionPoints: decisionPoints,
    });

    const totalChargingTimeMin = plan.chargingStops.reduce(
      (sum, stop: ChargingStop | ChargingStopWithAlternatives) =>
        sum + ('selected' in stop ? Math.round(stop.selected.estimatedChargeTimeMin) : stop.estimatedChargingTimeMin),
      0,
    );

    // Generate tripId from route parameters for caching
    const tripIdInput = JSON.stringify({
      start, end, vehicleId,
      customVehicle: customVehicle ? `${customVehicle.brand}-${customVehicle.model}-${customVehicle.batteryCapacityKwh}` : null,
      currentBatteryPercent, minArrivalPercent, rangeSafetyFactor, provider,
    });
    const tripId = createHash('sha256').update(tripIdInput).digest('hex').slice(0, 16);

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
      tripId,
    };

    // Cache trip plan for share card generation
    cacheTripPlan(tripId, tripPlan);

    return NextResponse.json(tripPlan);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('Route calculation error:', { message, stack, provider });

    // Return specific error messages for known failure modes
    if (message.includes('timeout') || message.includes('abort')) {
      return NextResponse.json(
        { error: 'Route provider timed out. Please try again or switch to a different map provider.' },
        { status: 504 },
      );
    }
    if (message.includes('No route found')) {
      return NextResponse.json(
        { error: 'No driving route found between these locations. Please check your start and end points.' },
        { status: 422 },
      );
    }
    if (message.includes('Location not found')) {
      return NextResponse.json(
        { error: message },
        { status: 422 },
      );
    }
    if (message.includes('API error') || message.includes('routing error')) {
      return NextResponse.json(
        { error: `Directions service error: ${message}` },
        { status: 502 },
      );
    }

    return NextResponse.json({ error: 'Route calculation failed. Please try again.' }, { status: 500 });
  }
}
