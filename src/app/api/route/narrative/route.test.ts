import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, retryAfterSec: 0 }),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
  routeLimiter: null,
}));

const { mockCallJsonLLM } = vi.hoisted(() => ({
  mockCallJsonLLM: vi.fn(),
}));
vi.mock('@/lib/evi/llm-call', () => ({
  callJsonLLM: mockCallJsonLLM,
}));

// ── Imports (after mocks) ──
import { POST } from './route';
import { checkRateLimit } from '@/lib/rate-limit';

// ── Helpers ──

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/route/narrative', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  tripId: 'test-trip-123',
  startAddress: 'Ho Chi Minh City',
  endAddress: 'Da Lat',
  totalDistanceKm: 310,
  totalDurationMin: 360,
  chargingStops: [
    {
      stationName: 'VinFast Bao Loc',
      address: 'QL20, Bao Loc, Lam Dong',
      distanceFromStartKm: 180,
      chargingTimeMin: 25,
      arrivalBattery: 18,
      departureBattery: 80,
    },
  ],
};

const AI_RESPONSE = {
  overview: 'Chuyến đi từ TP.HCM đến Đà Lạt dài 310km, mất khoảng 6 tiếng bao gồm 1 lần sạc.',
  narrative: 'Bạn sẽ xuất phát từ TP.HCM, đi theo QL20 qua Đồng Nai, Bình Phước rồi lên Lâm Đồng. Khi đến Bảo Lộc (km 180), pin còn khoảng 18% — dừng sạc tại VinFast Bảo Lộc khoảng 25 phút để nạp pin lên 80%. Sau đó tiếp tục lên Đà Lạt, còn khoảng 130km nữa.',
};

// ── Tests ──

describe('POST /api/route/narrative', () => {
  beforeEach(() => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 9, retryAfterSec: 0 });
    mockCallJsonLLM.mockReset();
  });

  it('returns narrative on success', async () => {
    mockCallJsonLLM.mockResolvedValueOnce({ json: AI_RESPONSE, provider: 'mimo' });

    const res = await POST(makeRequest(VALID_BODY));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.overview).toBe(AI_RESPONSE.overview);
    expect(data.narrative).toBe(AI_RESPONSE.narrative);
  });

  it('returns 429 when rate limited', async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterSec: 30,
    });

    const res = await POST(makeRequest(VALID_BODY));
    const data = await res.json();

    expect(res.status).toBe(429);
    expect(data.overview).toBeNull();
    expect(data.narrative).toBeNull();
    expect(data.error).toContain('Too many requests');
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new NextRequest('http://localhost/api/route/narrative', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json{',
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.overview).toBeNull();
    expect(data.error).toBe('Invalid JSON body');
  });

  it('returns 400 for missing required fields', async () => {
    const res = await POST(makeRequest({ startAddress: 'HCM' }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.overview).toBeNull();
    expect(data.error).toContain('Validation failed');
  });

  it('returns 500 when AI response is missing required fields (schema fails)', async () => {
    mockCallJsonLLM.mockResolvedValueOnce({ json: { overview: 'ok' }, provider: 'mimo' });

    const res = await POST(makeRequest(VALID_BODY));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.overview).toBeNull();
    expect(data.error).toBe('Failed to generate route narrative');
  });

  it('returns 500 when callJsonLLM throws a generic error', async () => {
    mockCallJsonLLM.mockRejectedValueOnce(new Error('Unexpected internal error'));

    const res = await POST(makeRequest(VALID_BODY));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.overview).toBeNull();
    expect(data.error).toBe('Failed to generate route narrative');
  });

  it('returns 503 when both LLM providers fail', async () => {
    mockCallJsonLLM.mockRejectedValueOnce(
      new Error('Both providers failed. mimo: ECONNREFUSED. minimax: ECONNREFUSED.'),
    );

    const res = await POST(makeRequest(VALID_BODY));
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.error).toBe('AI service unavailable');
  });

  it('handles trip with no charging stops', async () => {
    const noStopsBody = { ...VALID_BODY, chargingStops: [] };
    const noStopsResponse = {
      overview: 'Chuyến đi ngắn, không cần sạc.',
      narrative: 'Bạn đủ pin cho toàn bộ chuyến đi.',
    };

    mockCallJsonLLM.mockResolvedValueOnce({ json: noStopsResponse, provider: 'mimo' });

    const res = await POST(makeRequest(noStopsBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.overview).toBe(noStopsResponse.overview);
  });

  it('passes correct temperature, maxTokens, callerTag to callJsonLLM', async () => {
    mockCallJsonLLM.mockResolvedValueOnce({ json: AI_RESPONSE, provider: 'mimo' });

    await POST(makeRequest(VALID_BODY));

    expect(mockCallJsonLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.4,
        maxTokens: 4096,
        primaryTimeoutMs: 15_000,
        fallbackTimeoutMs: 50_000,
        callerTag: 'narrative',
      }),
    );
  });
});
