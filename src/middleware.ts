/**
 * Next.js middleware — two responsibilities, single pass:
 *
 *   1. HTTP Basic Auth on /admin/* and /api/admin/* (gated by ADMIN_TOKEN).
 *   2. Per-request nonce + Content-Security-Policy on HTML responses.
 *
 * The CSP work used to live in next.config.ts as a static header with
 * `'unsafe-inline'` on script-src and style-src. The script-src side has
 * been tightened to nonce-based (per-request, per-response) so any reflected
 * <script>...</script> from user input cannot execute. style-src keeps
 * `'unsafe-inline'` because Mapbox GL JS and Leaflet both inject inline
 * styles via DOM manipulation, which Chrome treats as CSP-gated; removing
 * the directive there would break map rendering. EVOYAGE_AUDIT_PLAN.md
 * C24 is therefore partially addressed — full removal needs a follow-up
 * pass on every map library's style-injection paths.
 */
import { NextRequest, NextResponse } from 'next/server';

const ADMIN_USERNAME = 'admin';
const REALM = 'eVoyage Admin';

/**
 * Constant-time string compare suitable for Edge Runtime, which has no
 * access to node:crypto's `timingSafeEqual`. The length-mismatch early-return
 * leaks one bit of information (whether lengths match), which is acceptable
 * here — ADMIN_USERNAME and ADMIN_TOKEN have known fixed lengths client-side,
 * so an attacker varying input length learns nothing useful.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function unauthorized(): NextResponse {
  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

/** Run the admin Basic Auth check. Returns null on success; 401 response on failure. */
function checkAdminAuth(request: NextRequest): NextResponse | null {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) return unauthorized();

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Basic ')) return unauthorized();

  let decoded: string;
  try {
    decoded = atob(authHeader.slice('Basic '.length));
  } catch {
    return unauthorized();
  }

  const sepIdx = decoded.indexOf(':');
  if (sepIdx === -1) return unauthorized();

  const user = decoded.slice(0, sepIdx);
  const pass = decoded.slice(sepIdx + 1);

  if (!constantTimeEqual(user, ADMIN_USERNAME) || !constantTimeEqual(pass, adminToken)) {
    return unauthorized();
  }
  return null;
}

/** Generate a base64 nonce. 16 bytes = 128 bits — plenty for per-request anti-replay. */
function generateNonce(): string {
  // crypto.randomBytes isn't available on edge runtime; use Web Crypto.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Buffer not on edge either — use btoa with a binary string built from bytes.
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // Script: nonce-based. 'strict-dynamic' lets nonce'd scripts load further
    // scripts without each transitive load needing its own nonce.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'`,
    // 'unsafe-inline' is a fallback for older browsers that ignore nonce +
    // strict-dynamic; modern browsers ignore 'unsafe-inline' when a nonce is
    // present. Net effect: secure in modern browsers, functional everywhere.
    "style-src 'self' 'unsafe-inline' api.mapbox.com",
    "connect-src 'self' *.mapbox.com maps.googleapis.com nominatim.openstreetmap.org router.project-osrm.org overpass-api.de *.supabase.com",
    "img-src 'self' data: blob: *.openstreetmap.org *.googleapis.com *.mapbox.com *.basemaps.cartocdn.com *.vinfastauto.com",
    "font-src 'self'",
    "worker-src 'self' blob:",
    "frame-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const isAdmin = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');

  if (isAdmin) {
    const authFail = checkAdminAuth(request);
    if (authFail) return authFail;
  }

  const nonce = generateNonce();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', buildCsp(nonce));
  return response;
}

export const config = {
  // Match every path except Next internals, static assets, and image files.
  // Admin auth is decided inside the function (not matcher-gated) so that the
  // nonce is also applied to /admin pages.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|robots.txt|sitemap.xml|.*\\..*).*)',
  ],
};
