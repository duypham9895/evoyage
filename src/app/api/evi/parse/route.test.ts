import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { MinimaxTripExtractionResult } from '@/lib/evi/types';

// ── Mocks ──

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 19, retryAfterSec: 0 }),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
  eviLimiter: null,
}));

vi.mock('@/lib/evi/minimax-client', () => ({
  parseTrip: vi.fn(),
}));

vi.mock('@/lib/geo/nominatim', () => ({
  searchPlaces: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    eVVehicle: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock('@/lib/vietnam-models', () => ({
  VIETNAM_MODELS: [
    { id: 'vf8-plus', brand: 'VinFast', model: 'VF 8', variant: 'Plus', batteryCapacityKwh: 87.7, officialRangeKm: 471, availableInVietnam: true },
    { id: 'vf5-plus', brand: 'VinFast', model: 'VF 5', variant: 'Plus', batteryCapacityKwh: 37.23, officialRangeKm: 326, availableInVietnam: true },
  ],
}));

const MOCK_VF8 = {
  id: 'vf8-plus',
  brand: 'VinFast',
  model: 'VF 8',
  variant: 'Plus',
  batteryCapacityKwh: 87.7,
  officialRangeKm: 471,
  availableInVietnam: true,
};

const MOCK_VF5 = {
  id: 'vf5-plus',
  brand: 'VinFast',
  model: 'VF 5',
  variant: 'Plus',
  batteryCapacityKwh: 37.23,
  officialRangeKm: 326,
  availableInVietnam: true,
};

// ── Imports (after mocks) ──

import { POST } from './route';
import { parseTrip } from '@/lib/evi/minimax-client';
import { searchPlaces } from '@/lib/geo/nominatim';
import { checkRateLimit } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';

const mockParseTrip = vi.mocked(parseTrip);
const mockSearchPlaces = vi.mocked(searchPlaces);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockFindMany = vi.mocked(prisma.eVVehicle.findMany);

// ── Helpers ──

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/evi/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function baseTripExtraction(overrides: Partial<MinimaxTripExtractionResult> = {}): MinimaxTripExtractionResult {
  return {
    startLocation: null,
    endLocation: null,
    vehicleBrand: null,
    vehicleModel: null,
    currentBatteryPercent: null,
    isTripRequest: true,
    isOutsideVietnam: false,
    missingFields: [],
    followUpQuestion: null,
    confidence: 0.9,
    ...overrides,
  };
}

// ── Tests ──

describe('POST /api/evi/parse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, retryAfterSec: 0 });
    mockSearchPlaces.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([]);
  });

  it('returns complete trip for a one-shot parse', async () => {
    mockParseTrip.mockResolvedValue(baseTripExtraction({
      endLocation: 'Đà Lạt',
      vehicleBrand: 'VinFast',
      vehicleModel: 'VF 8',
      currentBatteryPercent: 85,
    }));

    mockSearchPlaces.mockResolvedValue([
      { placeId: 1, displayName: 'Đà Lạt, Lâm Đồng', lat: 11.94, lng: 108.45, type: 'city' },
    ]);

    mockFindMany.mockResolvedValue([MOCK_VF8 as never]);

    const res = await POST(createRequest({
      message: 'Đi Đà Lạt, VF8, pin 85%',
      history: [],
      userLocation: { lat: 10.77, lng: 106.70 },
    }));

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.isComplete).toBe(true);
    expect(data.tripParams.endLat).toBe(11.94);
    expect(data.tripParams.endLng).toBe(108.45);
    expect(data.tripParams.vehicleData).toBeTruthy();
    expect(data.tripParams.vehicleName).toContain('VF 8');
    expect(data.tripParams.currentBattery).toBe(85);
    expect(data.error).toBeNull();
  });

  it('returns vehicle_pick follow-up when vehicle is missing and multiple matches', async () => {
    mockParseTrip.mockResolvedValue(baseTripExtraction({
      endLocation: 'Đà Lạt',
      vehicleBrand: 'VinFast',
      vehicleModel: null,
      missingFields: ['vehicle'],
      followUpQuestion: 'Bạn đi xe gì?',
    }));

    // DB returns multiple vehicles
    mockFindMany.mockResolvedValue([MOCK_VF8 as never, MOCK_VF5 as never]);

    const res = await POST(createRequest({
      message: 'Đi Đà Lạt bằng VinFast',
      history: [],
      userLocation: { lat: 10.77, lng: 106.70 },
    }));

    const data = await res.json();

    expect(data.isComplete).toBe(false);
    expect(data.followUpType).toBe('vehicle_pick');
    expect(data.suggestedOptions.length).toBeGreaterThan(0);
    expect(data.suggestedOptions[0]).toHaveProperty('label');
    expect(data.suggestedOptions[0]).toHaveProperty('vehicleId');
  });

  it('returns location_input follow-up when start location is missing and no userLocation', async () => {
    mockParseTrip.mockResolvedValue(baseTripExtraction({
      startLocation: null,
      endLocation: 'Đà Lạt',
      vehicleBrand: 'VinFast',
      vehicleModel: 'VF 8',
      missingFields: ['start_location'],
      followUpQuestion: 'Bạn xuất phát từ đâu?',
    }));

    mockFindMany.mockResolvedValue([MOCK_VF8 as never]);

    const res = await POST(createRequest({
      message: 'Đi Đà Lạt bằng VF8',
      history: [],
      userLocation: null,
    }));

    const data = await res.json();

    expect(data.isComplete).toBe(false);
    expect(data.followUpType).toBe('location_input');
    expect(data.followUpQuestion).toBe('Bạn xuất phát từ đâu?');
  });

  it('returns non-trip message when input is not a trip request', async () => {
    mockParseTrip.mockResolvedValue(baseTripExtraction({
      isTripRequest: false,
      followUpQuestion: 'Bạn muốn đi đâu? Hãy mô tả chuyến đi của bạn.',
    }));

    const res = await POST(createRequest({
      message: 'Thời tiết hôm nay thế nào?',
      history: [],
      userLocation: null,
    }));

    const data = await res.json();

    expect(data.isComplete).toBe(false);
    expect(data.followUpType).toBe('free_text');
    expect(data.displayMessage).toContain('mô tả chuyến đi');
  });

  it('returns outside-Vietnam message when destination is abroad', async () => {
    mockParseTrip.mockResolvedValue(baseTripExtraction({
      isOutsideVietnam: true,
      endLocation: 'Bangkok',
    }));

    const res = await POST(createRequest({
      message: 'Đi Bangkok',
      history: [],
      userLocation: null,
    }));

    const data = await res.json();

    expect(data.isComplete).toBe(false);
    expect(data.displayMessage).toContain('Việt Nam');
  });

  it('returns 503 when Minimax API fails', async () => {
    mockParseTrip.mockRejectedValue(new Error('Minimax API timeout'));

    const res = await POST(createRequest({
      message: 'Đi Đà Lạt',
      history: [],
      userLocation: null,
    }));

    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe('service_unavailable');
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 30 });

    const res = await POST(createRequest({
      message: 'Đi Đà Lạt',
      history: [],
      userLocation: null,
    }));

    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toBe('Too many requests');
    expect(data.retryAfter).toBe(30);
  });

  it('returns 400 for invalid request body', async () => {
    const req = new NextRequest('http://localhost:3000/api/evi/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid request');
  });

  it('returns 400 when message exceeds max length', async () => {
    const longMessage = 'a'.repeat(501);

    const res = await POST(createRequest({
      message: longMessage,
      history: [],
      userLocation: null,
    }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid request');
  });

  it('defaults battery to 80 when currentBatteryPercent is null', async () => {
    mockParseTrip.mockResolvedValue(baseTripExtraction({
      endLocation: 'Đà Lạt',
      vehicleBrand: 'VinFast',
      vehicleModel: 'VF 8',
      currentBatteryPercent: null,
    }));

    mockSearchPlaces.mockResolvedValue([
      { placeId: 1, displayName: 'Đà Lạt, Lâm Đồng', lat: 11.94, lng: 108.45, type: 'city' },
    ]);

    mockFindMany.mockResolvedValue([MOCK_VF8 as never]);

    const res = await POST(createRequest({
      message: 'Đi Đà Lạt bằng VF8',
      history: [],
      userLocation: { lat: 10.77, lng: 106.70 },
    }));

    const data = await res.json();

    expect(data.isComplete).toBe(true);
    expect(data.tripParams.currentBattery).toBe(80);
  });
});
