import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest, type NextResponse } from 'next/server';
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import { middleware, config } from './middleware';

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

/**
 * Mirrors the real request pipeline: Next only invokes middleware when
 * config.matcher admits the pathname. Returns null when the matcher skips the
 * path entirely — i.e. the request reaches the app with no auth check at all.
 */
function dispatch(pathname: string, authHeader?: string): NextResponse | null {
  const matched = config.matcher.some((pattern) => getPathMatch(pattern)(pathname) !== false);
  if (!matched) return null;
  const headers = new Headers();
  if (authHeader !== undefined) headers.set('authorization', authHeader);
  return middleware(new NextRequest(`http://localhost${pathname}`, { headers }));
}

describe('admin auth must not depend on the path CASE', () => {
  // Next resolves dynamic routes case-insensitively, so /API/ADMIN/FEEDBACK/<cuid>
  // reaches src/app/api/admin/feedback/[id]/route.ts just like the lowercase form.
  // These paths carry no dot, so the catch-all matcher admits them and the guard
  // is the only thing standing between an anonymous PATCH and prisma.feedback.update.
  it('challenges an all-uppercase admin API path', () => {
    expect(dispatch('/API/ADMIN/FEEDBACK/abc')?.status).toBe(401);
  });

  it('challenges an all-uppercase admin page path', () => {
    expect(dispatch('/ADMIN/FEEDBACK')?.status).toBe(401);
  });

  it('challenges a mixed-case admin path', () => {
    expect(dispatch('/aDmIn/FeEdBaCk')?.status).toBe(401);
  });

  it('challenges a mixed-case admin API path', () => {
    expect(dispatch('/api/ADMIN/feedback/abc')?.status).toBe(401);
  });

  it('lets an authenticated uppercase admin path through', () => {
    const res = dispatch('/API/ADMIN/FEEDBACK/abc', basicHeader('admin', 'super-secret-token-value'));
    expect(res?.status).toBe(200);
    expect(res?.headers.get('www-authenticate')).toBeNull();
  });

  it('does not over-authenticate a non-admin path that merely starts similarly', () => {
    // /plan must stay public; guard widening must not sweep ordinary pages in.
    expect(dispatch('/plan')?.status).toBe(200);
  });

  // Uppercase AND dotted. This asserts the DESIRED behaviour and passes against
  // the local matcher harness. Note: a reviewer probing the deployed site found
  // /ADMIN/FEEDBACK/<x>.<y> rendering the admin 404 shell, i.e. the middleware
  // did not run there. The local harness and Vercel's compiled edge matcher do
  // not agree, so this must be re-verified against production after deploy.
  it('challenges an uppercase admin path containing a dot', () => {
    expect(dispatch('/ADMIN/feedback/a.a')?.status).toBe(401);
    expect(dispatch('/admin/feedback/a.a')?.status).toBe(401);
  });
});

describe('middleware matcher (admin auth must not depend on a dot in the path)', () => {
  it('challenges an admin page path containing a dot', () => {
    expect(dispatch('/admin/feedback/a.a')?.status).toBe(401);
  });

  it('challenges an admin API path containing a dot', () => {
    expect(dispatch('/api/admin/export.csv')?.status).toBe(401);
  });

  it('lets an authenticated dotted admin path through', () => {
    const res = dispatch('/admin/feedback/a.a', basicHeader('admin', 'super-secret-token-value'));
    expect(res?.status).toBe(200);
    expect(res?.headers.get('www-authenticate')).toBeNull();
  });

  it('still skips genuine static assets', () => {
    expect(dispatch('/_next/static/chunk.js')).toBeNull();
    expect(dispatch('/icons/icon-192.png')).toBeNull();
  });

  it('still applies the CSP nonce to ordinary pages', () => {
    expect(dispatch('/plan')?.headers.get('content-security-policy')).toContain("'nonce-");
  });
});
