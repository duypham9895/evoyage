# Trip Overview — Route Timeline Redesign

**Status**: Approved (v3) 2026-05-03 — Phase 1 of the Trust Intelligence roadmap
**Owner**: Duy Phạm (PM) · Implementation: Claude Code
**Trigger**: User feedback that the current overview card "just put the beginning and end points from the trip, don't have any meaning"

**Project framing (per `feedback_no_mvp_serious_features.md` + `feedback_zero_infra_cost.md`)**:
This spec is **not an MVP**. It is Phase 1 of a deliberate Trust Intelligence build-out for eVoyage. Each phase ships as a complete, well-engineered feature using free data sources and free-tier infrastructure (`$0` ongoing cost). The four phases form a coherent product story: drivers must be able to TRUST the trip plan, and trust requires real intelligence (terrain, traffic, station behavior, surroundings).

**Changelog**:
- **v3 (2026-05-03)**: Reframed §13 from "deferred unless complaints" (MVP language) to a structured roadmap. Added §14 Trust Intelligence Roadmap context. Removed any "ship cheap, iterate later" framing.
- **v2 (2026-05-03)**: ETA reframed as secondary with "nếu đi ngay" caveat (was: ETA hero); arrival battery promoted to hero (trust signal). Added terrain-warning row driven by static known-pass detection (no API). Locale keys restructured accordingly.
- **v1 (2026-05-03)**: Initial route-timeline redesign approved.

## 1. Problem

Current `src/components/trip/TripSummary.tsx` (lines 506–587) renders a "Tổng quan chuyến đi" card that:
- Echoes the user's start/end addresses verbatim — pure noise since the user just typed them
- Shows abstract totals (distance, total time, drive time, charging time) in a 2×2 grid
- Buries the **arrival battery percentage** at the bottom of a small bar — the most important trust signal is the least scannable
- Provides no sense of the **shape** of the trip (where you stop, in what order)
- Provides no **ETA** — users must mentally add "4h14m" to current time

A summary card should answer decision questions, not dump data. Today it does the opposite.

## 2. Goal

Redesign the overview card so a driver answers in <3 seconds:

1. **Where am I going and where will I stop?** (sequence of milestones)
2. **When will I arrive and with what battery?** (ETA + arrival %)
3. **How big is this trip?** (totals)

## 3. Solution

### Visual layout (mobile portrait, ~390 px)

```
┌──────────────────────────────────────────┐
│ TP.HCM → Đà Lạt                          │  ← city headline
│ Còn pin 79% khi tới                      │  ← arrival battery hero (trust)
│ ~4h14m · đến lúc 18:42 nếu đi ngay       │  ← duration primary, ETA caveated
│                                          │
│ ●─────●─────●─────●                      │  ← Route timeline
│ HCM   ① HN  ② LADO  ĐLạt                 │
│ 55%   24→80% 27→80% 79%                  │
│ ↦106km↦176km ↦  4km                      │
│       21m   21m                          │
│                                          │
│ Đường có Đèo Bảo Lộc — pin tốn nhanh ~15%│  ← terrain warning (if any)
│                                          │
│ 292.8km · 2 trạm sạc                     │  ← compact totals
│ Lái 3h32m · Sạc 42m                       │  ← breakdown
└──────────────────────────────────────────┘
```

### Component breakdown

**A. Headline** (rendered inline in `TripSummary.tsx`) — order is deliberate, top-to-bottom
- Line 1: `{startCity} → {endCity}` — large, heading font
- Line 2 (HERO — trust signal): `Còn pin {percent}% khi tới` — accent color, larger weight
- Line 3 (secondary, with caveat): `~{totalTime} · đến lúc {eta} nếu đi ngay` — muted color

**Why this order**: arrival battery is the trust signal that addresses range anxiety. ETA is useful but VN traffic / weather can shift it 30–60 min — leading with ETA risks user blame ("the app promised 18:42!"). Duration is fuzzier and harder to misinterpret. The "nếu đi ngay" qualifier explicitly scopes the ETA to "if leaving now".

**B. RouteTimeline** (new component, own file)
- Horizontal milestone strip
- Nodes (left to right): start city → each charging stop → end city
- Per node: name, battery state, distance from previous, charge time at stop
- Color of dot = battery state at node (accent for endpoints, warn/safe for stops)
- 4+ stops → `overflow-x-auto` with scroll-snap

