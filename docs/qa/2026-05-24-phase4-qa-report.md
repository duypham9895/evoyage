# Phase 4 QA Report — 2026-05-24

> **Scope:** EVOYAGE_AUDIT_PLAN.md §E (111 test cases) executed against
> branch `main` at HEAD `14abbf8` (post-Phase-3, post-CSP-fix).
> **Method:** automated suites (vitest + Playwright) + manual passes via
> chrome-devtools MCP and curl against local `npx next start` build.
> **Server:** Node 22, Next 16.1.7, port 3100, no Upstash env (uses
> in-memory rate limiter fallback — local-dev configuration).

---

## Baseline (TC-suite-001 / 002 / 003)

| Check | Result |
|---|---|
| `npm test` (vitest) | ✅ **1304 / 1304** passing across 115 files, 10.7 s |
| `npx playwright test --project='Desktop Chrome'` | ✅ **22 / 22** passing, 38.9 s |
| `npx next build` (clean) | ✅ 0 errors, 0 warnings |
| TypeScript (`tsc --noEmit`) | ✅ No errors |

---

## Coverage matrix (P0 / P1)

✅ = verified pass · 🆗 = covered by automated suite · ⚠️ = new finding (see §Findings)

### Trip planning (§E.1)

| TC | Coverage | Notes |
|---|---|---|
| TC-trip-001 happy path HCMC→Vũng Tàu | 🆗 | `e2e/trip-planning.spec.ts` |
| TC-trip-002 unreachable destination | 🆗 | Covered by unit + e2e |
| TC-trip-003 empty input validation | 🆗 | Form-level disabled state verified manually (button disabled until both inputs valid) |
| TC-trip-004 waypoints | 🆗 | `e2e/trip-planning.spec.ts` |
| TC-trip-006 /api/route rate limit | ✅ | Limiter wired; falls back to in-memory locally (prod gap — see F2) |
| TC-trip-007 RouteCache hit | 🆗 | Unit test on `route-cache.ts` |
| TC-trip-008 OSRM → Mapbox fallback | 🆗 | Unit test on `mapbox-directions-fallback.ts` |

### Map experience (§E.2)

| TC | Coverage | Notes |
|---|---|---|
| TC-map-001 Map mode toggle persists | ✅ | OSM ↔ Mapbox both render under nonce CSP; legacy `google` migration unit-tested |
| TC-map-006 MapLocateButton permission granted | 🆗 | Component + hook tests |
| TC-map-007 MapLocateButton permission denied | 🆗 | Component test |
| TC-map-008 No hydration mismatch | ✅ | Verified at `/plan` — zero console messages on Desktop + mobile viewports |

### eVi AI (§E.3)

| TC | Coverage | Notes |
|---|---|---|
| TC-evi-001/002 NL parse vi/en | 🆗 | `e2e/evi-chat.spec.ts` + unit suite |
| TC-evi-003 MiMo → MiniMax fallback | 🆗 | `src/lib/evi/llm-module.test.ts` |
| TC-evi-007/008/009 Whisper STT happy/abuse/oversized | 🆗 | `src/app/api/transcribe/route.test.ts` (11 cases incl. rate-limit boundary added in Phase 1) |
| TC-evi-010 schema error path | 🆗 | `llm-module.test.ts` |
| TC-evi-012 trackEviMessage fires | 🆗 | `useEVi-telemetry.test.ts` (Phase 2) |

### Stations data (§E.4)

| TC | Coverage | Notes |
|---|---|---|
| TC-station-008 status report happy path | 🆗 | `e2e/nearby-stations.spec.ts` + route test |
| TC-station-009 invalid status `BANANA` | ✅ | Manual: `POST /api/stations/X/status-report {status:"BANANA"}` → `400 {success:false,error:"INVALID_STATUS"}` |
| TC-station-010 non-existent station | 🆗 | Route test |
| TC-station-012 status report rate limit | 🆗 | Limiter wired (in-memory locally) |
| TC-station-013 cron auth — no bearer | ✅ | Manual: `POST /api/cron/aggregate-{reliability,popularity},/poll-station-status` (no auth) → all 401 |
| TC-station-015 reliability aggregation | 🆗 | `src/lib/station/aggregate-reliability.test.ts` |
| TC-station-016 popularity aggregation | 🆗 | `src/lib/station/aggregate-popularity.test.ts` |

### Feedback + admin (§E.5)

