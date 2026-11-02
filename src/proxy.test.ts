import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest, type NextResponse } from 'next/server';
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import { proxy, config } from './proxy';

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
    const res = proxy(makeRequest(basicHeader('admin', 'super-secret-token-value')));
    // NextResponse.next() has a special header — we check status is 200 + no WWW-Authenticate.
    expect(res.status).toBe(200);
    expect(res.headers.get('www-authenticate')).toBeNull();
  });

  it('returns 401 with WWW-Authenticate when no header is sent', () => {
    const res = proxy(makeRequest());
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('Basic');
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
  });

  it('returns 401 on wrong username', () => {
    const res = proxy(makeRequest(basicHeader('root', 'super-secret-token-value')));
    expect(res.status).toBe(401);
  });

  it('returns 401 on wrong password', () => {
    const res = proxy(makeRequest(basicHeader('admin', 'wrong-password')));
    expect(res.status).toBe(401);
  });

  it('returns 401 when ADMIN_TOKEN is unset (fail-safe default)', () => {
    vi.stubEnv('ADMIN_TOKEN', '');
    const res = proxy(makeRequest(basicHeader('admin', 'anything')));
    expect(res.status).toBe(401);
  });

  it('returns 401 on malformed base64', () => {
    const res = proxy(makeRequest('Basic not-base64!!!'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the Authorization scheme is not Basic', () => {
    const res = proxy(makeRequest('Bearer some-token'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the decoded credential has no colon separator', () => {
    const headerNoColon = 'Basic ' + Buffer.from('justusernamenoColon').toString('base64');
    const res = proxy(makeRequest(headerNoColon));
    expect(res.status).toBe(401);
  });

  it('does not leak ADMIN_TOKEN value via timing — same length wrong password still 401', () => {
    // Same length as 'super-secret-token-value' but different content
    const res = proxy(makeRequest(basicHeader('admin', 'super-secret-token-WRONG')));
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
  return proxy(new NextRequest(`http://localhost${pathname}`, { headers }));
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

describe('CSP (issue #93: mapbox-gl 3.33 compiles WASM for RTL text / draco / meshopt)', () => {
  it("allows 'wasm-unsafe-eval' in script-src", () => {
    const csp = dispatch('/plan')?.headers.get('content-security-policy');
    expect(csp).toMatch(/script-src [^;]*'wasm-unsafe-eval'/);
  });

  it("does not add the broader 'unsafe-eval'", () => {
    const csp = dispatch('/plan')?.headers.get('content-security-policy');
    expect(csp).not.toContain("'unsafe-eval'");
  });
});

/**
 * Pins exact, non-obvious behaviour (full CSP string, forwarded nonce header
 * name, 401 header values, matcher array) so the upcoming middleware -> proxy
 * rename (issue #97, Next 16.4.3) can be proven behaviour-neutral. These must
 * all pass BEFORE the rename and still pass unchanged AFTER it.
 */
describe('CSP + headers characterization (pins exact behaviour before the proxy rename)', () => {
  // crypto.getRandomValues(new Uint8Array(16)) filled with 0,1,2,...,15 ->
  // base64 of that fixed byte sequence. Computed once, asserted with toBe.
  const FIXED_NONCE = 'AAECAwQFBgcICQoLDA0ODw==';
  const EXPECTED_CSP =
    "default-src 'self'; " +
    `script-src 'self' 'nonce-${FIXED_NONCE}' 'strict-dynamic' https: 'unsafe-inline' 'wasm-unsafe-eval'; ` +
    "style-src 'self' 'unsafe-inline' api.mapbox.com; " +
    "connect-src 'self' *.mapbox.com maps.googleapis.com nominatim.openstreetmap.org router.project-osrm.org overpass-api.de *.supabase.com https://*.i.posthog.com; " +
    "img-src 'self' data: blob: *.openstreetmap.org *.googleapis.com *.mapbox.com *.basemaps.cartocdn.com *.vinfastauto.com; " +
    "font-src 'self'; " +
    "worker-src 'self' blob:; " +
    "frame-src 'self'; " +
    "base-uri 'self'; " +
    "form-action 'self'; " +
    "object-src 'none'";

  function mockFixedNonceBytes(): void {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(((array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) array[i] = i;
      return array;
    }) as typeof crypto.getRandomValues);
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds the exact CSP string, directive-for-directive, with a fixed nonce', () => {
    mockFixedNonceBytes();
    const res = dispatch('/plan');
    expect(res?.headers.get('content-security-policy')).toBe(EXPECTED_CSP);
  });

  it('forwards the nonce to the app under x-middleware-request-x-nonce', () => {
    mockFixedNonceBytes();
    const res = dispatch('/plan');
    // This is Next's internal convention for headers middleware adds to the
    // forwarded request (NextResponse.next({ request: { headers } })) — it
    // prefixes the header name with x-middleware-request-. Re-check this
    // prefix on every Next major bump; it is not public API.
    expect(res?.headers.get('x-middleware-request-x-nonce')).toBe(FIXED_NONCE);
  });

  it('generates a 16-byte base64 nonce (unmocked crypto)', () => {
    const res = dispatch('/plan');
    const nonce = res?.headers.get('content-security-policy')?.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  it('generates a different nonce on every request', () => {
    const nonceOf = (res: NextResponse | null) =>
      res?.headers.get('content-security-policy')?.match(/'nonce-([^']+)'/)?.[1];
    expect(nonceOf(dispatch('/plan'))).not.toBe(nonceOf(dispatch('/plan')));
  });

  it('401 responses carry the exact WWW-Authenticate and X-Robots-Tag values and no CSP header', () => {
    const res = dispatch('/admin/feedback');
    expect(res?.status).toBe(401);
    expect(res?.headers.get('www-authenticate')).toBe('Basic realm="eVoyage Admin", charset="UTF-8"');
    expect(res?.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(res?.headers.get('content-security-policy')).toBeNull();
  });

  it('pins the exact matcher array', () => {
    expect(config.matcher).toEqual([
      '/admin/:path*',
      '/api/admin/:path*',
      '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|robots.txt|sitemap.xml|.*\\..*).*)',
    ]);
  });
});

describe('CSP img-src must allow the feedback photo preview', () => {
  // BUG(p2-feedback-form-failures): FeedbackImageUpload renders its preview from URL.createObjectURL(file),
  // so img-src must keep blob:. The Vercel Blob host is deliberately not allowlisted.
  // See docs/bugs/2026-11-01-p2-feedback-form-failures.md
  it('keeps blob: in img-src (FeedbackImageUpload previews via URL.createObjectURL)', () => {
    const res = proxy(new NextRequest('http://localhost/plan'));
    const csp = res.headers.get('content-security-policy') ?? '';
    const imgSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('img-src')) ?? '';
    expect(imgSrc.split(/\s+/)).toContain('blob:');
  });
});
