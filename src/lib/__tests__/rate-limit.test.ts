import { describe, it, expect } from 'vitest';
import { getClientIp } from '../rate-limit';

describe('getClientIp', () => {
  it('prefers x-vercel-forwarded-for (unspoofable)', () => {
    const headers = new Headers({
      'x-vercel-forwarded-for': '1.2.3.4',
      'x-forwarded-for': '5.6.7.8',
    });
    const req = { headers } as unknown as Request;
    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('falls back to x-forwarded-for', () => {
    const headers = new Headers({
      'x-forwarded-for': '5.6.7.8, 9.10.11.12',
    });
    const req = { headers } as unknown as Request;
    expect(getClientIp(req)).toBe('5.6.7.8');
  });

  it('falls back to x-real-ip', () => {
    const headers = new Headers({
      'x-real-ip': '10.0.0.1',
    });
    const req = { headers } as unknown as Request;
    expect(getClientIp(req)).toBe('10.0.0.1');
  });

  it('returns anonymous when no IP headers', () => {
    const headers = new Headers({});
    const req = { headers } as unknown as Request;
    expect(getClientIp(req)).toBe('anonymous');
  });

  it('takes first IP from comma-separated vercel header', () => {
    const headers = new Headers({
      'x-vercel-forwarded-for': '1.2.3.4, 5.6.7.8',
    });
    const req = { headers } as unknown as Request;
    expect(getClientIp(req)).toBe('1.2.3.4');
  });
});
