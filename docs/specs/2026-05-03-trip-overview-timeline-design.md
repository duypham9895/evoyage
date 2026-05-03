# Trip Overview — Route Timeline Redesign

**Status**: Approved (v2) 2026-05-03 — incorporates Head-of-Product critique on ETA framing and trust-intelligence layer
**Owner**: Duy Phạm (PM) · Implementation: Claude Code
**Trigger**: User feedback that the current overview card "just put the beginning and end points from the trip, don't have any meaning"

**Changelog**:
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

## 13. Out of scope (explicitly deferred)

These were considered and **not** included in this iteration:

- Departure-time picker — add only if user data shows non-real-time usage
- Province / city milestones along the route (reverse-geocode waypoints)
- Animated battery flow on the timeline (motion design)
- Tappable timeline nodes that scroll to the matching detail card below
- A/B testing the redesign — too small a user base to be statistically meaningful
- Persisting "swipe hint dismissed" state — always show for now; revisit if annoying
- **Elevation API** for arbitrary terrain detection — static known-pass dataset covers 90% of Vietnamese trips; add only if non-pass terrain becomes a complaint
- **Peak-hour traffic warnings** — needs traffic data source + Vietnam-specific rush-hour modeling
- **Weather impact on range** — needs weather API + range-degradation model
- **Charging station reservation status** — V-GREEN does not currently expose a reservation API
- **Food / amenities near charging stops** — needs places-API integration (cost, latency)

These 5 "trust intelligence" items above were specifically discussed in the Head-of-Product review on 2026-05-03 and consciously deferred to keep the v1 redesign shippable. If post-launch user feedback prioritizes any of them, file a follow-up spec.
