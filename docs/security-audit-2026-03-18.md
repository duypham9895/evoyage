# EVoyage Security Audit Report

**Date:** 2026-03-18
**Scope:** API endpoint and runtime security
**Auditor:** Head of DevSecOps (automated review)
**Project path:** `/Users/edwardpham/Documents/Programming/Projects/evoyage/`

---

## Executive Summary

The EVoyage codebase is well-structured for a Next.js 16 app. There are **no dependency CVEs**, no raw SQL, no eval/innerHTML usage, and secrets are correctly kept server-side where possible. However, two CRITICAL issues were found: live credentials stored in the `.env` file that must be rotated immediately, and a complete absence of rate limiting across all public API endpoints. Several HIGH and MEDIUM issues compound the exposure.

---

## Findings Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 2 | Requires immediate action |
| HIGH | 4 | Address before next release |
| MEDIUM | 3 | Address in next sprint |
| LOW | 3 | Informational |

---

## CRITICAL Findings

### C-1: Live Credentials in `.env` File

**File:** `.env`
**Risk:** If this file is accidentally committed, pushed, or read by a compromised build process, all services are fully compromised.

The `.env` file contains:

- A live Supabase `DATABASE_URL` with plaintext password embedded in the connection string
- A live Supabase `DIRECT_URL` with the same password
- A live `GOOGLE_MAPS_API_KEY` (`AIzaSyDxSZFY1bEiHiddXMPJImYpwnBZ_rqn67Q`)
- A live `MAPBOX_ACCESS_TOKEN` (`pk.eyJ1IjoiZHV5cGhhbTk4OTUiLCJhIjoiY...`)

The `.gitignore` correctly excludes `.env*`, so these are not in the git history. However, the password `47iozg2bwotmCD2` and the API keys above are now visible in this audit context and should be considered exposed.

**Immediate actions required:**

1. Rotate the Supabase database password at `https://supabase.com/dashboard/project/xnxjeofmtwwqeagdgycr/settings/database`
2. Regenerate the Google Maps API key in Google Cloud Console
3. Rotate the Mapbox access token at `https://account.mapbox.com/access-tokens/`
4. Regenerate the `CRON_SECRET` value
5. Update all rotated values in your Vercel project environment variables

**Note:** The `.env.example` file is correctly sanitized with placeholder values — that file is safe.

---

### C-2: No Rate Limiting on Any Public API Endpoint

**Files:**
- `src/app/api/route/route.ts`
- `src/app/api/stations/route.ts`
- `src/app/api/vehicles/route.ts`

There is no middleware file (`src/middleware.ts`), no `express-rate-limit`, no Upstash Redis rate limiting, and no Vercel Edge rate limiting configured on any route.

`POST /api/route` is the highest-risk endpoint. Each request triggers:

- A database query for vehicle lookup
- An external API call to Google Directions, Mapbox, or OSRM (costs money or has quota limits)
- A bounding-box database query against `ChargingStation`
- Two cache read/write operations against `RouteCache`

An attacker can flood this endpoint with minimal effort, causing:

- Google Maps API quota exhaustion and unexpected billing
- Mapbox API quota exhaustion
- Database connection pool saturation (Prisma uses a single shared client)
- Supabase request limit exhaustion on free/pro tiers

**Remediation:** Add Vercel KV or Upstash Redis rate limiting via middleware. A minimal example:

```typescript
// src/middleware.ts
import { NextRequest, NextResponse } from 'next/server';

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20; // per IP

// Use Upstash Redis @upstash/ratelimit for production
export function middleware(request: NextRequest) {
  // Implement IP-based rate limiting here
  // See: https://github.com/upstash/ratelimit
}

export const config = {
  matcher: '/api/:path*',
};
```

For immediate protection without Redis, add a `X-RateLimit` check using Vercel's built-in edge config or restrict the route with authentication.

---

## HIGH Findings

### H-1: NEXT_PUBLIC_ Google Maps API Key Is the Same as the Server-Side Key

**File:** `.env`
**Lines:** `GOOGLE_MAPS_API_KEY` and `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` share the same key value.

`NEXT_PUBLIC_` variables are embedded into the client-side JavaScript bundle and are visible to every browser that loads the app. A server-side key with unrestricted permissions embedded in client code allows anyone to extract it from the browser DevTools and use it for billing fraud.

**Remediation:**

