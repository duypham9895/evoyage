# Phase 4 — Charging Stop Amenities (OpenStreetMap Integration)

**Status**: Awaiting approval (drafted 2026-05-03)
**Owner**: Duy Phạm (PM) · Implementation: Claude Code
**Phase context**: Phase 4 of the Trust Intelligence Roadmap defined in `2026-05-03-trip-overview-timeline-design.md` §14. Independent workstream — does not depend on Phase 3 (popularity engine) data. Can ship anytime.

**Project framing**: Per `feedback_no_mvp_serious_features.md` and `feedback_zero_infra_cost.md` — build properly with free data sources.

## 1. Problem

When a driver charges for ~25 minutes at a V-GREEN station, what do they DO? Today the app:
- Shows the station address
- Shows charging power, status, port count
- Has no signal about food, restrooms, ATM, fuel, etc.

The result: drivers either eat in their car, wander aimlessly looking for a cafe, or skip charging stops they need because "không biết có gì ăn quanh đó". The Phase 1 user complaint about ETA precision generalizes here: **trips with poor stop-context erode trust in EV travel**.

## 2. Goal

By the end of Phase 4, when a driver expands a charging stop card, they see:

- **3-5 nearby places** within walking distance (≤ 7 min round-trip)
- **Categorized** for trip-planning relevance: food (fast/full), cafe, ATM, restroom, fuel
- **Walking time** in minutes, not just distance in meters
- **Tap to navigate** opens the place in Google Maps / Apple Maps
- A clear **"Chưa có dữ liệu"** state when OSM is sparse for that station — honest, not blank

All at $0 ongoing infra cost — Overpass API public endpoint is free for non-commercial use; we cache aggressively to stay polite.

## 3. Components

### 3a. Overpass API client (`src/lib/station/overpass-client.ts`)
- Single function: `queryNearbyPois({ lat, lng, radiusMeters }) → Promise<OsmPoi[]>`
- POSTs an Overpass QL query targeting:
  ```
  node[amenity~"^(restaurant|cafe|fast_food|atm|toilets|fuel|pharmacy)$"](around:500,LAT,LNG);
  ```
- Returns parsed nodes with `{ lat, lng, name, amenity, tags }`
- 30-second timeout, retry once on 429 (rate limited) with exponential backoff
- Error kinds: `network_error`, `rate_limited`, `parse_error`, `timeout`

### 3b. POI categorization (`src/lib/station/categorize-poi.ts`)
Maps raw OSM `amenity` tags to user-facing categories aligned with charge time:

| Category | OSM amenities | When useful |
|---|---|---|
| `quick-bite` | `fast_food`, `cafe` (no `cuisine` tag) | < 25 min charge |
| `sit-down` | `restaurant`, `cafe` (with `cuisine` tag) | ≥ 30 min charge |
| `essentials` | `atm`, `toilets`, `pharmacy` | always |
| `fuel` | `fuel` | for non-EV passengers |

Each POI also gets a **walking-time** field derived from Haversine distance ÷ 80 m/min, rounded up.

### 3c. Postgres cache (`StationPois` model)
```prisma
model StationPois {
  stationId    String   @id
  poisJson     String // serialized OsmPoi[] payload
  fetchedAt    DateTime @default(now())
  expiresAt    DateTime // fetchedAt + 30 days

  station ChargingStation @relation(fields: [stationId], references: [id], onDelete: Cascade)

  @@index([expiresAt])
}
```
30-day TTL — POIs don't change rapidly; we trade slight staleness for ≥95% reduction in Overpass calls.

### 3d. Inline preview UI (`src/components/trip/StationAmenities.tsx`)
Pure presentational component nested inside the existing stop expand pane:

- 3-5 places sorted by walking time ascending
- Each row: category dot · name · walking time · tap-to-navigate (Google Maps URL)
- "Show 3 more" affordance when category list > 5
- Empty state: "Chưa có dữ liệu địa điểm gần trạm này" with a "Tìm trên Google Maps" fallback link
- Loading: skeleton with `--`-padded rows (matches WhatIfCards loading pattern)

