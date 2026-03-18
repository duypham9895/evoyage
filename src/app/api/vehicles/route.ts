import { NextRequest, NextResponse } from 'next/server';
import { VIETNAM_MODELS } from '@/lib/vietnam-models';
import type { EVVehicleData } from '@/types';

/**
 * GET /api/vehicles — Search and filter the EV vehicle database.
 *
 * Falls back to hardcoded Vietnam models when DB is unavailable.
 *
 * Query params:
 *   q          - Search query (brand or model name)
 *   vietnamOnly - "true" (default) to show only Vietnam vehicles
 *   bodyType   - Filter by body type (SUV, Sedan, Hatchback, etc.)
 *   seats      - Filter by seat count
 *   brand      - Filter by brand
 *   minRange   - Filter by minimum official range (km)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const query = (searchParams.get('q') ?? '').slice(0, 200).toLowerCase();
  const vietnamOnly = searchParams.get('vietnamOnly') !== 'false';
  const bodyType = searchParams.get('bodyType')?.slice(0, 50) ?? null;
  const seats = searchParams.get('seats');
  const brand = searchParams.get('brand')?.slice(0, 100) ?? null;
  const minRange = searchParams.get('minRange');

  // Try DB first, fall back to hardcoded data
  let vehicles: readonly EVVehicleData[] = [];

  try {
    const { prisma } = await import('@/lib/prisma');
    const dbVehicles = await prisma.eVVehicle.findMany({
      orderBy: [
        { availableInVietnam: 'desc' },
        { brand: 'asc' },
        { model: 'asc' },
        { variant: 'asc' },
      ],
    });

    if (dbVehicles.length > 0) {
      vehicles = dbVehicles.map((v) => ({
        id: v.id,
        brand: v.brand,
        model: v.model,
        variant: v.variant,
        modelYear: v.modelYear,
        bodyType: v.bodyType,
        segment: v.segment,
        seats: v.seats,
        doors: v.doors,
        batteryCapacityKwh: v.batteryCapacityKwh,
        usableBatteryKwh: v.usableBatteryKwh,
        officialRangeKm: v.officialRangeKm,
        rangeStandard: v.rangeStandard,
        efficiencyWhPerKm: v.efficiencyWhPerKm,
        dcMaxChargingPowerKw: v.dcMaxChargingPowerKw,
        acChargingPowerKw: v.acChargingPowerKw,
        chargingTimeDC_10to80_min: v.chargingTimeDC_10to80_min,
        chargingPortType: v.chargingPortType,
        powerKw: v.powerKw,
        torqueNm: v.torqueNm,
        driveType: v.driveType,
        acceleration0to100: v.acceleration0to100,
        topSpeedKmh: v.topSpeedKmh,
        lengthMm: v.lengthMm,
        widthMm: v.widthMm,
        heightMm: v.heightMm,
        wheelbaseMm: v.wheelbaseMm,
        weightKg: v.weightKg,
        cargoVolumeLiters: v.cargoVolumeLiters,
        availableInVietnam: v.availableInVietnam,
        priceVndMillions: v.priceVndMillions,
        source: v.source ?? 'crawled',
        isUserAdded: v.isUserAdded,
      }));
    }
  } catch (err) {
    console.error('DB query failed, using fallback:', err);
  }

  // Fallback: use hardcoded Vietnam models if DB returned nothing
  if (vehicles.length === 0) {
    vehicles = VIETNAM_MODELS;
  }

  // Apply filters in-memory
  let filtered = [...vehicles];

  if (vietnamOnly) {
    filtered = filtered.filter((v) => v.availableInVietnam);
  }

  if (bodyType) {
    filtered = filtered.filter((v) => v.bodyType === bodyType);
  }

  if (seats) {
    const seatCount = parseInt(seats, 10);
    filtered = filtered.filter((v) => v.seats === seatCount);
  }

  if (brand) {
    filtered = filtered.filter((v) => v.brand === brand);
  }

  if (minRange) {
    const min = parseFloat(minRange);
    filtered = filtered.filter((v) => v.officialRangeKm >= min);
  }

  if (query) {
    filtered = filtered.filter((v) => {
      const searchable = `${v.brand} ${v.model} ${v.variant ?? ''}`.toLowerCase();
      return searchable.includes(query);
    });
  }

  return NextResponse.json({ vehicles: filtered, count: filtered.length });
}
