# Changelog

All notable changes to eVoyage are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/). Versioning follows [Semantic Versioning](https://semver.org/).

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
