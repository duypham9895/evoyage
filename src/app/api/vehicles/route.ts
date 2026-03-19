import { NextRequest, NextResponse } from 'next/server';
import { VIETNAM_MODELS } from '@/lib/vietnam-models';
import { checkRateLimit, getClientIp, vehiclesLimiter } from '@/lib/rate-limit';
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
  // Rate limiting: 30 requests per minute per IP
  const ip = getClientIp(request);
  const limit = await checkRateLimit(`vehicles:${ip}`, 30, 60_000, vehiclesLimiter);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.',
        retryAfter: limit.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  const searchParams = request.nextUrl.searchParams;

  // Lookup single vehicle by ID (for URL sharing)
  const idParam = searchParams.get('id')?.slice(0, 100);
  if (idParam) {
    try {
      const { prisma } = await import('@/lib/prisma');
      const vehicle = await prisma.eVVehicle.findUnique({ where: { id: idParam } });
      if (vehicle) {
        const mapped: EVVehicleData = {
          id: vehicle.id, brand: vehicle.brand, model: vehicle.model,
          variant: vehicle.variant, modelYear: vehicle.modelYear, bodyType: vehicle.bodyType,
          segment: vehicle.segment, seats: vehicle.seats, doors: vehicle.doors,
          batteryCapacityKwh: vehicle.batteryCapacityKwh, usableBatteryKwh: vehicle.usableBatteryKwh,
          officialRangeKm: vehicle.officialRangeKm, rangeStandard: vehicle.rangeStandard,
          efficiencyWhPerKm: vehicle.efficiencyWhPerKm, dcMaxChargingPowerKw: vehicle.dcMaxChargingPowerKw,
          acChargingPowerKw: vehicle.acChargingPowerKw, chargingTimeDC_10to80_min: vehicle.chargingTimeDC_10to80_min,
          chargingPortType: vehicle.chargingPortType, powerKw: vehicle.powerKw, torqueNm: vehicle.torqueNm,
          driveType: vehicle.driveType, acceleration0to100: vehicle.acceleration0to100,
          topSpeedKmh: vehicle.topSpeedKmh, lengthMm: vehicle.lengthMm, widthMm: vehicle.widthMm,
          heightMm: vehicle.heightMm, wheelbaseMm: vehicle.wheelbaseMm, weightKg: vehicle.weightKg,
          cargoVolumeLiters: vehicle.cargoVolumeLiters, availableInVietnam: vehicle.availableInVietnam,
          priceVndMillions: vehicle.priceVndMillions, source: vehicle.source ?? 'crawled',
          isUserAdded: vehicle.isUserAdded,
        };
        return NextResponse.json(mapped);
      }
    } catch { /* fall through */ }

    // Fallback: search hardcoded models
    const fallback = VIETNAM_MODELS.find(v => v.id === idParam);
    if (fallback) return NextResponse.json(fallback);

    return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
  }

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
    if (isNaN(seatCount) || seatCount < 1 || seatCount > 20) {
      return NextResponse.json({ error: 'Invalid seats parameter (1-20)' }, { status: 400 });
    }
    filtered = filtered.filter((v) => v.seats === seatCount);
  }

  if (brand) {
    filtered = filtered.filter((v) => v.brand === brand);
  }

  if (minRange) {
    const min = parseFloat(minRange);
    if (isNaN(min) || !isFinite(min) || min < 0 || min > 2000) {
      return NextResponse.json({ error: 'Invalid minRange parameter (0-2000)' }, { status: 400 });
    }
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
