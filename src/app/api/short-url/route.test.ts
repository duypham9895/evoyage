import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { __resetRateLimitForTests } from '@/lib/rate-limit';

// Mock createShortUrl + validateParams from the lib so the route test can
// focus on the HTTP contract without exercising the Prisma retry loop.
const createShortUrlMock = vi.fn();
const validateParamsMock = vi.fn();

vi.mock('@/lib/short-url', () => ({
  createShortUrl: (...args: unknown[]) => createShortUrlMock(...args),
  validateParams: (...args: unknown[]) => validateParamsMock(...args),
}));

import { POST } from './route';

function makeRequest(body: unknown, opts: { ip?: string; host?: string; proto?: string } = {}): NextRequest {
  const headers = new Headers();
  if (opts.ip) headers.set('x-vercel-forwarded-for', opts.ip);
  if (opts.host) headers.set('host', opts.host);
  if (opts.proto) headers.set('x-forwarded-proto', opts.proto);
  return new NextRequest('http://localhost/api/short-url', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  createShortUrlMock.mockReset();
  validateParamsMock.mockReset();
  __resetRateLimitForTests();
});

describe('POST /api/short-url', () => {
  it('returns 201 with the created code + url on success', async () => {
    validateParamsMock.mockReturnValue({ valid: true, params: 'start=10.7,106.6&end=21.0,105.8' });
    createShortUrlMock.mockResolvedValue({
      code: 'AbCdEfG',
      url: 'https://evoyage.duypham.me/s/AbCdEfG',
    });

    const res = await POST(makeRequest({ params: 'start=10.7,106.6&end=21.0,105.8' }));

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toEqual({ code: 'AbCdEfG', url: 'https://evoyage.duypham.me/s/AbCdEfG' });
    expect(validateParamsMock).toHaveBeenCalledWith('start=10.7,106.6&end=21.0,105.8');
  });

  it('derives baseUrl from x-forwarded-proto + host headers', async () => {
    validateParamsMock.mockReturnValue({ valid: true, params: 'start=1' });
    createShortUrlMock.mockResolvedValue({ code: 'X', url: 'https://evoyage.duypham.me/s/X' });

    await POST(makeRequest({ params: 'start=1' }, { proto: 'https', host: 'evoyage.duypham.me' }));

    const [params, baseUrl] = createShortUrlMock.mock.calls[0]!;
    expect(params).toBe('start=1');
    expect(baseUrl).toBe('https://evoyage.duypham.me');
  });

  it('returns 400 on malformed JSON body', async () => {
    const res = await POST(makeRequest('{not json'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Invalid');
    expect(validateParamsMock).not.toHaveBeenCalled();
    expect(createShortUrlMock).not.toHaveBeenCalled();
  });

  it('returns 400 on non-object body', async () => {
    const res = await POST(makeRequest('"just-a-string"'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when validateParams rejects', async () => {
    validateParamsMock.mockReturnValue({ valid: false, error: 'params must contain at least start or end' });

    const res = await POST(makeRequest({ params: 'vehicle=vf8' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('params must contain at least start or end');
    expect(createShortUrlMock).not.toHaveBeenCalled();
  });

  it('returns 500 when createShortUrl throws (DB collision exhausted)', async () => {
    validateParamsMock.mockReturnValue({ valid: true, params: 'start=1' });
    createShortUrlMock.mockRejectedValue(new Error('Failed to create short URL after maximum retries'));

    const res = await POST(makeRequest({ params: 'start=1' }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain('Could not create share link');
  });

  it('returns 429 after the per-minute rate limit (10/min)', async () => {
    validateParamsMock.mockReturnValue({ valid: true, params: 'start=1' });
    createShortUrlMock.mockResolvedValue({ code: 'X', url: 'https://x/' });

    for (let i = 0; i < 10; i++) {
      const ok = await POST(makeRequest({ params: 'start=1' }, { ip: '1.2.3.4' }));
      expect(ok.status, `request #${i + 1}`).toBe(201);
    }
    const blocked = await POST(makeRequest({ params: 'start=1' }, { ip: '1.2.3.4' }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
  });

  it('rate-limits per-IP — different IPs share no bucket', async () => {
    validateParamsMock.mockReturnValue({ valid: true, params: 'start=1' });
    createShortUrlMock.mockResolvedValue({ code: 'X', url: 'https://x/' });

    for (let i = 0; i < 10; i++) {
      await POST(makeRequest({ params: 'start=1' }, { ip: '1.1.1.1' }));
    }
    // 1.1.1.1 is now rate-limited; 2.2.2.2 should still succeed.
    const fresh = await POST(makeRequest({ params: 'start=1' }, { ip: '2.2.2.2' }));
    expect(fresh.status).toBe(201);
  });

  it('does not call createShortUrl when the rate limit blocks (no DB write on abuse)', async () => {
    validateParamsMock.mockReturnValue({ valid: true, params: 'start=1' });
    createShortUrlMock.mockResolvedValue({ code: 'X', url: 'https://x/' });

    for (let i = 0; i < 10; i++) {
      await POST(makeRequest({ params: 'start=1' }, { ip: '5.5.5.5' }));
    }
    const callsBefore = createShortUrlMock.mock.calls.length;
    await POST(makeRequest({ params: 'start=1' }, { ip: '5.5.5.5' }));
    expect(createShortUrlMock.mock.calls.length).toBe(callsBefore);
  });
});
