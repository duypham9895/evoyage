import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, getClientIp, eviLimiter } from '@/lib/rate-limit';
import { EViParseRequest } from '@/lib/evi/types';
import type { EViParseResponse, FollowUpType, SuggestedOption, EViTripParams } from '@/lib/evi/types';
import { parseTrip } from '@/lib/evi/minimax-client';
import { LLMUnavailableError } from '@/lib/evi/llm-module';
import { resolveVehicle } from '@/lib/evi/vehicle-resolver';
import { searchPlaces } from '@/lib/geo/nominatim';
import { VIETNAM_MODELS } from '@/lib/vietnam-models';

export const maxDuration = 60;

const MAX_FOLLOW_UPS = 2;

const DEFAULT_BATTERY = 80;
const DEFAULT_MIN_ARRIVAL = 15;
const DEFAULT_RANGE_SAFETY_FACTOR = 0.80;

const vehicleListText = VIETNAM_MODELS
  .map(v => `${v.brand} ${v.model}${v.variant ? ` ${v.variant}` : ''} (${v.batteryCapacityKwh} kWh, ${v.officialRangeKm} km)`)
  .join('\n');

export async function POST(request: NextRequest) {
  // Rate limit
  const ip = getClientIp(request);
  const limit = await checkRateLimit(`evi:${ip}`, 20, 60_000, eviLimiter);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests', retryAfter: limit.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  // Validate input
  const body = await request.json().catch(() => null);
  const parsed = EViParseRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }

  const { message, history, userLocation, previousVehicleId, accumulatedParams } = parsed.data;
  const followUpCount = Math.floor(history.length / 2);

  // Call eVi parser (provider chain owned by lib/evi/llm-module.ts; see ADR-0002)
  let extraction;
  try {
    extraction = await parseTrip({ message, history, vehicleListText, accumulatedParams: accumulatedParams ?? null });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorType = err instanceof LLMUnavailableError ? 'both_providers_failed' : 'unexpected';
    console.error(`[eVi] parseTrip failed (${errorType}):`, errorMessage);
    return NextResponse.json(
      buildErrorResponse('service_unavailable', followUpCount),
      { status: 503 },
    );
  }

  // Station search request
  if (extraction.isStationSearch) {
    return NextResponse.json(buildResponse({
      isComplete: false,
      isStationSearch: true,
      followUpType: null,
      displayMessage: extraction.followUpQuestion ?? 'Đang tìm trạm sạc gần bạn...',
      followUpQuestion: null,
      followUpCount,
      stationSearchParams: extraction.stationSearchParams ?? { radiusKm: 5, minPowerKw: null },
    }));
  }

  // Non-trip request
  if (!extraction.isTripRequest) {
    return NextResponse.json(buildResponse({
      isComplete: false,
      followUpType: 'free_text',
      displayMessage: extraction.followUpQuestion ?? 'Bạn muốn đi đâu? Hãy mô tả chuyến đi của bạn.',
      followUpQuestion: extraction.followUpQuestion,
      followUpCount,
    }));
  }

  // Outside Vietnam
  if (extraction.isOutsideVietnam) {
    return NextResponse.json(buildResponse({
      isComplete: false,
      followUpType: 'free_text',
      displayMessage: 'eVi hiện chỉ hỗ trợ các chuyến đi trong Việt Nam. Bạn muốn đi đâu trong Việt Nam?',
      followUpQuestion: 'Bạn muốn đi đâu trong Việt Nam?',
      followUpCount,
    }));
  }

  // Vehicle resolution + end-location geocoding are independent — run in parallel.
  const [vehicleResolutionInitial, endPlaces] = await Promise.all([
    resolveVehicle(extraction.vehicleBrand, extraction.vehicleModel),
    extraction.endLocation
      ? searchPlaces(extraction.endLocation).catch(() => [])
      : Promise.resolve([]),
  ]);

  let vehicleResolution = vehicleResolutionInitial;
  if (vehicleResolution.type === 'not_found' && previousVehicleId) {
    const previousVehicle = VIETNAM_MODELS.find(v => v.id === previousVehicleId);
    if (previousVehicle) {
      vehicleResolution = { type: 'match', vehicle: previousVehicle };
    }
  }

  let endLat: number | null = null;
  let endLng: number | null = null;
  let endDisplay: string | null = extraction.endLocation;
  if (endPlaces.length > 0) {
    endLat = endPlaces[0].lat;
    endLng = endPlaces[0].lng;
    endDisplay = endPlaces[0].displayName;
  }

  // Reverse geocode user location for readable address
  let startDisplay: string | null = extraction.startLocation;
  let startLat: number | null = null;
  let startLng: number | null = null;
  let startSource: 'geolocation' | 'parsed' | null = null;

  if (userLocation) {
    startLat = userLocation.lat;
    startLng = userLocation.lng;
    startSource = 'geolocation';

    if (!startDisplay) {
      try {
        const reverseUrl = `https://nominatim.openstreetmap.org/reverse?lat=${userLocation.lat}&lon=${userLocation.lng}&format=json&accept-language=vi&zoom=16`;
        const reverseRes = await fetch(reverseUrl, {
          headers: { 'User-Agent': 'EVoyage/1.0 (https://evoyagevn.vercel.app)' },
        });
        const reverseData = await reverseRes.json();
        startDisplay = reverseData.display_name ?? null;
      } catch {
        // Reverse geocoding failed — continue without address
      }
    }
  } else if (extraction.startLocation) {
    startSource = 'parsed';
    // Forward geocode the parsed start location
    try {
      const startPlaces = await searchPlaces(extraction.startLocation);
      if (startPlaces.length > 0) {
        startLat = startPlaces[0].lat;
        startLng = startPlaces[0].lng;
        startDisplay = startPlaces[0].displayName;
      }
    } catch {
      // Geocoding failed — continue without coordinates
    }
  }

  // Determine vehicle data
  const matchedVehicle = vehicleResolution.type === 'match' ? vehicleResolution.vehicle : null;
  const vehicleName = matchedVehicle
    ? `${matchedVehicle.brand} ${matchedVehicle.model}${matchedVehicle.variant ? ` ${matchedVehicle.variant}` : ''}`
    : null;

  // Determine follow-up type
  let followUpType: FollowUpType = null;
  let followUpQuestion: string | null = null;
  let suggestedOptions: readonly SuggestedOption[] = [];

  const vehicleMissing = extraction.missingFields.includes('vehicle') || vehicleResolution.type !== 'match';
  const startMissing = extraction.missingFields.includes('start_location') && !userLocation;

  if (vehicleMissing && vehicleResolution.type === 'multiple') {
    followUpType = 'vehicle_pick';
    followUpQuestion = extraction.followUpQuestion ?? 'Bạn đang lái xe nào?';
    suggestedOptions = vehicleResolution.options.map(v => ({
      label: `${v.brand} ${v.model}${v.variant ? ` ${v.variant}` : ''}`,
      vehicleId: v.id,
    }));
  } else if (vehicleMissing && vehicleResolution.type === 'not_found') {
    followUpType = 'free_text';
    followUpQuestion = extraction.followUpQuestion ?? 'Bạn đang lái xe điện gì?';
  } else if (startMissing) {
    followUpType = 'location_input';
    followUpQuestion = extraction.followUpQuestion ?? 'Bạn xuất phát từ đâu?';
  }

  const isComplete = followUpType === null;

  const tripParams: EViTripParams = {
    start: startDisplay,
    startLat,
    startLng,
    startSource,
    end: endDisplay,
    endLat,
    endLng,
    vehicleId: matchedVehicle?.id ?? null,
    vehicleName,
    vehicleData: matchedVehicle,
    currentBattery: extraction.currentBatteryPercent ?? DEFAULT_BATTERY,
    minArrival: DEFAULT_MIN_ARRIVAL,
    rangeSafetyFactor: DEFAULT_RANGE_SAFETY_FACTOR,
  };

  const displayMessage = isComplete
    ? `Đã hiểu! Lên kế hoạch chuyến đi${vehicleName ? ` với ${vehicleName}` : ''}${endDisplay ? ` đến ${endDisplay}` : ''}...`
    : (followUpQuestion ?? 'Bạn có thể cho thêm thông tin?');

  const response: EViParseResponse = {
    isComplete,
    isStationSearch: false,
    followUpType,
    tripParams,
    followUpQuestion,
    followUpCount,
    maxFollowUps: MAX_FOLLOW_UPS,
    suggestedOptions,
    displayMessage,
    error: null,
    nearbyStations: null,
  };

  return NextResponse.json(response);
}

