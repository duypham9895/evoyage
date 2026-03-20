---
name: api-review
description: Review API route changes for validation, rate limiting, security, and fallbacks
trigger: Any file in src/app/api/** is modified
---

# API Route Review Skill

## Current API Routes

| Route | Method | Rate Limit | Purpose |
|-------|--------|-----------|---------|
| `/api/route` | POST | 10/min | Trip planning |
| `/api/vehicles` | GET | 30/min | Vehicle search (DB + hardcoded fallback) |
| `/api/stations` | GET | 30/min | Station query with bounds |
| `/api/stations/[id]/vinfast-detail` | GET | — | SSE real-time station detail |
| `/api/feedback` | POST | 3/min | Feedback submission (honeypot + timing protection) |
| `/api/short-url` | GET, POST | 3/min | Short URL create/resolve |
| `/api/share-card` | POST | 3/min | OG image generation |
| `/api/cron/...` | POST | — | Daily VinFast station sync |

## Checks

1. **Zod validation present**
   - Every route accepting user input must validate with Zod
   - Check for `z.object()` or imported schema at the top of the handler
   - Request body, query params, and path params must all be validated

2. **Rate limiting configured**
   - Every public-facing route must use `src/lib/rate-limit.ts`
   - Verify the rate limit matches the table above (or document if changed)
   - Cron routes use `src/lib/cron-auth.ts` instead of rate limiting

3. **Error response safety**
   - Error responses must NOT include: stack traces, file paths, SQL queries, internal IDs
   - Use generic error messages: "Internal server error", "Invalid request"
   - 4xx errors can include validation details but not implementation details

4. **Graceful fallbacks**
   - `/api/vehicles`: must fall back to hardcoded vehicles if DB is unavailable
   - `/api/route`: must fall back to Mapbox if OSRM fails
   - `/api/stations`: should handle DB connection errors gracefully
   - Check: does the route have a try/catch with fallback behavior?

5. **Coordinate validation (geo endpoints)**
   - `/api/route`, `/api/stations`: must validate coordinates using `coordinate-validation.ts`
   - Bounds: lat 0-30, lng 95-115
   - Reject requests outside bounds with 400 status

6. **Security checks**
   - `/api/feedback`: verify honeypot field and timing-based bot protection
   - `/api/cron/*`: verify authentication via `cron-auth.ts`
   - No route should expose database schema or Prisma model details
   - Check for proper CORS handling if applicable

## Output Format

```
API Review — {route path}
========================
Zod validation: {PASS/FAIL} — {details}
Rate limiting: {PASS/FAIL} — {limit}/min
Error handling: {PASS/FAIL} — {details}
Fallbacks: {PASS/FAIL} — {details}
Coordinate validation: {PASS/FAIL/N/A}
Security: {PASS/FAIL} — {details}
```