- Create two separate API keys in Google Cloud Console
- Server-side key (`GOOGLE_MAPS_API_KEY`): restrict to "IP addresses" — add your Vercel deployment IP ranges or restrict to "None" to server-only use
- Client-side key (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`): restrict to "HTTP referrers" — add `https://evoyagevn.vercel.app/*` and any preview deployment URLs
- Enable only the APIs each key needs (server key: Directions API only; client key: Maps JavaScript API, Places API only)

---

### H-2: Google Directions Error Message Leaks API Status Codes to Callers

**File:** `src/lib/google-directions.ts`, line 47
**File:** `src/app/api/route/route.ts`, line 272 (catch block passes error to generic handler)

```typescript
throw new Error(`Google Directions: ${data.status} — ${data.error_message ?? 'No route found'}`);
```

`data.error_message` from the Google Directions API can contain internal diagnostic strings. Although the `POST /api/route` catch block at line 272 returns a generic `"Route calculation failed"` message, this error is also logged with `console.error('Route calculation error:', error)`. In a cloud environment like Vercel, these server logs are accessible to anyone with project access and may contain strings that reveal the API key's associated project ID or quota state.

**Remediation:** Strip external API error messages before logging:

```typescript
// In google-directions.ts — throw a sanitized error
throw new Error(`Google Directions returned status: ${data.status}`);
// data.error_message is discarded
```

---

### H-3: `GET /api/stations` Has No Bounding Box Size Limit

**File:** `src/app/api/stations/route.ts`, lines 42–46

```typescript
const [lat1, lng1, lat2, lng2] = bounds.split(',').map(Number);
if ([lat1, lng1, lat2, lng2].every((n) => !isNaN(n))) {
  where.latitude = { gte: Math.min(lat1, lat2), lte: Math.max(lat1, lat2) };
  where.longitude = { gte: Math.min(lng1, lng2), lte: Math.max(lng1, lng2) };
}
```

A caller can supply `bounds=-90,-180,90,180` (entire globe) and the query runs without restriction. Combined with no rate limiting (C-2), this can return all rows in the `ChargingStation` table on every request, saturating database connections and transferring large payloads over and over.

Additionally, `connectorType` is documented as a supported query parameter in the route comment but is never actually filtered in the implementation — this is a dead parameter that may confuse API consumers.

**Remediation:**

```typescript
// Enforce a maximum bounding box size
const MAX_BBOX_DEGREES = 5.0; // ~550km x ~550km
const latDelta = Math.abs(lat2 - lat1);
const lngDelta = Math.abs(lng2 - lng1);
if (latDelta > MAX_BBOX_DEGREES || lngDelta > MAX_BBOX_DEGREES) {
  return NextResponse.json({ error: 'Bounding box too large' }, { status: 400 });
}
```

Also remove `connectorType` from the JSDoc comment or implement the filter.

---

### H-4: Missing HSTS and Content Security Policy Headers

**File:** `next.config.ts`

The current security headers are:

```
X-Frame-Options: DENY                         (good)
X-Content-Type-Options: nosniff               (good)
Referrer-Policy: strict-origin-when-cross-origin (good)
Permissions-Policy: camera=(), microphone=(), geolocation=() (good)
```

Missing critical headers:

- **`Strict-Transport-Security` (HSTS):** Without this, browsers do not enforce HTTPS-only connections, enabling protocol downgrade attacks. Vercel serves over HTTPS, but the header should be explicit.
- **`Content-Security-Policy` (CSP):** Without a CSP, any injected script from a third-party dependency or XSS vector runs with full page privileges. The app uses Google Maps, Mapbox, and Leaflet — all need `script-src` and `connect-src` entries.

**Remediation:**

```typescript
// next.config.ts additions
{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
{
  key: 'Content-Security-Policy',
  value: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com https://api.mapbox.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.mapbox.com",
    "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.openstreetmap.org https://api.mapbox.com",
    "connect-src 'self' https://maps.googleapis.com https://api.mapbox.com https://overpass-api.de https://nominatim.openstreetmap.org https://router.project-osrm.org",
    "font-src 'self' https://fonts.gstatic.com",
    "frame-ancestors 'none'",
  ].join('; '),
},
```

---

## MEDIUM Findings

### M-1: `vehicleId` Is Not Validated as CUID Format Before Database Lookup

**File:** `src/app/api/route/route.ts`, line 28

```typescript
vehicleId: z.string().nullable(),
```

`vehicleId` accepts any string of any length and is passed directly to `prisma.eVVehicle.findUnique({ where: { id: vehicleId } })`. While Prisma's ORM prevents SQL injection, a crafted string like a 10,000-character input is a valid Zod string and will be sent to the database unnecessarily.

**Remediation:**

```typescript
vehicleId: z.string().cuid().nullable(),
// or: z.string().regex(/^c[a-z0-9]{24}$/).nullable()
```

---

### M-2: `customVehicle` String Fields Have No Maximum Length

**File:** `src/app/api/route/route.ts`, lines 31–32

```typescript
brand: z.string().min(1),
model: z.string().min(1),
```

`customVehicle.brand` and `customVehicle.model` have no upper bound. They are not stored in the database in this code path, but they are used in the constructed `vehicle` object and may be logged or returned in error scenarios.

**Remediation:**

```typescript
brand: z.string().min(1).max(100),
model: z.string().min(1).max(100),
chargingPortType: z.string().max(50).optional(),
```

---

### M-3: Prisma Client Instantiated Without Logging Configuration

**File:** `src/lib/prisma.ts`

```typescript
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
```

`PrismaClient` is instantiated with no log configuration. By default in development, Prisma logs queries to stdout, which may appear in Vercel function logs. These query logs can reveal table structure, filter values, and data counts.

**Remediation:**

```typescript
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
```

---

## LOW Findings

### L-1: No Database Connection Timeout Configured

**File:** `prisma/schema.prisma`

The `DATABASE_URL` uses Supabase with `pgbouncer=true&connection_limit=1`, which is the correct setting for serverless. However, there is no `connect_timeout` or `pool_timeout` in the connection string. A slow database connection will cause the Next.js API route to hang until Node's default socket timeout.

**Remediation:** Append `&connect_timeout=10&pool_timeout=10` to both `DATABASE_URL` and `DIRECT_URL`.

---

### L-2: Cron Endpoint Timing Side-Channel

**File:** `src/app/api/cron/refresh-stations/route.ts`, lines 63–72

The `CRON_SECRET` check uses string equality `authHeader !== \`Bearer ${cronSecret}\``. JavaScript string comparison is not constant-time. For a secret of this criticality, a timing-safe comparison should be used.

**Remediation:**

```typescript
import { timingSafeEqual } from 'crypto';

function verifySecret(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

if (!verifySecret(authHeader ?? '', `Bearer ${cronSecret}`)) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

---

### L-3: `GET /api/vehicles` and `GET /api/stations` Have No Pagination

Both endpoints return all matching rows in a single response with no `limit`/`offset` or cursor-based pagination. While the current dataset is small, unbounded queries become a denial-of-service vector as the database grows.

**Remediation:** Add `limit` (default: 100, max: 500) and `offset` query parameters and enforce them in both routes.

---

## Dependency Audit

```
npm audit result: 0 vulnerabilities found
```

All production dependencies are clean. No action required.

---

## Positive Security Practices (What Is Done Well)

- Server-side secrets (`GOOGLE_MAPS_API_KEY`, `MAPBOX_ACCESS_TOKEN`, `DATABASE_URL`) are correctly accessed via `process.env` only in server-side API routes, never passed to client responses
- All external HTTP calls use `AbortSignal.timeout(10000)` — prevents hanging requests
- `POST /api/route` uses a comprehensive Zod schema with numeric bounds on all floating-point fields
- Prisma ORM is used exclusively — no raw SQL string concatenation anywhere in the codebase
- The cron endpoint correctly requires `CRON_SECRET` authorization before executing
- `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff` are set globally
- No `eval`, `dangerouslySetInnerHTML`, shell execution, or `innerHTML` usage found
- `.env` is correctly gitignored; `.env.example` uses placeholder values only
- Generic error messages are returned to callers from catch blocks (no stack traces leaked)

---

## Prioritized Remediation Checklist

### Immediate (before next deployment)

- [ ] **C-1:** Rotate Supabase database password
- [ ] **C-1:** Rotate Google Maps API key
- [ ] **C-1:** Rotate Mapbox access token
- [ ] **C-1:** Rotate CRON_SECRET
- [ ] **C-1:** Update all secrets in Vercel project environment variables
- [ ] **H-1:** Create separate restricted API keys for client vs server use

### This sprint

- [ ] **C-2:** Implement rate limiting on `/api/route`, `/api/stations`, `/api/vehicles`
- [ ] **H-3:** Add bounding box size cap to `GET /api/stations`
- [ ] **H-4:** Add HSTS header to `next.config.ts`
- [ ] **H-4:** Add Content-Security-Policy header to `next.config.ts`

### Next sprint

- [ ] **M-1:** Add `.cuid()` validation to `vehicleId` field in Zod schema
- [ ] **M-2:** Add `.max()` constraints to `customVehicle.brand` and `customVehicle.model`
- [ ] **M-3:** Configure Prisma log levels to suppress query logs in production
- [ ] **L-1:** Add connection timeout parameters to DATABASE_URL
- [ ] **L-2:** Replace string equality cron secret check with `timingSafeEqual`
- [ ] **L-3:** Add pagination to `/api/stations` and `/api/vehicles`
- [ ] **H-2:** Sanitize Google Directions error messages before logging