**C. Terrain warnings** (rendered inline in `TripSummary.tsx`, conditional)
- Show ONLY if `detectPasses(tripPlan.polyline)` returns one or more known passes
- One row per detected pass: `Đường có {passName} — pin tốn nhanh ~{drainPercent}%`
- Styled with `text-[var(--color-warn)]` and `bg-[var(--color-warn)]/10`, no icons (per project rule)
- Sits between the timeline strip and the totals row

**D. Compact totals** (rendered inline in `TripSummary.tsx`)
- Line 1: `{distance}km · {stopCount} trạm sạc`
- Line 2: `Lái {driveTime} · Sạc {chargeTime}`
- (Total time removed from this row — already promoted to the headline)

### Removals

- Address echo line (`TripSummary.tsx:508-510`) — root cause of the user complaint
- Battery journey bar block (`TripSummary.tsx:540-572`) — subsumed by the timeline
- 2×2 stats grid (`TripSummary.tsx:512-538`) — replaced by compact totals row
- "battery_journey" locale key — orphaned after removal

## 4. Data flow

All required data already exists in `TripPlan` (no API changes):

| UI element | Data source |
|---|---|
| `startCity` | `extractCityName(tripPlan.startAddress)` |
| `endCity` | `extractCityName(tripPlan.endAddress)` |
| Arrival battery (HERO) | `tripPlan.arrivalBatteryPercent` |
| Total time (secondary) | `totalDurationMin + totalChargingTimeMin` |
| ETA caveated | `new Date(Date.now() + totalTimeMin * 60_000)` |
| Start battery | `tripPlan.batterySegments[0].startBatteryPercent` |
| Timeline stops | `tripPlan.chargingStops` (handle `ChargingStop` and `ChargingStopWithAlternatives` shapes) |
| Inter-stop distance | derived from `distanceFromStartKm` deltas |
| Terrain warnings | `detectPasses(tripPlan.polyline)` (new utility, see §6.5) |
| Totals | `tripPlan.totalDistanceKm`, `totalDurationMin`, `totalChargingTimeMin`, `chargingStops.length` |

ETA format (Vietnamese 24-hour):
```ts
new Intl.DateTimeFormat('vi-VN', { hour: 'numeric', minute: '2-digit', hour12: false }).format(eta)
// → "18:42"
```

## 5. New utility: `extractCityName(address: string): string`

**File**: `src/lib/trip/extract-city.ts`

**Input**: Full geocoded address, e.g. `"Hẻm 1041/62 Đường Trần Xuân Soạn, Khu phố 73, Phường Tân Hưng, Thành phố Hồ Chí Minh, 72911, Việt Nam"`

**Output**: Display-friendly city/province name, e.g. `"TP.HCM"`

**Algorithm**:
1. Split by `,`, trim each part, drop empty parts
2. Drop the trailing `"Việt Nam"` segment if present
3. Drop pure-digit segments (postal codes)
4. Walk parts from end to start; pick the first part that matches a known pattern:
   - `/^Thành phố Hồ Chí Minh$/i` → `"TP.HCM"`
   - `/^Thành phố Hà Nội$|^Thủ đô Hà Nội$/i` → `"Hà Nội"`
   - `/^Thành phố (.+)$/i` → capture group
   - `/^Tỉnh (.+)$/i` → capture group
5. If no pattern match: take the second-to-last meaningful part
6. If still empty: return the whole address truncated to 12 chars
7. Hard-cap result at 12 chars (truncate with `…` if longer)

**Required test cases** (`extract-city.test.ts`):
- `"… Thành phố Hồ Chí Minh, 72911, Việt Nam"` → `"TP.HCM"`
- `"… Thành phố Đà Lạt, Tỉnh Lâm Đồng, Việt Nam"` → `"Đà Lạt"`
- `"… Tỉnh Lâm Đồng, Việt Nam"` → `"Lâm Đồng"`
- `"… Thủ đô Hà Nội, Việt Nam"` → `"Hà Nội"`
- `"Đà Lạt"` (already short) → `"Đà Lạt"`
- `""` → `"—"` (em dash placeholder)
- 30-char single-segment input → truncated with `…`

## 6. New utility: `extractStationShortName(fullName: string): string`

**File**: `src/lib/trip/extract-station-name.ts`