// ── Helpers ──

function buildResponse(params: {
  readonly isComplete: boolean;
  readonly isStationSearch?: boolean;
  readonly followUpType: FollowUpType;
  readonly displayMessage: string;
  readonly followUpQuestion: string | null;
  readonly followUpCount: number;
  readonly stationSearchParams?: { radiusKm: number; minPowerKw: number | null };
}): EViParseResponse {
  return {
    isComplete: params.isComplete,
    isStationSearch: params.isStationSearch ?? false,
    followUpType: params.followUpType,
    tripParams: {
      start: null, startLat: null, startLng: null, startSource: null,
      end: null, endLat: null, endLng: null,
      vehicleId: null, vehicleName: null, vehicleData: null,
      currentBattery: null, minArrival: null, rangeSafetyFactor: null,
    },
    followUpQuestion: params.followUpQuestion,
    followUpCount: params.followUpCount,
    maxFollowUps: MAX_FOLLOW_UPS,
    suggestedOptions: [],
    displayMessage: params.displayMessage,
    error: null,
    nearbyStations: null,
  };
}

function buildErrorResponse(error: string, followUpCount: number): EViParseResponse {
  return {
    isComplete: false,
    isStationSearch: false,
    followUpType: null,
    tripParams: {
      start: null, startLat: null, startLng: null, startSource: null,
      end: null, endLat: null, endLng: null,
      vehicleId: null, vehicleName: null, vehicleData: null,
      currentBattery: null, minArrival: null, rangeSafetyFactor: null,
    },
    followUpQuestion: null,
    followUpCount,
    maxFollowUps: MAX_FOLLOW_UPS,
    suggestedOptions: [],
    displayMessage: 'Xin lỗi, dịch vụ tạm thời không khả dụng. Vui lòng thử lại sau.',
    error,
    nearbyStations: null,
  };
}
