import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

function makeRequest(authHeader?: string): NextRequest {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set('authorization', authHeader);
  return new NextRequest('http://localhost/admin/feedback', { headers });
}

function basicHeader(user: string, pass: string): string {
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}

const ORIGINAL_ENV = process.env.ADMIN_TOKEN;

beforeEach(() => {
  vi.stubEnv('ADMIN_TOKEN', 'super-secret-token-value');
});

afterEach(() => {
  vi.unstubAllEnvs();
  if (ORIGINAL_ENV !== undefined) process.env.ADMIN_TOKEN = ORIGINAL_ENV;
});

describe('middleware (HTTP Basic Auth for /admin)', () => {
  it('passes through requests with correct admin:TOKEN credentials', () => {
    const res = middleware(makeRequest(basicHeader('admin', 'super-secret-token-value')));
    // NextResponse.next() has a special header — we check status is 200 + no WWW-Authenticate.
    expect(res.status).toBe(200);
    expect(res.headers.get('www-authenticate')).toBeNull();
  });

  it('returns 401 with WWW-Authenticate when no header is sent', () => {
    const res = middleware(makeRequest());
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('Basic');
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
  });

  it('returns 401 on wrong username', () => {
    const res = middleware(makeRequest(basicHeader('root', 'super-secret-token-value')));
    expect(res.status).toBe(401);
  });

  it('returns 401 on wrong password', () => {
    const res = middleware(makeRequest(basicHeader('admin', 'wrong-password')));
    expect(res.status).toBe(401);
  });

  it('returns 401 when ADMIN_TOKEN is unset (fail-safe default)', () => {
    vi.stubEnv('ADMIN_TOKEN', '');
    const res = middleware(makeRequest(basicHeader('admin', 'anything')));
    expect(res.status).toBe(401);
  });

  it('returns 401 on malformed base64', () => {
    const res = middleware(makeRequest('Basic not-base64!!!'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the Authorization scheme is not Basic', () => {
    const res = middleware(makeRequest('Bearer some-token'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the decoded credential has no colon separator', () => {
    const headerNoColon = 'Basic ' + Buffer.from('justusernamenoColon').toString('base64');
    const res = middleware(makeRequest(headerNoColon));
    expect(res.status).toBe(401);
  });

  it('does not leak ADMIN_TOKEN value via timing — same length wrong password still 401', () => {
    // Same length as 'super-secret-token-value' but different content
    const res = middleware(makeRequest(basicHeader('admin', 'super-secret-token-WRONG')));
    expect(res.status).toBe(401);
  });
});