### 3e. Cache warmer cron (`.github/workflows/warm-station-pois.yml`)
- Daily 04:00 UTC (post-aggregation, off-peak)
- Picks top 50 stations by recent trip volume from `RouteCache` (or simply top 50 by `lastVerifiedAt` if RouteCache is empty)
- For each, calls Overpass and refreshes `StationPois` row
- Avoids first-time-user latency by pre-populating the cache for popular stations

### 3f. Crowdsource feedback (extends existing feedback infra)
- New `Feedback` category: `STATION_AMENITY_MISSING`
- User taps "Báo cáo địa điểm thiếu" → opens existing feedback form pre-filled with station context
- Internal: we use these reports to add the missing POI to OpenStreetMap directly (give-back to the data source)

## 4. Data flow

```
User expands a stop card
  → StationAmenities mounts with stationId
  → React query hits /api/stations/[id]/amenities
  → API:
      1. Read StationPois row by stationId
      2. If hit + non-expired → return cached POIs
      3. If miss or expired:
         a. Call Overpass with station lat/lng + 500m radius
         b. Parse + categorize + compute walking times
         c. Insert/upsert StationPois row
         d. Return POIs
  → Component renders 3-5 categorized rows
  → User taps row → opens Google Maps URL in new tab
```

## 5. Cost analysis (free-tier viability)

- **Overpass API**: public endpoint at `overpass-api.de` — free, ~10,000 requests/day soft limit per IP
- **Cache hit rate**: With 30-day TTL + cache warmer, projected ~95% hit rate after week 1; only first lookup per station per month hits Overpass
- **Volume estimate**: 36k stations × 1 lookup/30 days = ~1,200 lookups/day after steady state. Well below Overpass limits.
- **Storage**: ~5KB JSON per station × 36k stations = ~180MB at full coverage. Use PARTIAL coverage (top 5k most-trafficked stations) to fit Supabase free tier comfortably.
- **Vercel function compute**: ~50ms/cached lookup + ~2s/Overpass miss. Negligible against 100GB-hours/month budget.
- **GitHub Actions**: cache warmer ~5 min/day × 30 = 150 min/month. Fits comfortably.

**Total ongoing cost: $0/month.**

## 6. Decisions log

| Decision | Choice | Why |
|---|---|---|
| POI data source | **OpenStreetMap via Overpass** | Free, open data; VN urban coverage is good (active OSM-VN community); Google Places paid + ToS-restrictive |
| Walking distance threshold | **7 min round-trip (≈ 280 m one-way)** | A driver charging 20-25 min won't walk further; keeps result list short |
| Walking speed assumption | **80 m/min** | Standard "comfortable walking" pace; conservative for older drivers |
| Cache TTL | **30 days** | POIs (restaurants opening/closing) don't change weekly; 30 days hits ≥95% Overpass reduction |
| Cache scope | **Per-station, lazy-on-first-lookup + warm top 50 daily** | Avoids 36k upfront calls; popular stations stay fast |
| Categories | **4 (quick/sit-down/essentials/fuel)** | Aligned to user decision: "what fits in my charge window?" |
| Empty-state UX | **"Chưa có dữ liệu" + Google Maps fallback link** | Honest about OSM coverage gaps; gives user a way out |
| Crowdsource feedback | **Extend existing `Feedback` model with new category** | Reuses email + spam protection already shipped |
| Self-host Overpass? | **No (use public endpoint)** | 1,200 req/day fits public limits; self-host adds infra ops debt |

## 7. Files to create / modify

**Create**:
- `src/lib/station/overpass-client.ts` + tests
- `src/lib/station/categorize-poi.ts` + tests
- `src/lib/station/walking-distance.ts` + tests (Haversine + walking-time helper)
- `src/app/api/stations/[id]/amenities/route.ts`
- `src/components/trip/StationAmenities.tsx` + tests
- `scripts/warm-station-pois.ts` (consumed by GHA workflow)
- `.github/workflows/warm-station-pois.yml`