**Why**: Station names like `"Nhượng quyền Vinfast Cơm Niêu Hồng Nhung"` are too long for an 80-px column.

**Algorithm**:
1. Strip known prefixes (case-insensitive): `"Nhượng quyền VinFast"`, `"Nhượng quyền Vinfast"`, `"VinFast"`, `"V-GREEN"`, `"NQ"`, `"Trạm sạc"`
2. Trim, collapse whitespace
3. Take the last 2 words. If the result is shorter than 8 chars, take the last 3 words instead.
4. Hard-cap at 14 chars (truncate with `…` if longer)

**Required test cases** (`extract-station-name.test.ts`):
- `"Nhượng quyền Vinfast Cơm Niêu Hồng Nhung"` → `"Hồng Nhung"`
- `"NQ LADO Thị trấn Liên Nghĩa"` → `"Liên Nghĩa"`
- `"V-GREEN Quận 1"` → `"Quận 1"`
- `""` → `"Trạm"` (fallback used by caller as `"Trạm ${i}"`)
- 20-char single word → truncated to 14 chars + `…`

## 6.5 New utility: `detectPasses(polyline: string)`

**Files**:
- `src/lib/trip/known-passes.ts` — static dataset of Vietnamese mountain passes
- `src/lib/trip/detect-passes.ts` — polyline intersection logic
- `src/lib/trip/detect-passes.test.ts` — tests for both

**Why**: Vietnamese EV drivers care deeply about terrain. Đèo Bảo Lộc, Hải Vân, Khánh Lê, etc. burn battery noticeably faster than flat roads. Today the app silently routes through them and reports a battery estimate that doesn't account for the climb. Surfacing this restores trust by acknowledging real-world drain factors **without** requiring a new elevation API — the major Vietnamese passes are well-known and finite.

**Static dataset shape** (`known-passes.ts`):
```ts
export interface VietnamPass {
  readonly id: string;
  readonly nameVi: string;
  readonly nameEn: string;
  /** Tight bounding box around the pass road segment */
  readonly bbox: readonly [latMin: number, latMax: number, lngMin: number, lngMax: number];
  /** Estimated *additional* battery drain vs flat-road baseline */
  readonly drainPercent: number;
}

export const KNOWN_VIETNAM_PASSES: readonly VietnamPass[] = [
  { id: 'bao-loc',  nameVi: 'Đèo Bảo Lộc',  nameEn: 'Bao Loc Pass',  bbox: [11.40, 11.55, 107.75, 107.85], drainPercent: 15 },
  { id: 'khanh-le', nameVi: 'Đèo Khánh Lê', nameEn: 'Khanh Le Pass', bbox: [12.20, 12.35, 108.65, 108.85], drainPercent: 18 },
  { id: 'hai-van',  nameVi: 'Đèo Hải Vân',  nameEn: 'Hai Van Pass',  bbox: [16.18, 16.25, 108.10, 108.20], drainPercent: 12 },
  { id: 'cu-mong',  nameVi: 'Đèo Cù Mông',  nameEn: 'Cu Mong Pass',  bbox: [13.78, 13.85, 109.10, 109.20], drainPercent: 8 },
  { id: 'pha-din',  nameVi: 'Đèo Pha Đin',  nameEn: 'Pha Din Pass',  bbox: [21.55, 21.65, 103.30, 103.45], drainPercent: 14 },
];
```

Bbox values are first-pass estimates; final spec may need a 2nd-pass calibration with real Mapbox coordinates. Mark in implementation notes that values can be tuned after launch based on user reports.

