import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 4, retryAfterSec: 0 }),
  getClientIp: vi.fn().mockReturnValue('203.0.113.42'),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    chargingStation: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    stationStatusReport: {
      create: vi.fn(),
    },
  },
}));

// ── Imports (after mocks) ──

import { POST } from './route';
import { checkRateLimit } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';

const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockFindStation = vi.mocked(prisma.chargingStation.findUnique);
const mockUpdateStation = vi.mocked(prisma.chargingStation.update);
const mockCreateReport = vi.mocked(prisma.stationStatusReport.create);

const STATION_ID = 'clxabcdef0123456789abcde'; // 25-char cuid-shaped string

function buildRequest(body: unknown): NextRequest {
  return new NextRequest(
    `http://localhost/api/stations/${STATION_ID}/status-report`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'vitest' },
      body: JSON.stringify(body),
    },
  );
}

const PARAMS = { params: Promise.resolve({ id: STATION_ID }) };

describe('POST /api/stations/[id]/status-report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 4, retryAfterSec: 0 });
    mockFindStation.mockResolvedValue({ id: STATION_ID } as never);
    mockCreateReport.mockResolvedValue({ id: 'report-1' } as never);
    mockUpdateStation.mockResolvedValue({ id: STATION_ID } as never);
  });

  it('records a WORKING report and updates lastVerifiedAt', async () => {
    const res = await POST(buildRequest({ status: 'WORKING' }), PARAMS);

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(typeof json.reportedAt).toBe('string');

    expect(mockCreateReport).toHaveBeenCalledTimes(1);
    const createArg = mockCreateReport.mock.calls[0][0];
    expect(createArg.data.stationId).toBe(STATION_ID);
    expect(createArg.data.status).toBe('WORKING');
    // IP must be stored hashed, never raw.
    expect(createArg.data.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(createArg.data.ipHash).not.toContain('203.0.113.42');
    expect(createArg.data.userAgent).toBe('vitest');

    expect(mockUpdateStation).toHaveBeenCalledTimes(1);
    expect(mockUpdateStation.mock.calls[0][0].where).toEqual({ id: STATION_ID });
    expect(mockUpdateStation.mock.calls[0][0].data.lastVerifiedAt).toBeInstanceOf(Date);
  });

  it('records a BROKEN report without touching lastVerifiedAt', async () => {
    const res = await POST(buildRequest({ status: 'BROKEN' }), PARAMS);
    expect(res.status).toBe(201);

    expect(mockCreateReport).toHaveBeenCalledTimes(1);
    expect(mockCreateReport.mock.calls[0][0].data.status).toBe('BROKEN');
    expect(mockUpdateStation).not.toHaveBeenCalled();
  });

  it('records a BUSY report without touching lastVerifiedAt', async () => {
    const res = await POST(buildRequest({ status: 'BUSY' }), PARAMS);
    expect(res.status).toBe(201);

    expect(mockCreateReport.mock.calls[0][0].data.status).toBe('BUSY');
    expect(mockUpdateStation).not.toHaveBeenCalled();
  });

  it('normalizes lowercase status values before validating', async () => {
    const res = await POST(buildRequest({ status: 'working' }), PARAMS);
    expect(res.status).toBe(201);
    expect(mockCreateReport.mock.calls[0][0].data.status).toBe('WORKING');
  });

  it('rejects invalid status values with 400', async () => {
    const res = await POST(buildRequest({ status: 'OFFLINE' }), PARAMS);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('INVALID_STATUS');
    expect(mockCreateReport).not.toHaveBeenCalled();
  });

  it('rejects missing status field with 400', async () => {
    const res = await POST(buildRequest({}), PARAMS);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_STATUS');
  });

  it('returns 400 for malformed JSON body', async () => {
    const req = new NextRequest(
      `http://localhost/api/stations/${STATION_ID}/status-report`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json',
      },
    );
    const res = await POST(req, PARAMS);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_JSON');
  });

  it('returns 404 when station does not exist', async () => {
    mockFindStation.mockResolvedValueOnce(null);
    const res = await POST(buildRequest({ status: 'WORKING' }), PARAMS);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('STATION_NOT_FOUND');
    expect(mockCreateReport).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limit is exceeded', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterSec: 42,
    });
    const res = await POST(buildRequest({ status: 'WORKING' }), PARAMS);
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toBe('RATE_LIMITED');
    expect(json.retryAfterSec).toBe(42);
    expect(res.headers.get('Retry-After')).toBe('42');
    expect(mockFindStation).not.toHaveBeenCalled();
    expect(mockCreateReport).not.toHaveBeenCalled();
  });

  it('returns 400 for absurdly short station ID', async () => {
    const req = new NextRequest('http://localhost/api/stations/x/status-report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'WORKING' }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: 'x' }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_STATION_ID');
  });

  it('returns 500 if database insert fails', async () => {
    mockCreateReport.mockRejectedValueOnce(new Error('db down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(buildRequest({ status: 'WORKING' }), PARAMS);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('INTERNAL_ERROR');
    errSpy.mockRestore();
  });

  it('uses the configured 5-per-minute rate limit', async () => {
    await POST(buildRequest({ status: 'WORKING' }), PARAMS);
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      'status-report:203.0.113.42',
      5,
      60_000,
      null, // no Redis configured in tests
    );
  });
});