| TC | Coverage | Notes |
|---|---|---|
| TC-feedback-001 REPORT_ISSUE happy path | 🆗 | Route test |
| TC-feedback-003 invalid category | ✅ | Manual: `POST /api/feedback {category:"BANANA",description:"...10+chars..."}` → `400 Dữ liệu không hợp lệ` with Zod issue details |
| TC-feedback-004 rate limit | 🆗 | Limiter wired |
| TC-feedback-005 IP hashing | 🆗 | `route.test.ts:71` asserts `ipHash` is 64-char hex and raw IP doesn't leak |
| TC-feedback-006 image upload happy path | 🆗 | `src/app/api/feedback/upload/route.test.ts` (12 cases incl. Vercel Blob 502, magic-byte sniff) |
| TC-feedback-007 oversized image | 🆗 | Upload route test |
| TC-feedback-008 wrong type (magic-byte) | ✅ | Manual: `POST /api/feedback/upload` with `text/plain` bytes labeled `image/jpeg` → `415` (magic-byte sniff rejects, no Blob write) |
| TC-feedback-009 admin unauth | ✅ | Manual: `GET /admin/feedback` (no auth) → `401 + WWW-Authenticate: Basic + X-Robots-Tag: noindex,nofollow` |
| TC-feedback-009b admin wrong password | ✅ | Manual: same with `admin:wrong-password` → `401` |
| TC-feedback-009c admin correct password | ✅ | Manual: `admin:$ADMIN_TOKEN` → `200`, 21 KB HTML with `Feedback inbox` heading and 5 status filter chips (`NEW`, `IN_REVIEW`, `RESOLVED`, `CLOSED`, `ALL`) |
| TC-feedback-010 admin status PATCH | 🆗 | `src/app/api/admin/feedback/[id]/route.test.ts` (7 cases) |
| TC-feedback-011 admin noindex | ✅ | Verified via `X-Robots-Tag` header + `metadata.robots = { index: false }` in `src/app/admin/layout.tsx` |

### Sharing (§E.6)

| TC | Coverage | Notes |
|---|---|---|
| TC-share-001/002/003 short URL flow | 🆗 | `src/lib/short-url.test.ts` |
| TC-share-006 expiresAt enforcement | 🆗 | `resolveShortUrl` test + Phase 2 default (1y TTL on create) |

### i18n (§E.8)

| TC | Coverage | Notes |
|---|---|---|
| TC-i18n-001 locale toggle | ✅ | Manual: Tap `EN` button on `/` — title, h1, hero copy, vehicle specs (Range/Battery/DC fast charge ↔ Tầm xa/Pin/Sạc nhanh DC), all FAQ items, footer all switch |
| TC-i18n-002 en/vi parity test | 🆗 | `src/lib/__tests__/locale-keys.test.ts` |
| TC-i18n-003 document.title syncs | ✅ | Manual: title goes `eVoyage — Lên kế hoạch chuyến đi xe điện tại Việt Nam` ↔ `eVoyage — Plan your EV road trip across Vietnam` |
| TC-i18n-004 hero img alt localizes | ⚠️ | See F5 |

### Analytics (§E.9)

| TC | Coverage | Notes |
|---|---|---|
| TC-analytics-001 PostHog gating (no key) | 🆗 | `src/lib/analytics.test.ts` (3 gating cases) |
| TC-analytics-002 PostHog gating (dev env) | 🆗 | Same |
| TC-analytics-003 trackPageView fires | 🆗 | `src/components/AnalyticsProvider.test.tsx` (5 cases — Phase 2) |
| TC-analytics-005 backup_alternatives_distribution event | 🆗 | Unit test on the analytics module |

### Mobile / PWA / responsive (§E.10)

| TC | Coverage | Notes |
|---|---|---|
| TC-mobile-001 MobileBottomSheet | 🆗 | Component test + visual on 393×852 |
| TC-mobile-002 MobileTabBar | 🆗 | Component test |
| TC-mobile-003 DesktopTabBar at 1440×900 | ✅ | Visual confirmed: 4 tabs horizontal, no MobileBottomSheet, eVi panel mounted as sidebar |
| TC-mobile-005 manifest.json | 🆗 | `pwa-manifest.test.ts` |
| **Mobile 393×852 /plan smoke** | ✅ | Visual: header collapses to logo + EN toggle; map mode toggle hidden (by design); bottom sheet with 5 tabs (Tuyến đường / Xe / Pin / Trạm sạc / Đã lưu); sample chips; locate button; eVi FAB + Feedback FAB; drag handle present |

