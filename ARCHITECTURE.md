# Architecture — eVoyage

## Overview

eVoyage is a Next.js App Router application for planning EV road trips across Vietnam. It combines real-time charging station data from VinFast's network with AI-powered trip planning via MiniMax M2.7.

```
┌─────────────────────────────────────────────────┐
│                   Client (Browser)               │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Map View │  │ Trip Form│  │ eVi AI Chat   │  │
│  │ (Mapbox) │  │          │  │ (voice/text)  │  │
│  └────┬─────┘  └────┬─────┘  └──────┬────────┘  │
│       │              │               │            │
│  ┌────┴──────────────┴───────────────┴────────┐  │
│  │         MobileBottomSheet / Sidebar         │  │
│  └─────────────────────┬──────────────────────┘  │
└────────────────────────┼─────────────────────────┘
                         │
┌────────────────────────┼─────────────────────────┐
│              Next.js API Routes                   │
│                                                   │
│  /api/route                       → Route planning + stations  │
│  /api/route/narrative             → AI route briefing          │
│  /api/evi/parse                   → Natural language → trip    │
│  /api/evi/suggestions             → AI follow-up chips         │
│  /api/transcribe                  → Voice → text (Groq Whisper)│
│  /api/stations                    → Station list + search      │
│  /api/stations/nearby             → Distance-sorted nearby list│
│  /api/stations/[id]/vinfast-detail→ Real-time SSE detail       │
│  /api/stations/[id]/amenities     → OSM POIs around station    │
│  /api/stations/[id]/status-report → Crowdsourced status report │
│  /api/vehicles                    → EV model database          │
│  /api/feedback                    → User feedback collection   │
│  /api/short-url                   → Trip sharing via short URLs│
│  /api/share-card                  → OG image generation        │
│  /api/cron/poll-station-status    → Hourly status observations │
│  /api/cron/aggregate-popularity   → Nightly heatmap rebuild    │
│  /api/cron/aggregate-reliability  → Nightly reliability rebuild│
└────────────────────────┬─────────────────────────┘
                         │
┌────────────────────────┼─────────────────────────┐
│              External Services                    │
│                                                   │
│  VinFast API ─── Station data (SSE streaming)     │
│  MiniMax M2.7 ── AI chat (OpenAI-compatible)      │
│  Mapbox ──────── Map tiles + Directions API       │
│  OSRM ────────── Routing fallback                 │
│  Nominatim ───── Geocoding / place search         │
│  Prisma/DB ───── Trip storage, station cache      │
└───────────────────────────────────────────────────┘
```

