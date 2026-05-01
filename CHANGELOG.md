# Changelog

All notable changes to eVoyage are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/). Versioning follows [Semantic Versioning](https://semver.org/).

## [0.6.2] — 2026-05-01

### Fixed
- **Wrong production URL in README** — the "transparency philosophy" link pointed to `https://evoyage.vercel.app` (404), not the live `https://evoyagevn.vercel.app/`. Visitors clicking the only outbound link in the README intro hit a dead page.
- **Wrong clone URL in README and CONTRIBUTING.md** — `https://github.com/phamduy-agilityio/evoyage.git` (404) instead of `https://github.com/duypham9895/evoyage.git`. This is the third stale-username variant shipped to docs after `edwardpham94` (footer, fixed in 0.6.0) and `evoyage` (live URL above) — same class of drift, different surface. Repo-wide grep is now clean.

### Changed
- **Live URL promoted to a prominent line under the tagline** so the "try the app" path is obvious. Previously buried as a "transparency philosophy" link inside the credit line.

## [0.6.1] — 2026-05-01

### Fixed
- **Stale "150+ stations" copy** on the landing page — replaced in 4 places (hero stat counter, mid-page StatCounter, en/vi locale keys for the features grid) with the actual count, "18,000+". Previously made the project look hobby-scale despite shipping with 18,800+ live stations after the recovery.
- **Latent Rules-of-Hooks violation** in `src/components/trip/StationDetailExpander.tsx` — early `if (stationProvider !== 'VinFast') return null` sat before `useCallback`, identical pattern to the bug that crashed `/plan` on desktop in 0.6.0. Caught by the husky/lint-staged pre-commit hook installed in 0.6.0 when the file was touched for the emoji removal — the hook earned its keep within an hour of being installed.
- 3 decorative ⚡ emojis removed: `StationInfoChips` power chip prefix, `StationDetailExpander` power chip prefix, `MapboxMap` popup HTML. Per DESIGN.md "less icons, more humanity" rule. The `ElevationChart` ⚡ markers were kept — they're functional chart status indicators, which DESIGN.md explicitly allows.

### Investigated and reverted (NOT bugs after tracing actual usage)
- `ShareButton`'s render-scope `typeof navigator` check — only consumed inside a modal that opens on user click, so SSR/hydration is over by the time it matters. The "fix" introduced lint errors without fixing anything real.
- `MobileBottomSheet`'s render-scope `window.innerHeight` reads — only affect a `style` attribute, which React silently overwrites on mismatch. Soft warning, not a crash.

## [0.6.0] — 2026-05-01

### Added
- **Trip cost transparency** — every trip now shows electricity cost in VND alongside a gasoline-equivalent comparison so drivers see EV savings before they leave (e.g., HCMC→Đà Lạt at ~200,528 ₫ electricity vs. saving ~294,869 ₫ over gasoline at 60%). Defaults: EVN public charging at 3,500 ₫/kWh, RON95 at 23,000 ₫/L. Constants exported in `src/lib/trip/cost.ts` for easy adjustment.
- **Station status crowdsourcing** — 1-tap "Báo trạm hoạt động / Báo lỗi / Báo đang bận" buttons under every charging stop in trip results. Backed by new `StationStatusReport` Prisma table, rate-limited POST `/api/stations/[id]/status-report` endpoint (5/min/IP), and a denormalized `ChargingStation.lastVerifiedAt` field updated on `WORKING` reports.
- **Mapbox Directions fallback** — when OSRM returns 5xx (502/503/504) or network-fails, routing transparently falls back to Mapbox Directions API (using the existing `MAPBOX_ACCESS_TOKEN`). Returns include a `provider: 'osrm' | 'mapbox'` field; UI shows a small text note when Mapbox was used. 4xx errors from OSRM still propagate as real failures. Eliminates the single-point-of-failure that took down trip planning during the 2026-05-01 OSRM outage.
- **PostHog product analytics** — instrumented 6 user events (`trackPageView`, `trackTripPlanned`, `trackStationTapped`, `trackFeedbackOpened`, `trackEviMessage`, `trackShareClicked`). Defense-in-depth gating: no-op unless `NODE_ENV === 'production'` AND `NEXT_PUBLIC_POSTHOG_KEY` is set. No PII captured (only opaque IDs, enums, aggregate distances).
- **Disaster recovery runbook** at [docs/RECOVERY.md](./docs/RECOVERY.md) — severity classification (paused / deleted / corrupted), step-by-step rebuild commands, post-recovery checklist, smoke-test endpoints. Based on a real 2026-04-30 incident (~30 min recovery from total DB deletion).
- **Pre-commit lint hook** via husky + lint-staged — runs `eslint --quiet` on staged `.ts/.tsx` files and blocks commits with new ESLint errors (catches Rules-of-Hooks violations, unused imports, etc.). Sub-second on typical commits; the 6,388-warning legacy backlog doesn't block anything.

### Changed
- VinFast station crawler cron re-enabled in `.github/workflows/crawl-stations.yml` (`0 1 * * *` UTC = 08:00 Asia/Saigon daily). GitHub Actions secrets (`DATABASE_URL`, `DIRECT_URL`) updated to point at the recovered Supabase project. Crawl runtime is ~3-5 min, well under the free-tier minute budget.
- `scripts/seed-vietnam-models.ts` now derives `efficiencyWhPerKm` from `(batteryCapacityKwh * 1000) / officialRangeKm` at seed time, so future re-seeds can't reintroduce nulls.
- `scripts/seed-osm-stations.ts` adds explicit `Accept` and `User-Agent` headers to the Overpass API fetch (was returning 406 due to missing UA).
- README + CLAUDE.md test counts refreshed (606 → 713 across 45 → 53 files); README now mentions 18,000+ stations (up from 150+).
- BrandModelSelector vehicle filter tabs and selected-vehicle stats no longer use emoji icons (DESIGN.md "less icons, more humanity" rule); BatteryStatusPanel driving-style buttons same.

### Fixed
- **Trip cost section was always invisible** — every seeded vehicle had `efficiencyWhPerKm: null`, and the cost component correctly no-op'd when missing. Three-layer fix: UI fallback computes efficiency from battery+range when the field is null; seed script populates the field for new entries; in-session DB backfill applied to the 15 existing rows (range 89–207 Wh/km across the VinFast + BYD lineup).
- **`/plan` crashed on desktop** with "Application error: a client-side exception has occurred" — `MapLocateButton` had an early `return null` before `useCallback` and `useEffect`, a Rules-of-Hooks violation that stayed dormant until a hydration fix made `geolocationSupported` toggle false→true on mount, which changed the hook count between renders. Moved the early return after all hooks.
- **Hydration mismatch warning** on `/plan` — replaced inline `typeof window !== 'undefined' && 'geolocation' in navigator` (always false on SSR, true on client) with a `useState(false)` + `useEffect`-on-mount pattern so server and client render the same DOM on first paint.
- Footer GitHub link pointed at the wrong account (`edwardpham94/evoyage` → 404). Now correctly links to `duypham9895/evoyage`.
- Hero map's `aria-label` was hardcoded Vietnamese in both languages; moved to a `hero_map_alt` locale key so it translates with the language toggle.
- Removed two unused parameters in `scripts/seed-osm-stations.ts` (`lng` in `inferProvince`, `c` in `connectorTypes.map`) flagged by TypeScript.

### Infrastructure
- Multi-agent parallel build pattern: 5 worktree-isolated agents shipped 5 features in parallel (analytics, cost, station status, code quality, docs), with a 6th synthesizer agent merging clean branches into main per "Option B" policy (auto-merge on tests-pass + no-warnings). Cross-branch locale keys merged via `.work/locale-additions/*.json` snippets.
- `.gitignore` extended to exclude `.claude/worktrees/`, `.claude/scheduled_tasks.lock`, `.context/`, and `/test-results/`.
- `package.json` version bumped from `0.2.0` to `0.6.0` to align with the CHANGELOG numbering scheme that began at `0.5.x`.

## [0.5.1] — 2026-03-23

### Added
- **Cross-browser E2E testing suite** — 10 Playwright spec files covering trip planning, eVi chat, nearby stations, bottom sheet gestures, desktop tabs, vehicle selection, sharing, bilingual toggle, feedback FAB, and URL state restoration
- **5-project Playwright config** — Desktop Chrome/Safari/Firefox + Mobile Chrome/Safari with custom viewports (393x852 mobile, 1440x900 desktop)
- **Mock fixture system** — `e2e/fixtures/` with deterministic JSON responses for Nominatim, route, vehicles, stations, eVi parse, and short URL APIs
- **Shared E2E helpers** — `e2e/helpers/app.ts` with `mockAPIs()`, `navigateToPlan()`, `waitForAppReady()`, `completeTripPlan()`, `switchToTab()` utilities
- **CI E2E integration** — Playwright browser caching + E2E step in GitHub Actions deploy workflow with artifact upload on failure
- `npm run test:e2e` and `npm run test:e2e:real` scripts for automated and real-API E2E runs

### Changed
- Playwright config: `retries` increased from 1 to 2, added `video: 'retain-on-failure'`
- Feedback FAB spec: replaced `waitForTimeout` anti-pattern with `expect().toPass()` polling assertions, extended with form submission tests

### Fixed
- Replaced `waitForTimeout(300)` and `waitForTimeout(100)` in feedback spec with deterministic `expect().toPass()` assertions (Playwright best practice)

## [0.5.0] — 2026-03-23

### Added
- **Smart Map Markers** — 4-dimensional visual encoding for station markers: size encodes charging power (20/28/36px), ring color encodes status (green/amber/gray/dashed), compatibility dot (green/red), provider color fill. Drivers can scan and decide at a glance without tapping individual markers.
- **Rich Mini-Card popups** — tapping a station marker shows a detailed card with distance, power, connector type, ports, status badge, compatibility, estimated charge time, "Ask eVi" bridge button, and "Navigate" link. Replaces basic text popups.
- **eVi Bridge** — cross-surface integration between eVi chat and the map via lightweight `station-events.ts` event emitter (zero dependencies, native `EventTarget`):
  - "Show on Map" button on eVi station cards highlights the station with fly-to + pulse animation
  - "Ask eVi about this station" button on map popups pre-fills the eVi chat input
  - Auto-switches to eVi tab on both mobile and desktop when triggered from map
- **StationCard component** — extracted from EVi.tsx for reusable station card rendering with "Show on Map" and "Navigate" buttons
- **3-tab desktop sidebar** — eVi | Plan Trip | Stations tab layout with animated transitions
- 11 bilingual locale keys (EN + VI) for map status, mini-card labels, and station card actions
- Localized mini-card popups — status labels, buttons, and disclaimers use locale strings

### Changed
- Station markers upgraded from uniform 22px circles to variable-size smart markers
- Nearby station popups upgraded from basic text to rich mini-card format
- Map.tsx uses DOM event listeners instead of global `window` callbacks (XSS hardening)
- Status maps handle both UPPERCASE (VinFast API) and lowercase status values

### Fixed
- Status ring would show "unknown" for all stations due to case mismatch between API (UPPERCASE) and rendering (lowercase)
- Station ID mismatch between StationCard (lat-lng key) and Map.tsx (DB id) that prevented highlight from working
- "Ask eVi" pre-fill text was hardcoded English — now uses locale key `evi_ask_about_station` for bilingual support
- Mini-card distance displayed raw floating point (e.g., 2.345678 km) — now rounded to 1 decimal
- Double haptic feedback on desktop tab click — removed duplicate call in DesktopTabBar

## [0.4.0] — 2026-03-22

### Added
- **Find Nearby Stations — accessible anywhere** — two entry points for quick station discovery:
  - Map locate button: one-tap GPS, station markers on map with distance labels, compact info bar
  - eVi chat: ask "tìm trạm sạc gần đây" for personalized results with vehicle compatibility and charge time estimates
- `POST /api/stations/nearby` endpoint with vehicle lookup, compatibility filtering, and charge time calculation using `getEffectivePowerKw` + `calculateChargeTimeMin`
- eVi station search intent detection via extended LLM prompt and Zod schema (`isStationSearch`, `stationSearchParams`)
- `useEVi` hook auto-fetches station data when LLM returns station search intent
- `MapLocateButton` component with one-shot GPS, info bar, error toasts (permission denied, unavailable, timeout), and 10s auto-dismiss
- `Map.tsx` nearby stations layer with user location blue dot, provider-colored markers, and fly-to animation
- 16 bilingual locale keys (EN + VI) for GPS errors, info bar, station compatibility, and charge time
- GPS error handling for all 4 error types with Vietnamese-first UX
- `NearbyStationInfo` and `StationSearchParams` TypeScript interfaces
- TODOS.md with deferred "eVi Show on Map" feature tracked for v2
- 19 new tests (533 total across 41 files): API route (7), Zod schema (5), MapLocateButton (7)

## [0.3.0] — 2026-03-21

### Added
- **Desktop sidebar tab switcher** — users can switch between eVi chat and manual trip planning form via tabs, following the KAYAK AI Mode pattern
- localStorage persistence for desktop tab preference (returning users land on their preferred mode)
- ARIA tablist/tab/tabpanel accessibility roles with keyboard support
- `useDesktopSidebarTab` custom hook with 6 unit tests
- Bilingual tab labels (EN: "Plan Trip", VI: "Lên lộ trình")

### Changed
- Replaced `showManualForm` boolean with discriminated union type `DesktopSidebarTab`
- eVi-to-form handoff now switches desktop tab instead of toggling boolean
- Reorganized plan/spec docs into `docs/` directory structure

## [0.2.0] — 2026-03-21

### Added
- **eVi AI Trip Assistant** — Natural language trip planning via MiniMax M2.7 with voice and text input
- AI follow-up suggestion chips for continuing conversations
- Route narrative briefing with AI-generated summaries
- Nearby stations tab showing distance-sorted station list
- Station detail expander with real-time VinFast data (connectors, pricing, images)
- Station info chips (Tier 1 quick-glance: status, speed, cost, hours)
- Design system (`DESIGN.md`) with typography, color palette, and component rules
- Comprehensive test suite (446+ tests across 32 files)
- User feedback collection system (FAB + form)
- Trip sharing via short URLs with OG share card generation
- Waypoint support in route planning across all map providers
- Battery range calculation with elevation awareness
- Speech recognition for hands-free trip input

### Changed
- Migrated to Mapbox as primary map provider (OSRM as fallback)
- Redesigned mobile UI with bottom sheet layout matching Google Maps/Grab patterns
- Implemented design system colors across all components (replaced hardcoded values)
- Removed all emoji from UI elements (tabs, navigation) per design philosophy
- Improved mobile touch targets to 44px minimum across all interactive elements
- Removed Google Maps provider and dependencies

### Fixed
- Station detail crash on incomplete VinFast data (null safety + cache validation)
- AI chat failing after several turns (token exhaustion and context loss)
- Voice input broken on production (SSR hydration mismatch)
- Mobile bottom sheet content overflow on small phone screens
- Duplicate suggestion chips from recent trips
- Footer link touch targets below accessibility minimum

### Security
- Added HSTS and Content-Security-Policy headers
- Rate limiting on all API endpoints
- Input validation with Zod schemas
- Server-side API key management

## [0.1.0] — 2026-03-17

### Added
- Initial release — EV trip planner for Vietnam
- Route planning between any two points with EV constraints
- VinFast charging station data (150+ stations, 63 provinces)
- Support for 15+ EV models (VinFast, BYD, Tesla, custom)
- Bilingual interface (Vietnamese and English)
- Leaflet + OpenStreetMap map rendering
- Nominatim geocoding for place search
- OSRM routing engine (initial provider)
- OSM charging station data with daily cron refresh
- VinFast station crawling with Cloudflare bypass
- Elevation-aware range calculation
- GitHub Actions CI/CD with Vercel deployment
- Prisma database for station caching
