import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 19, retryAfterSec: 0 }),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
  eviLimiter: null,
}));

vi.mock('@/lib/evi/suggestions-client', () => ({
  generateSuggestions: vi.fn(),
}));

import { POST } from './route';
import { generateSuggestions } from '@/lib/evi/suggestions-client';

const mockGenerateSuggestions = vi.mocked(generateSuggestions);

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/evi/suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const messages = [{ role: 'user', content: 'Đi Đà Lạt' }];

describe('POST /api/evi/suggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateSuggestions.mockResolvedValue(['Sạc ở đâu?']);
  });

  it('returns suggestions for an in-range trip context', async () => {
    const res = await POST(createRequest({
      messages,
      tripContext: { start: 'TP. Hồ Chí Minh', end: 'x'.repeat(300), vehicleName: 'VinFast VF 8 Plus', currentBattery: 100 },
    }));

    expect(res.status).toBe(200);
    expect(mockGenerateSuggestions).toHaveBeenCalledOnce();
  });

  it.each(['start', 'end', 'vehicleName'])('returns 400 without calling the LLM when tripContext.%s is oversized', async (field) => {
    const res = await POST(createRequest({
      messages,
      tripContext: { [field]: 'x'.repeat(301) },
    }));

    expect(res.status).toBe(400);
    expect(mockGenerateSuggestions).not.toHaveBeenCalled();
  });

  it.each([0, 101, 5000])('returns 400 without calling the LLM when tripContext.currentBattery is %s', async (currentBattery) => {
    const res = await POST(createRequest({
      messages,
      tripContext: { currentBattery },
    }));

    expect(res.status).toBe(400);
    expect(mockGenerateSuggestions).not.toHaveBeenCalled();
  });
});
