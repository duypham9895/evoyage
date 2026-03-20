# /deploy — Pre-Deployment Checklist

Run before deploying to Vercel. All checks must pass before pushing to production.

## Steps (execute in order)

### 1. Test Suite
```bash
npx vitest run
```
Must: all tests pass. Block deployment on any failure.

### 2. TypeScript Compilation
```bash
npx tsc --noEmit
```
Must: zero type errors. Block deployment on any error.

### 3. Build Check
```bash
npx next build
```
Must: build succeeds. Check for warnings about large bundles.

### 4. Locale Files in Sync
- Compare `src/locales/vi.json` and `src/locales/en.json` key sets
- Must: identical key sets, matching interpolation params
- Block deployment if out of sync

### 5. No Console.log in Production Code
- Search `src/` for `console.log` (excluding `*.test.*` files)
- `console.error` and `console.warn` are acceptable for error logging
- Must: zero console.log in non-test files

### 6. Environment Variables
Required variables (verify documented in `.env.example` or deployment config):
- `DATABASE_URL` — PostgreSQL connection (Supabase)
- `DIRECT_URL` — Direct PostgreSQL connection
- `UPSTASH_REDIS_REST_URL` — Rate limiting
- `UPSTASH_REDIS_REST_TOKEN` — Rate limiting
- `MAPBOX_ACCESS_TOKEN` — Mapbox fallback routing
- `NEXT_PUBLIC_MAPBOX_TOKEN` — Mapbox client-side
- `RESEND_API_KEY` — Email notifications
- `CRON_SECRET` — Cron job authentication

### 7. Prisma Schema Sync
```bash
npx prisma validate
```
Must: schema valid. Check if any pending migrations need to be applied.

### 8. Security Headers
- Verify `next.config.ts` has security headers configured:
  - Content-Security-Policy
  - Strict-Transport-Security
  - X-Frame-Options
  - X-Content-Type-Options

### 9. Rate Limiting Active
- Verify all public API routes have rate limiting:
  - `/api/route` — 10/min
  - `/api/vehicles` — 30/min
  - `/api/stations` — 30/min
  - `/api/feedback` — 3/min
  - `/api/short-url` — 3/min
  - `/api/share-card` — 3/min

### 10. Bundle Size Check
- After build, check `.next/` output for large chunks
- Flag any single chunk >500KB
- Check for accidentally bundled server-only code in client bundles

## Output Format

```
eVoyage Deploy Checklist
=========================

 1. Tests:            {PASS/FAIL}
 2. TypeScript:       {PASS/FAIL}
 3. Build:            {PASS/FAIL}
 4. Locale sync:      {PASS/FAIL}
 5. Console.log:      {PASS/FAIL}
 6. Env vars:         {documented/missing}
 7. Prisma:           {PASS/FAIL}
 8. Security headers: {PASS/FAIL}
 9. Rate limiting:    {PASS/FAIL}
10. Bundle size:      {OK/warnings}

Ready to deploy: {YES/NO — fix N issues first}
```
