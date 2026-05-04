# Amenities — Tiered Radius for Highway-Side Stops

**Status**: Awaiting approval (drafted 2026-05-04)
**Owner**: Duy Phạm (PM) · Implementation: Claude Code
**Phase context**: Tuning patch on top of Phase 4 (`2026-05-03-phase-4-charging-stop-amenities-design.md`). Not a new phase. Independent of all other roadmap items; can ship anytime.

**Project framing**: Per `feedback_no_mvp_serious_features.md` and `feedback_zero_infra_cost.md` — refine the existing feature properly, don't bolt on a hack. Cost still $0/month.

## 1. Problem

Phase 4 shipped with a fixed search of **500 m radius** + **7-min round-trip walk** (`src/app/api/stations/[id]/amenities/route.ts:26-27`). For dense urban stops (HCMC malls, downtown hotels, Thủ Thiêm) this is exactly right.

For **highway-side rural stops — the dominant use case for an EV road trip planner — it returns zero**. Verified today (2026-05-04) on the Quận 1 → Đà Lạt trip with VinFast VF 6 Plus:

- Mid-route stop: `Bãi đỗ xe tư nhân Ma Đa Guôi` (station `cmolmt2522x8ea2j7`, 11.388681, 107.542488).
- API call `GET /api/stations/cmolmt2522x8ea2j7/amenities` → `200 { fromCache: true, poiCount: 0 }`.
- DOM rendered the empty-state ("Chưa có dữ liệu địa điểm gần trạm này" + Google Maps fallback link).

A direct Overpass probe at the same coordinates with **1500 m radius** returned **5 real POIs** along QL20:

| OSM type | Name | Approx walk (one-way) |
|---|---|---|
| restaurant | Thung lũng xanh | ~ 800 m |
| restaurant | Ba phương 20k | ~ 600 m |
| restaurant | ba phương 20k *(OSM duplicate of the above)* | ~ 600 m |
| supermarket | Bach hoa XANH | ~ 900 m |
| fuel | Saigon Petro | ~ 1100 m |

These are real options the driver would happily walk to (or drive 90 seconds to) during a 16-min charge. The 500 m / 7-min filter excludes all of them. Highway QL stops in VN are systematically structured this way: charging stop sits at a parking lot entrance, food/fuel/convenience are spread along the highway 500 m–1.5 km out.

**The current empty state is honest but wrong** — it tells the user "no data" when the data exists, just outside the walking band.

## 2. Goal

By the end of this patch, when a driver expands a charging stop card on a highway trip:

- They see the **same close-walk results** as today when the station is in a walkable area.
- When the close-walk search comes up **empty**, they see a **wider "short drive away" section** (up to 1500 m) with **driving-time labels**, not walking-time labels — the visual distinction makes it clear these are not "across the parking lot."
- Tuning changes (radius, walk-time threshold) **invalidate cache automatically** via a schema-version bump, so existing cached zero-POI rows don't suppress the fix for 30 days.
- OSM-duplicate POIs (same name within 30 m) are deduped before persisting.

Still $0/month — Overpass is free, results still cached for 30 days.

## 3. Approach

### 3a. Tiered query in `route.ts`

Replace the single Overpass call with a **two-stage** search:

```ts
const WALK_RADIUS_M = 500;
const WALK_MAX_MIN = 7;       // round-trip
const DRIVE_RADIUS_M = 1500;
const POIS_SCHEMA_VERSION = 2; // bump on tuning change → invalidates cache
```

1. Stage 1 (always): query Overpass at `WALK_RADIUS_M`. Categorize, filter by `walkingMinutes * 2 ≤ WALK_MAX_MIN`, sort, mark each row `tier: 'walk'`.
2. Stage 2 (only if Stage 1 returns 0 rows): query Overpass at `DRIVE_RADIUS_M`. Categorize, mark each row `tier: 'drive'`, compute `drivingMinutes` (Haversine ÷ 600 m/min ≈ 36 km/h conservative urban-highway pace, rounded up; minimum 1).
3. Dedupe: drop POIs whose `(category, normalized name)` collide within 30 m of each other (handles the "Ba phương 20k" / "ba phương 20k" case).
4. Persist combined list with `schemaVersion: POIS_SCHEMA_VERSION` baked into the cached JSON envelope.