**Algorithm** (`detect-passes.ts`):
```ts
detectPasses(polyline: string): readonly VietnamPass[]
```
1. Decode polyline → array of `{lat, lng}` points (use existing decoder if available, else add `@mapbox/polyline`)
2. For each point, sample every Nth (N = 5–10 to keep cost low; passes span ≥ 5 km)
3. For each known pass, return it if any sampled point falls inside its bbox
4. Return `[]` if no passes detected
5. Cap result at 3 passes (UI doesn't render more)

**Required test cases**:
- HCM → Đà Lạt polyline → returns `[{ id: 'bao-loc', ... }]`
- HCM → Hà Nội along QL1 → returns at least Hải Vân
- Nha Trang → Đà Lạt → returns Khánh Lê
- HCM → Vũng Tàu (no passes) → returns `[]`
- Empty polyline → returns `[]`
- Polyline that touches bbox corner but doesn't traverse the pass → still returns the pass (acceptable false-positive for v1, log for tuning)

## 7. New component: `RouteTimeline`

**File**: `src/components/trip/RouteTimeline.tsx`

**Props**:
```ts
interface RouteTimelineProps {
  readonly startCity: string;
  readonly startBatteryPercent: number;
  readonly endCity: string;
  readonly arrivalBatteryPercent: number;
  readonly totalDistanceKm: number;
  readonly stops: ReadonlyArray<{
    readonly shortName: string;          // already truncated by parent
    readonly distanceFromPrevKm: number; // computed by parent
    readonly arrivalPercent: number;
    readonly departurePercent: number;
    readonly chargeTimeMin: number;
  }>;
}
```

**Rendering rules**:
- Single horizontal flex row, items align top
- Each milestone is a column, `min-width: 80px`
- Connecting line between dots: thin `border-t` styled with muted color
- When total nodes ≥ 5 (i.e. 3+ charging stops): wrap in `<div class="overflow-x-auto snap-x snap-mandatory">` so columns can be swiped on mobile
- Swipe hint `"← Vuốt để xem thêm điểm dừng"` always shown below the strip whenever the scroll wrapper is rendered (no per-user dismissal state in v1)

**Color logic** (per project DESIGN.md, no decorative icons):
- Endpoint dots: `bg-[var(--color-accent)]`
- Stop dots: `bg-[var(--color-warn)]` if `arrivalPercent < 30`, else `bg-[var(--color-safe)]`
- Battery percent text under each dot: same color as dot
- Distance / charge-time labels: `text-[var(--color-muted)]`

**Accessibility**:
- Wrapping `<ol>` with `role="list"`, each milestone is `<li>`
- `aria-label` on each milestone summarizing the node ("Stop 1: Hồng Nhung, arrive 24%, charge to 80%, 21 minutes")

## 8. Edge cases

| Case | Handling |
|---|---|
| `chargingStops.length === 0` | Skip the timeline section entirely. Show "Không cần sạc" inline below totals. |
| `chargingStops.length === 1` | 3 nodes — fits comfortably without scroll |
| `chargingStops.length === 2` | 4 nodes — still fits on 360 px without scroll |
| `chargingStops.length >= 3` (5+ nodes) | `overflow-x-auto` + swipe hint |
| `extractCityName` returns empty | Fall back to first 12 chars of raw address |
| `extractStationShortName` returns empty | Caller substitutes `"Trạm ${i+1}"` |
| ETA in the past (device clock skew) | Drop the ETA segment; render `trip_duration_only` so the headline reads `~4h14m` without a misleading clock time |
| `arrivalBatteryPercent < 0` | Clamp to 0 (defensive — should never happen) |
| `detectPasses` returns 0 passes | Skip the warnings row entirely |
| `detectPasses` returns 4+ passes | Cap at 3 in UI, log the rest for telemetry |
| `polyline` is empty / malformed | `detectPasses` returns `[]`, no warning shown |

## 9. Decisions log

| Decision | Choice | Why |
|---|---|---|
| Battery journey bar | **Remove** | Twin viz with timeline is noise; timeline ties battery to specific LOCATION |
| ETA hierarchy | **Arrival battery FIRST, ETA secondary with caveat** | Arrival battery = trust signal that addresses range anxiety. ETA leading position would create a false-precision promise (VN traffic / weather / terrain shift it 30–60 min). "Nếu đi ngay" qualifier scopes the claim. |
| ETA strategy | **Assume "now"** | Date picker is YAGNI for v1; 90% of usage is real-time planning |
| Trust intelligence layer | **Static known-pass detection (no API)** | Vietnamese major passes are well-known and finite; static dataset = zero latency, zero cost, zero new failure modes. Elevation API deferred until usage proves we need other terrain types. |
| Province annotations | **Skip** | Not actionable; would need reverse-geocode call per waypoint |
| Icon usage | **None** | Per project CLAUDE.md "Less Icons, More Humanity" rule |
| Timeline orientation | **Horizontal** | Maps naturally to "journey from left to right"; vertical wastes vertical space |
| Truncation logic location | **In parent (`TripSummary`)** | Keeps `RouteTimeline` pure-presentational and easier to test |
| Pass warning placement | **Between timeline and totals** | Above totals = stays in user's eye-line during summary scan; not inside timeline = keeps timeline component pure |

## 10. Locale keys

**Add** to both `src/locales/vi.json` and `src/locales/en.json`:

| Key | vi | en |
|---|---|---|
| `trip_arrival_battery_hero` | `Còn pin {percent}% khi tới` | `{percent}% battery when you arrive` |
| `trip_duration_with_eta` | `~{time} · đến lúc {eta} nếu đi ngay` | `~{time} · arrive at {eta} if leaving now` |
| `trip_duration_only` | `~{time}` | `~{time}` |
| `trip_totals_compact` | `{distance}km · {stops} trạm sạc` | `{distance}km · {stops} stops` |
| `trip_breakdown_drive_charge` | `Lái {drive} · Sạc {charge}` | `Drive {drive} · Charge {charge}` |
| `trip_timeline_swipe_hint` | `← Vuốt để xem thêm điểm dừng` | `← Swipe for more stops` |
| `trip_timeline_aria_stop` | `Điểm dừng {n}: {name}, đến với pin {arrive}%, sạc lên {depart}%, mất {minutes} phút` | `Stop {n}: {name}, arrive {arrive}%, charge to {depart}%, {minutes} minutes` |
| `trip_terrain_warning_pass` | `Đường có {passName} — pin tốn nhanh ~{drainPercent}%` | `Route includes {passName} — battery drains ~{drainPercent}% faster` |

**Remove** (unused after redesign):
- `battery_journey` (line 51 in `vi.json`, similar in `en.json`)

The auto-checking `locale-keys.test.ts` will catch mismatches.

## 11. Files to create / modify

**Create**:
- `src/lib/trip/extract-city.ts`
- `src/lib/trip/extract-city.test.ts`
- `src/lib/trip/extract-station-name.ts`
- `src/lib/trip/extract-station-name.test.ts`
- `src/lib/trip/known-passes.ts`
- `src/lib/trip/detect-passes.ts`
- `src/lib/trip/detect-passes.test.ts`
- `src/components/trip/RouteTimeline.tsx`
- `src/components/trip/RouteTimeline.test.tsx`

**Modify**:
- `src/components/trip/TripSummary.tsx` — replace overview block (lines 506–587) with headline (3 lines) + `<RouteTimeline />` + terrain warnings row + compact totals
- `src/components/trip/TripSummary.test.tsx` — drop assertions on the address echo and battery bar; add assertions for arrival-battery hero, duration+ETA secondary, timeline rendering, terrain warning rendering
- `src/locales/vi.json` — add 8 keys, remove `battery_journey`
- `src/locales/en.json` — add 8 keys, remove `battery_journey`

## 12. Testing strategy

**New unit tests** (must pass before commit):
- `extract-city.test.ts` — 7+ cases including edge cases listed in §5
- `extract-station-name.test.ts` — 5+ cases listed in §6
- `detect-passes.test.ts` — 6+ cases listed in §6.5; use real polyline samples from a stored test fixture so tests don't drift if the polyline format changes
- `RouteTimeline.test.tsx` — render with 0/1/2/5 stops, verify color logic, verify scroll-hint visibility

**Updated tests**:
- `TripSummary.test.tsx` — replace any assertions on address-echo string or battery-bar DOM with assertions on the new structure (arrival hero, duration+ETA, terrain warning row when applicable)

**Manual QA checklist** (before declaring done):
- [ ] iOS Safari portrait at 390 px — no horizontal overflow except inside the timeline scroll container
- [ ] Android Chrome portrait at 360 px — same
- [ ] Trip with `chargingStops.length === 0` — timeline section omitted, "Không cần sạc" still shown
- [ ] Trip with 5+ stops — horizontal swipe works, hint visible
- [ ] Trip HCM → Đà Lạt — terrain warning row shows "Đèo Bảo Lộc"
- [ ] Trip HCM → Vũng Tàu (no passes) — terrain warning row absent
- [ ] Both `vi` and `en` locales render without missing-key warnings
- [ ] Very long station name displayed correctly (truncated, no overflow)
- [ ] ETA secondary line renders "đến lúc HH:MM nếu đi ngay" — qualifier never dropped
- [ ] `npm test` passes (all 813+ tests stay green or higher)
- [ ] `npx next build` succeeds (no TypeScript errors)

## 13. Scope of this phase

Items below are **NOT** in this phase. Each falls into one of three categories:

### 13a. Scheduled in the Trust Intelligence Roadmap (see §14)

These are committed work, sequenced for delivery in subsequent phases. They are **not deferred-conditionally** — they will be built.

| Item | Phase | Why later, not now |
|---|---|---|
| **Departure-time picker + real-time traffic-aware ETA** | Phase 2 | Needs Mapbox `driving-traffic` profile integration + UI redesign of departure flow. Coherent feature, deserves own spec. |
| **Peak-hour traffic warnings** | Phase 2 | Same workstream as departure-time picker — both rely on traffic intelligence layer. |
| **Charging station popularity prediction + reservation surfacing** | Phase 3 | Needs 4–8 weeks of historical `chargingStatus` data accumulation. **Data collection cron starts in parallel with this phase** so cold-start is shorter when Phase 3 ships. |
| **Charging stop amenities (Overpass POI integration)** | Phase 4 | Needs Overpass query layer + Postgres caching schema + UI for inline previews. Independent workstream. |

### 13b. Backlog — sensible additions, awaiting prioritization

These are real product improvements but not in any active phase yet. Will be promoted into a phase based on user feedback or design availability.

- Province / city milestones along the route (reverse-geocode waypoints) — adds geographic context to timeline; needs reverse-geocode source decision (Nominatim free OK)
- Tappable timeline nodes that scroll to the matching detail card below — UX polish, not new intelligence
- Persisting "swipe hint dismissed" state — minor UX; current always-shown is acceptable
- Animated battery flow on the timeline (motion design) — pure aesthetic; needs motion-design pass first

### 13c. Genuinely speculative — needs validation before any work

These would change the product in ways that need user research first. Do **not** treat as roadmap items.

- **Weather impact on range model** — only valuable if VN drivers actually adjust trips based on weather; needs user research to confirm
- **Elevation API for arbitrary terrain** (beyond known passes) — static pass dataset covers 90% of cases; would only matter for unusual rural routes
- **A/B testing the redesign** — eVoyage user base is too small for statistical significance; revisit if scale changes

---

## 14. Trust Intelligence Roadmap

This spec is Phase 1 of a four-phase build-out. Each phase is a separate, fully-specced feature delivering coherent user value at $0 ongoing infra cost. Phases are sequenced for impact, dependencies, and data-accumulation timing.

| Phase | Feature | Status | Ongoing Cost | Effort |
|---|---|---|---|---|
| **1** | **Trip Overview Timeline + Terrain Warnings** (this spec) | In design (v3) | $0 | ~1 week |
| **2** | **Departure Intelligence + Real-Time Traffic** — Mapbox `driving-traffic` (within free tier 100k/month) + departure-time picker + heuristic peak-hour fallback + what-if comparison + holiday-aware buffer | Spec to be written next | $0 | ~2 weeks |
| **3** | **Station Popularity Engine** — historical aggregation of crawled `chargingStatus` → 168-cell heatmap per station + holiday boosts + reservation deep-link to V-GREEN. **Data collection cron starts in parallel with Phase 1** to mitigate cold-start. | Spec to be written; data collection migration starts immediately | $0 | ~2 weeks (after data accumulates) |
| **4** | **Charging Stop Amenities** — Overpass API POI query (food, ATM, WC, fuel, pharmacy) + 30-day Postgres cache + walking-time filter + categorization aligned to charge duration | Spec to be written | $0 | ~1.5 weeks |

**Critical dependency**: Phase 3's popularity engine needs ≥ 4 weeks of accumulated status data for meaningful predictions. To prevent ship-then-wait, the **data collection cron is implemented in a parallel workstream during Phase 1**, so by the time Phase 3 ships, the prediction model has signal.

**Cross-phase principles** (apply to all four):
1. **$0 ongoing cost** — free-tier infrastructure only (Vercel + Supabase + Mapbox free tier + Overpass + GitHub Actions + external cron service)
2. **Honest UX about data limits** — when data is sparse (cold-start, missing OSM data, etc.), show "chưa đủ dữ liệu" rather than fake confidence
3. **Crowdsource where possible** — post-trip prompts feed back into models, improving accuracy over time
4. **No paid APIs without explicit user approval** — see `feedback_zero_infra_cost.md`
