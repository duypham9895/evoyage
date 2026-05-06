import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, retryAfterSec: 0 }),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
  routeLimiter: null,
}));

const mockCallLLM = vi.hoisted(() => vi.fn());
vi.mock('@/lib/evi/llm-module', async () => {
  const actual = await vi.importActual<typeof import('@/lib/evi/llm-module')>('@/lib/evi/llm-module');
  return {
    ...actual,
    callLLM: mockCallLLM,
  };
});

// ── Imports (after mocks) ──
import { POST } from './route';
import { checkRateLimit } from '@/lib/rate-limit';
import { LLMSchemaError, LLMUnavailableError, LLMAbortedError } from '@/lib/evi/llm-module';

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
    mockCallLLM.mockReset();
  });

  it('returns narrative on success', async () => {
    mockCallLLM.mockResolvedValueOnce(AI_RESPONSE);

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

  it('returns 500 when AI response fails schema validation (LLMSchemaError)', async () => {
    mockCallLLM.mockRejectedValueOnce(
      new LLMSchemaError('missing narrative field', '{"overview":"ok"}'),
    );

    const res = await POST(makeRequest(VALID_BODY));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.overview).toBeNull();
    expect(data.error).toBe('Failed to generate route narrative');
  });

  it('returns 500 when callLLM throws a non-typed Error', async () => {
    mockCallLLM.mockRejectedValueOnce(new Error('Unexpected internal error'));

    const res = await POST(makeRequest(VALID_BODY));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.overview).toBeNull();
    expect(data.error).toBe('Failed to generate route narrative');
  });

  it('returns 500 when callLLM aborts mid-flight (LLMAbortedError)', async () => {
    mockCallLLM.mockRejectedValueOnce(new LLMAbortedError());

    const res = await POST(makeRequest(VALID_BODY));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.overview).toBeNull();
    expect(data.error).toBe('Failed to generate route narrative');
  });

  it('returns 503 when both LLM providers fail (LLMUnavailableError)', async () => {
    mockCallLLM.mockRejectedValueOnce(
      new LLMUnavailableError('All LLM providers exhausted. Last error: ECONNREFUSED'),
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

    mockCallLLM.mockResolvedValueOnce(noStopsResponse);

    const res = await POST(makeRequest(noStopsBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.overview).toBe(noStopsResponse.overview);
  });

  it('passes schema, system, maxTokens=4096, timeoutMs=30_000 to callLLM', async () => {
    mockCallLLM.mockResolvedValueOnce(AI_RESPONSE);

    await POST(makeRequest(VALID_BODY));

    expect(mockCallLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'You are a Vietnamese EV trip assistant. Always respond with valid JSON.',
        maxTokens: 4096,
        timeoutMs: 30_000,
      }),
    );

    const call = mockCallLLM.mock.calls[0][0] as {
      schema: { safeParse: (v: unknown) => { success: boolean } };
      user: string;
    };
    expect(call.schema).toBeDefined();
    expect(call.schema.safeParse({ overview: 'a', narrative: 'b' }).success).toBe(true);
    expect(call.schema.safeParse({ overview: 'a' }).success).toBe(false);
    expect(call.user).toContain('Ho Chi Minh City');
    expect(call.user).toContain('Da Lat');
  });
});