**Modify**:
- `prisma/schema.prisma` — add `StationPois` model + relation on `ChargingStation`
- `src/components/trip/TripSummary.tsx` — render `<StationAmenities stationId={...} />` inside the existing stop expand pane
- `src/locales/vi.json` + `src/locales/en.json` — category labels, walking-time format, empty state, feedback CTA
- `src/lib/feedback/constants.ts` — add `STATION_AMENITY_MISSING` to `FeedbackCategory`

## 8. Edge cases

| Case | Handling |
|---|---|
| Overpass returns empty array | Cache the empty result; render "Chưa có dữ liệu" + Google Maps link |
| Overpass returns 429 (rate limited) | Retry once with 5s backoff; on second 429 → return stale cache or empty |
| Station coordinates invalid (lat=0/lng=0) | Skip lookup, render empty state immediately |
| POI has no `name` tag | Render `name:vi` if present, else amenity localized ("Quán ăn nhanh", "Cafe") |
| Walking time > 7 min | Drop from result list; not surfaced |
| Database write fails after Overpass success | Return live results to user; log warning; next request retries upsert |
| User reports missing place | Increment a counter; if same station gets ≥ 3 reports/month, flag for manual OSM contribution |

## 9. Testing strategy

**Unit tests (must pass before commit)**:
- `overpass-client.test.ts` — mock fetch, verify QL query construction, error-kind discrimination, retry-once behavior
- `categorize-poi.test.ts` — fixture POIs with various amenity tags map to expected categories
- `walking-distance.test.ts` — Haversine accuracy at known coordinates; walking-time rounding
- `StationAmenities.test.tsx` — render with 0/1/3/8 POIs, loading skeleton, empty-state, tap-to-navigate URL construction

**Integration tests**:
- End-to-end: hit `/api/stations/[id]/amenities` for a known HCM station, verify Overpass call → cache write → response
- Cache hit path: second call within 30 days hits cache, no Overpass

**Manual QA**:
- [ ] HCM-1 station (Quận 1) returns ≥ 3 POIs across categories
- [ ] Rural station (Bù Gia Mập, etc.) returns empty state with Google Maps fallback
- [ ] Tap on a row opens correct Google Maps URL on iOS Safari + Android Chrome
- [ ] Locale switch (vi ↔ en) updates category labels without re-fetch
- [ ] Cache warmer workflow runs cleanly on `workflow_dispatch`

## 10. Out of scope (this phase)

Items below are NOT in this phase. Candidates for Phase 5+ if user demand surfaces.

- Photos / ratings (would require Google Places — paid)
- Hours-aware filtering ("only show places open during my charge")
- Filtering by cuisine type (Vietnamese / Western / vegan / etc.)
- Indoor amenities (mall directories, cafe-inside-mall mapping)
- Booking integration (table reservations from the app)
- Cross-language POI names (translating Vietnamese OSM names to English)
- Sponsored / partner placements

## 11. Implementation sequencing (~1.5 weeks)

1. **Day 1** — Prisma schema + walking-distance util + tests
2. **Day 2** — Overpass client + tests
3. **Day 3** — Categorization + integrated `/api/stations/[id]/amenities` route
4. **Day 4** — `StationAmenities` UI component + tests
5. **Day 5** — Wire into `TripSummary` stop expand pane + locale keys + manual QA
6. **Day 6** — Cache warmer script + GHA workflow
7. **Day 7** — Crowdsource feedback category + reporting flow
8. **Day 8** — End-to-end QA, edge cases, performance check, ship

Each day = 1+ atomic commit, green tests before moving on.

## 12. Roadmap implications post-Phase-4

After Phase 4 ships, the Trust Intelligence Roadmap §14 reaches feature-complete v1. Future phases would shift from "trust intelligence" to other directions:

- **Phase 5**: Persistent trip notebook (saved trips, history, share-back)
- **Phase 6**: Multi-driver coordination (group trips, convoy charging)
- **Phase 7**: VinFast partnership-driven features (reservation API, owner perks)

Phase 4 itself unlocks no Phase 5 dependencies — they're independent. Sequencing is purely a product-priority call when we get there.