## Directory Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx            # Landing page
│   ├── plan/page.tsx       # Trip planner (main app)
│   ├── s/[code]/page.tsx   # Short URL redirect
│   ├── globals.css         # Theme variables, utilities
│   └── api/                # API routes (see below)
│
├── components/
│   ├── EVi.tsx             # AI trip assistant (chat UI)
│   ├── NearbyStations.tsx  # Station list with distance
│   ├── landing/            # Landing page sections
│   ├── layout/             # Header, MobileBottomSheet, MobileTabBar
│   ├── map/                # Map, MapboxMap, ElevationChart
│   ├── trip/               # TripInput, TripSummary, StationDetail*,
│   │                       #   PlaceAutocomplete, BatteryStatusPanel,
│   │                       #   ShareButton, WaypointInput
│   └── feedback/           # FeedbackFAB, FeedbackModal, StarRating
│
├── lib/
│   ├── evi/                # AI assistant logic
│   │   ├── llm-module.ts        # Deepened LLM call module (ADR-0002)
│   │   ├── llm-providers.ts     # OpenAI (primary) + MiniMax (fallback) chain
│   │   ├── prompt.ts            # System prompt construction
│   │   ├── vehicle-resolver.ts  # NL → vehicle model
│   │   ├── suggestions-client.ts # Follow-up generation
│   │   ├── minimax-client.ts    # OpenAI-compatible client for both providers
│   │   └── types.ts             # Trip parsing types + Zod schemas
│   │
│   ├── routing/            # Route planning engine
│   │   ├── route-planner.ts     # Orchestrator
│   │   ├── station-finder.ts    # Find stations along route
│   │   ├── station-ranker.ts    # Rank by speed/detour/cost
│   │   ├── range-calculator.ts  # Battery range with elevation
│   │   ├── mapbox-directions.ts # Mapbox Directions client
│   │   ├── matrix-api.ts       # Distance matrix for ranking
│   │   ├── route-cache.ts      # Route result caching
│   │   ├── trip-cache.ts       # Trip data caching
│   │   └── osrm.ts             # OSRM routing fallback
│   │
│   ├── vinfast/            # VinFast data layer
│   │   ├── vinfast-client.ts         # API client
│   │   ├── vinfast-browser.ts        # CF-bypass browser client
│   │   └── vinfast-entity-resolver.ts # Entity ID resolution
│   │
│   ├── geo/                # Geospatial utilities
│   │   ├── nominatim.ts         # Geocoding client
│   │   ├── coordinate-validation.ts
│   │   ├── elevation.ts         # Elevation data
│   │   ├── polyline.ts          # Polyline encode/decode
│   │   └── static-map.ts       # Static map image URLs
│   │
│   ├── locale.tsx          # i18n with JSON locale files
│   ├── map-mode.tsx        # Map provider toggle (OSM/Mapbox)
│   ├── haptics.ts          # Mobile haptic feedback
│   ├── prisma.ts           # Database client singleton
│   ├── rate-limit.ts       # API rate limiting
│   └── safe-json.ts        # Safe JSON parsing
│
├── locales/
│   ├── en.json             # English translations
│   └── vi.json             # Vietnamese translations
│
└── types/                  # Shared TypeScript types
```

## Key Data Flows

### 1. Trip Planning (Form)

```
User fills TripInput → /api/route
  → geocode origin/destination (Nominatim)
  → calculate route (Mapbox Directions or OSRM)
  → find charging stations along route (station-finder)
  → rank stations by speed/detour/cost (station-ranker)
  → calculate battery range with elevation (range-calculator)
  → return route + charging stops + summary
```

### 2. AI Trip Planning (eVi)

```
User speaks/types trip description → /api/evi/parse
  → MiniMax M2.7 extracts structured trip data (Zod schema)
  → vehicle-resolver maps natural language to EV model
  → returns parsed trip parameters → triggers route planning
  → /api/evi/suggestions generates follow-up chips
```

### 3. Station Detail (SSE)

```
User taps station → /api/stations/[id]/vinfast-detail
  → check cache (Prisma DB)
  → if stale: SSE stream from VinFast finaldivision API
  → parse real-time connector status, pricing, images
  → cache result → return to client
```

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Map provider | Mapbox (primary), OSRM (fallback) | Mapbox has superior Vietnamese coverage; OSRM as free fallback |
| AI model | OpenAI gpt-5 (primary) + MiniMax M2.7 (fallback) via OpenAI-compatible API | Strong JSON-mode reliability, good Vietnamese understanding, provider redundancy per ADR-0002 |
| Station data | VinFast API + SSE primary; OSM, EVPower, manual CSV, and crowdsourced promotion as secondary | Multi-source coverage per ADR-0001; SSE used only for real-time VinFast detail (ADR-0003) |
| Mobile layout | Bottom sheet over full-screen map | Matches driver mental model (Google Maps, Grab) |
| i18n | JSON key-based with runtime locale | Simple, type-safe, auto-tested for key sync |
| Styling | Tailwind CSS with DESIGN.md tokens | Consistent design system, no CSS drift |
| Caching | Prisma DB + in-memory | Station data changes slowly; cache aggressively |

## Security Layers

- HSTS + Content-Security-Policy headers
- Rate limiting on all API endpoints
- Input validation with Zod schemas at API boundaries
- Server-side API key management (no client exposure)
- VinFast API accessed server-side only (CF bypass)