If Stage 1 returns ≥ 1 row, we **skip Stage 2** — urban stops never trigger the wider search, no extra Overpass cost.

### 3b. Cache schema version

Wrap the cached payload:

```ts
interface CachedAmenities {
  schemaVersion: number;
  rows: AmenityRow[];
}
```

On read: if `cached.schemaVersion !== POIS_SCHEMA_VERSION`, treat as cache miss. No DB migration needed — `poisJson` is already a `String`, and existing rows (which are bare arrays without the version field) parse to `schemaVersion: undefined` and re-fetch naturally.

### 3c. UI changes in `StationAmenities.tsx`

The `AmenityRow` shape gains a `tier` discriminator and an optional `drivingMinutes`:

```ts
interface AmenityRow {
  // ...existing fields
  tier: 'walk' | 'drive';
  walkingMinutes: number;       // still computed for both tiers (informational)
  drivingMinutes?: number;      // only present when tier === 'drive'
}
```

Render two sections (only the section(s) with rows):

- **"Trong tầm đi bộ"** — walk-tier rows, labeled "X phút đi bộ" (today's behavior, unchanged for urban stops).
- **"Ngay gần đó"** — drive-tier rows, labeled "X phút lái" (~Y m).

The empty-state ("Chưa có dữ liệu...") only fires when **both** tiers are empty.

### 3d. Dedupe helper (`src/lib/station/dedupe-pois.ts`)

Pure function, no I/O. Takes `OsmPoi[]`, returns deduped `OsmPoi[]` by:

- Normalize name: lowercase, trim, collapse internal whitespace, strip diacritics.
- Group by `(category, normalizedName)`.
- Within each group, keep one row per ~30 m cell (Haversine; reuses existing helper).

## 4. Files to modify

**Modify**:
- `src/app/api/stations/[id]/amenities/route.ts` — tiered search, schema version, dedupe call.
- `src/components/trip/StationAmenities.tsx` — two-section render, drive-tier label.
- `src/lib/station/walking-distance.ts` — add `drivingTimeMinutes(meters)` helper next to existing `walkingTimeMinutes`.
- `src/locales/vi.json` + `src/locales/en.json` — keys: `amenities_section_walk`, `amenities_section_drive`, `amenities_driving_minutes`.

**Create**:
- `src/lib/station/dedupe-pois.ts` + `src/lib/station/dedupe-pois.test.ts`.
- `src/lib/station/walking-distance.test.ts` updates for `drivingTimeMinutes` (file already exists).
- `src/app/api/stations/[id]/amenities/route.test.ts` — integration test for tiered behavior + schema version.
- `src/components/trip/StationAmenities.test.tsx` — extend for two-section render with mixed tiers.

**Untouched**:
- `prisma/schema.prisma` — `StationPois` row layout unchanged; only the JSON inside changes.
- `src/lib/station/overpass-client.ts` — already accepts `radiusMeters` as a parameter; no changes.
- `src/lib/station/categorize-poi.ts` — unchanged.
- `.github/workflows/warm-station-pois.yml` — runs the same code; will repopulate cache with v2 payload on next daily run.

## 5. Decisions log

| Decision | Choice | Why |
|---|---|---|
| Two-stage vs single wider query | **Two-stage, Stage 2 only on Stage 1 = 0** | Keeps Overpass calls minimal; preserves today's tight-walking behavior for urban stops |
| Drive-tier radius | **1500 m** | Matches today's probe finding (5 real POIs in this band on QL20); within ~3 min slow-driving — fits a charge break |
| Driving-pace assumption | **600 m/min ≈ 36 km/h** | Conservative for QL/urban roads with traffic lights; never under-promises |
| Cache invalidation | **`schemaVersion` field, treat mismatch as miss** | Zero-migration; degrades gracefully on rollback (old code reads new payload as a regular array) |
| Dedupe key | **(category, normalized name) within 30 m** | OSM duplicates are usually identical-name + nearly-identical-coords; 30 m allows for slight tagger drift |
| Drive-tier label | **"X phút lái"** (Vietnamese) / "X min drive" (English) | Visually distinct from "X phút đi bộ"; matches user mental model |
| Surface drive-tier even when walk has 1 result | **No — only show drive section when walk is empty** | Avoids cluttering urban stops; close walk wins |
| Maximum drive-tier rows shown | **5** | Same cap as walk-tier; enough for "what to eat" without overwhelming |

## 6. Edge cases

| Case | Handling |
|---|---|
| Stage 1 returns 1 row, Stage 2 would return 10 | Skip Stage 2; show the single walk row. User intent: "I'm closing my car door, where's nearby?" — anything within walk wins |
| Both stages return 0 | Render today's empty state + Google Maps fallback link |
| Stage 1 cached as v1 array (no `schemaVersion`) | Treat as cache miss, refetch (Stage 1 + Stage 2 if needed), persist as v2 envelope |
| Overpass 429 on Stage 2 | Stage 1 result is already valid; persist Stage 1 alone; do not retry Stage 2 in same request |
| Dedupe collapses two rows of different categories with same name | Don't dedupe across categories — "ATM Vietcombank" and "Bank Vietcombank" must both surface |
| Drive-tier row's coordinate is < 100 m from station | Already excluded by Stage 1's filter pass; if Overpass returned it in Stage 2 (boundary case), treat as walk-tier instead |

## 7. Testing strategy

**Unit (must pass before commit)**:
- `dedupe-pois.test.ts` — collapses "Ba phương 20k" / "ba phương 20k" within 30 m; preserves separate categories with same name; preserves distinct chains 200 m apart.
- `walking-distance.test.ts` — `drivingTimeMinutes` rounding + zero-distance handling.
- `StationAmenities.test.tsx` — renders walk-only, drive-only, both, neither (empty state); driving label format; tier-discriminated dot color.

**Integration**:
- `amenities/route.test.ts` — mock `queryNearbyPois` per radius; verify Stage 2 fires only when Stage 1 empty; verify `schemaVersion` round-trips; verify cached v1 payload triggers refetch.

**Manual QA on 3 station archetypes**:
- [ ] **Urban dense** (HCM Q1 station): Stage 2 does NOT fire; output identical to today.
- [ ] **Highway QL** (Ma Đa Guôi or any QL20 / QL1A stop): Stage 2 fires; ≥ 3 drive-tier rows surfaced; labels say "phút lái".
- [ ] **Truly remote** (Bù Gia Mập or similar): Both stages empty; honest empty state with Google Maps fallback.
- [ ] After deploy, confirm one previously-cached-empty highway station gets refreshed with drive-tier rows on next view (schema version invalidation works in production).

## 8. Out of scope (this patch)

Deferred — file separately if user demand emerges:

- A "show all places" expansion that goes to 3000+ m or unlimited radius.
- Live "is it open right now?" hours filter (Overpass `opening_hours` is sparse and unreliable in VN).
- Distinguishing "drive there, park, walk in" vs "drive-through" — currently all drive-tier rows are bucketed together.
- Crowdsourced "incorrect distance" feedback specifically on amenities (the existing `STATION_AMENITY_MISSING` feedback path covers the broader case).
- Self-hosting Overpass — still well below public-endpoint limits even with the second call.

## 9. Implementation sequencing (~half a session)

1. Add `drivingTimeMinutes` helper + tests.
2. Add `dedupe-pois` module + tests.
3. Refactor `route.ts` for tiered search + schema-version envelope; integration tests.
4. Extend `StationAmenities.tsx` for two-section render; component tests; locale keys.
5. Manual QA on the 3 archetypes above; deploy; verify cache invalidation in prod.

Each step = one atomic commit, green tests before next.

## 10. Cost re-check

- Stage 2 only fires on Stage 1 = 0. Today's empty rate from `StationPois` (run a one-line SQL count) sets the new marginal Overpass volume. Even if 50% of stations trigger Stage 2, that's still ~600 extra calls/day at steady state — well under the 10k/day soft limit.
- Schema-version bump invalidates the existing 36k cached rows over 30 days as users view them. The daily warmer (`warm-station-pois.yml`) re-fills the top 50 immediately.
- Zero new infra. Zero recurring spend.
