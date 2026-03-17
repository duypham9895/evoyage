import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { fetchDirections } from '@/lib/osrm';
import { planChargingStops } from '@/lib/route-planner';
import type { ChargingStationData, TripPlan } from '@/types';

const routeRequestSchema = z.object({
  start: z.string().min(1).max(200),
  end: z.string().min(1).max(200),
  vehicleId: z.string().nullable(),
  customVehicle: z
    .object({
      brand: z.string().min(1),
      model: z.string().min(1),
      batteryCapacityKwh: z.number().positive(),
      officialRangeKm: z.number().positive(),
      chargingTimeDC_10to80_min: z.number().positive().optional(),
      chargingPortType: z.string().optional(),
    })
    .nullable(),
  currentBatteryPercent: z.number().min(10).max(100),
  minArrivalPercent: z.number().min(5).max(30),
  rangeSafetyFactor: z.number().min(0.5).max(1.0),
});

/**
 * POST /api/route — Calculate a trip plan with charging stops.
 */
export async function POST(request: NextRequest) {
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
    vehicleId,
    customVehicle,
    currentBatteryPercent,
    minArrivalPercent,
    rangeSafetyFactor,
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
    // Get route from OSRM
    const directions = await fetchDirections(start, end);
    const totalDistanceKm = directions.distanceMeters / 1000;
    const totalDurationMin = Math.round(directions.durationSeconds / 60);

    // Get all charging stations from DB
    const dbStations = await prisma.chargingStation.findMany();
    const stations: ChargingStationData[] = dbStations.map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      province: s.province,
      latitude: s.latitude,
      longitude: s.longitude,
      chargerTypes: JSON.parse(s.chargerTypes) as string[],
      connectorTypes: JSON.parse(s.connectorTypes) as string[],
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
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Route calculation error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