### Security / abuse boundaries (§E.11)

| TC | Coverage | Notes |
|---|---|---|
| TC-sec-001 CSRF / GET cannot mutate | ✅ | Manual: `GET` on `/api/feedback`, `/api/short-url`, `/api/route`, `/api/stations/X/status-report`, `/api/feedback/upload`, `/api/transcribe` → all `405` |
| TC-sec-002 IP hash unspoofable | 🆗 | `rate-limit.ts` test: `x-vercel-forwarded-for` preferred over `x-forwarded-for` |
| TC-sec-003 cron — invalid bearer | 🆗 | `src/lib/cron-auth.ts` test |
| TC-sec-004 cron — missing bearer | ✅ | Manual (see TC-station-013) |
| TC-sec-005 cron — timing safe | 🆗 | `cron-auth.ts` uses `timingSafeEqual` (Node runtime, not Edge — different from middleware) |
| TC-sec-006 CSP + HSTS present | ✅ | Manual: `curl -I /` returns all 6 headers (HSTS w/ 2y max-age + preload, CSP with `script-src 'self' 'nonce-...' 'strict-dynamic' https: 'unsafe-inline'`, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy) |
| TC-sec-007 dangerouslySetInnerHTML escaping | ✅ | `src/app/page.tsx:55` `.replace(/</g, '\\u003c')` on JSON-LD payload + nonce attribute |
| TC-sec-009 rate limiter degrade in production | ⚠️ | See F2 — Upstash env vars not set in production, currently using in-memory fallback |
| TC-sec-010 /admin noindex | ✅ | (See TC-feedback-011) |

### Operations / CI (§E.12)

| TC | Coverage | Notes |
|---|---|---|
| TC-ops-001 deploy.yml green | ✅ | Last 3 deploys all `success` (post-Phase-2 CI hardening) |
| TC-ops-003 branch protection blocks force-push | ✅ | Phase 1 — applied via `gh api`, verified by `gh api repos/duypham9895/evoyage/branches/main/protection` |
| TC-ops-005 cookie-refresh resilience | 🆗 | Phase 2 — `scripts/refresh-vinfast-cookies.ts` retry loop |
| TC-ops-006 poll-status downgrade | 🆗 | Phase 2 — `.github/workflows/poll-station-status.yml` checks sibling-workflow status before failing |

### Design system (§E.13)

| TC | Coverage | Notes |
|---|---|---|
| TC-design-001 no decorative emoji | ✅ | Phase 1 audit confirmed `🇻🇳/🌍`, `🔋/📏/⚡` already removed from interactive UI (DESIGN.md compliance was already shipped pre-audit) |
| TC-design-003 footer GitHub link | ✅ | `src/components/landing/LandingPageContent.tsx:414` → `https://github.com/duypham9895/evoyage` (verified click in browser → 200) |
| TC-design-004 touch targets ≥44px | 🆗 | Mobile UX audit shipped pre-Phase-1 |

---

## Findings (newly discovered during Phase 4)

### F1 — Upstash Redis env vars missing in production **[P0]**

**Severity:** P0 (security / abuse cap absent in production)
**Discovered:** Phase 4 manual ops, while listing `vercel env list`.

`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are documented in `.env.example` (Phase 1) and required by `src/lib/rate-limit.ts:46` to wire the distributed limiter. They are **not** set in the production Vercel project. The codebase explicitly handles this:

```ts
// src/lib/rate-limit.ts:48
if (process.env.NODE_ENV === 'production' && !hasRedis) {
  console.error('[SECURITY] Rate limiting is disabled — UPSTASH_REDIS_REST_URL ...');
}
```

In production today: every public endpoint (`/api/route`, `/api/feedback`, `/api/feedback/upload`, `/api/stations/[id]/status-report`, `/api/short-url`, `/api/transcribe`, `/api/evi/*`, `/api/share-card`, `/api/stations`, `/api/stations/nearby`) falls through to the **in-memory limiter** which is per-Vercel-function-instance and therefore useless against any abuser hitting multiple instances. The cost ceiling on Groq Whisper (Phase 1 / D.8a work), Vercel Blob (Phase 3 / D.3), and the Resend feedback emails is consequently absent in prod.

**Fix:** Provision Upstash Redis (free tier suffices) and add both env vars to all 3 envs. ~5 min via the Vercel marketplace + `vercel env add`.

### F2 — Stale `GOOGLE_MAPS_API_KEY` env vars **[P3]**

`GOOGLE_MAPS_API_KEY` (Production) and `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (Production) remain set in Vercel, but Google Maps was removed in v0.2.0 (`CHANGELOG.md:211`). No code reads them.

**Fix:** `vercel env rm GOOGLE_MAPS_API_KEY production` + same for the public twin. Cosmetic; no leak risk.

### F3 — `FEEDBACK_EMAIL_FROM` not set in production **[P2]**

Production has `FEEDBACK_EMAIL_TO` and `RESEND_API_KEY` but no `FEEDBACK_EMAIL_FROM`. `src/lib/feedback/email.ts:207` reads it; Resend will reject any send without a verified `from` address, so **no feedback emails are currently being delivered** despite `Feedback.emailSent` likely being set. Feedback rows still persist OK.

**Fix:** `vercel env add FEEDBACK_EMAIL_FROM production` with a Resend-verified address (e.g. `feedback@evoyagevn.com` if the domain is verified, or `onboarding@resend.dev` for testing).

### F4 — Stale env var `SCRAPER_API_KEY` **[P3]**

Listed in production env (66 days old) but no code reference. Likely from an earlier crawler iteration.

**Fix:** `vercel env rm SCRAPER_API_KEY` after confirming no scripts read it.

### F5 — `<html lang="vi">` doesn't update on locale toggle **[P3, a11y]**

Toggling EN keeps `<html lang="vi">`. Screen readers will use Vietnamese phonetics on English text. Minor accessibility regression on top of TC-i18n-004 (hero `<img alt>` localization, already fixed via locale key earlier).

**Fix:** Make `lang` dynamic by reading the locale-toggle state in the root layout — requires moving the locale provider above the `<html>` element OR using a client-side effect that mutates `document.documentElement.lang`.

### F6 — CSP smoke-test caught 2 real bugs **[fixed in commit `14abbf8`]**

Phase 4 caught what Phase 3 unit tests didn't:

1. `node:crypto` `timingSafeEqual` import in `src/middleware.ts` crashed on Edge Runtime ("Native module not found"). The middleware tests pass under vitest's Node environment but production uses Edge.
2. Pre-existing static rendering of `/plan` meant the middleware-set `x-nonce` never reached the page's HTML, so Next.js framework chunks loaded without nonces and `strict-dynamic` CSP blocked all 14 of them.

Both fixed by `14abbf8` (Edge-compatible XOR compare + `await headers()` in root layout to force dynamic rendering). Subsequent local smoke against `npx next start` returned zero CSP violations on `/`, `/plan`+OSM, and `/plan`+Mapbox.

**This is the value of in-browser QA over unit tests alone:** middleware unit tests + 1304 vitest cases would never have caught either bug.

---

## Recommendations

### Immediate (before declaring Phase 4 done)

1. **Set Upstash env vars** (F1) — only takes 5 minutes; without it the Phase 1 transcribe rate limit, the Phase 3 feedback-upload rate limit, and every other public POST is uncapped in prod.
2. **Set `FEEDBACK_EMAIL_FROM`** (F3) — otherwise feedback notifications aren't reaching you.
3. **Remove stale Google Maps + Scraper env vars** (F2, F4) — 1-minute cleanup.

### Phase 5 candidates

4. **Fix `<html lang>` reactivity** (F5) — small a11y win.
5. **Add an E2E test for the CSP smoke flow** so F6's class of bug is caught by CI rather than manual passes.

### Backlog (out of audit scope, surfaced by QA)

6. The bottom-of-landing "Trên khắp Việt Nam" stats animate from 0 via IntersectionObserver. On slow connections / fast scrolling, users may see them stuck at 0 momentarily. Worth instrumenting if landing-page polish becomes a focus.

---

## Sign-off

Phase 4 status: **all P0/P1 cases pass** modulo F1 (Upstash) and F3 (Feedback FROM), which are production-env gaps the deployed code is ready for but the Vercel project isn't. No code-level regressions.

Build green, tests green, security headers correct, admin gate enforced, CSP nonce live, both map providers render under the tightened CSP. Safe to proceed to Phase 5 (coverage tests for the 5 untested high-value files, v0.9.0 tag, release.yml smoke).
