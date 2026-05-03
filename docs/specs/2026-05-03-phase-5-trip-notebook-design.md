# Phase 5 — Trip Notebook (Saved Trips, History, Share-Back)

**Status**: Drafted 2026-05-03 — implementation pending user approval
**Owner**: Duy Phạm (PM) · Implementation: Claude Code
**Phase context**: First post-Trust-Intelligence-Roadmap phase. Independent of Phases 1-4 (those answer "is this trip safe and trustworthy"); this answers "I want to come back to this trip later or pass it along".

**Project framing**: Per `feedback_no_mvp_serious_features.md` and `feedback_zero_infra_cost.md` — build properly, free-tier only.

## 1. Problem

Today, a planned trip exists for exactly one browser session. Nothing persists:
- Plan a HCM → Đà Lạt trip → close tab → all gone (must reconstruct from URL params, which most users won't bookmark)
- Want to send the same trip to a passenger / family member → manual share button each time
- Plan multiple variants ("VF8 vs VF9 for the same route") → no way to compare side-by-side later
- Return to "I usually drive this monthly" → re-enter every parameter every time

The friction surfaces as: drivers either learn the URL-share workaround (rare) or treat the planner as a one-shot tool. eVoyage doesn't grow into a daily companion because it doesn't remember anything.

## 2. Goal

A driver who's planned at least one trip can:

1. **See their last 10 trips** in a dedicated "Trips" view, sorted by most-recently-planned
2. **Pin** any trip → it floats to the top + opens with one tap
3. **Re-plan** a saved trip with one tap (loads start/end/vehicle/battery params and recalculates with current conditions — important since traffic/holidays may have changed)
4. **Share-back** any saved trip via existing ShareButton (already shipped); the share link is round-trippable so the recipient sees the same plan
5. **Delete** a trip from history

The notebook is browser-local (localStorage) for v1. Server-side sync is a Phase 5b decision based on actual usage signal.

## 3. Components

### 3a. Trip notebook store (`src/lib/trip/notebook-store.ts`)
LocalStorage-backed wrapper with type-safe API:

```ts
interface SavedTrip {
  readonly id: string; // crypto.randomUUID
  readonly savedAt: string; // ISO
  readonly lastViewedAt: string; // ISO, updated on re-open
  readonly pinned: boolean;
  readonly start: string;
  readonly end: string;
  readonly startCoords?: { lat: number; lng: number };
  readonly endCoords?: { lat: number; lng: number };
  readonly waypoints: readonly { lat: number; lng: number; name?: string }[];
  readonly isLoopTrip: boolean;
  readonly vehicleId: string | null;
  readonly customVehicle: CustomVehicleInput | null;
  readonly currentBattery: number;
  readonly minArrival: number;
  readonly rangeSafetyFactor: number;
  readonly departAt: string | null;
}

interface NotebookStore {
  list(): readonly SavedTrip[];
  save(trip: Omit<SavedTrip, 'id' | 'savedAt' | 'lastViewedAt' | 'pinned'>): SavedTrip;
  pin(id: string, pinned: boolean): void;
  touch(id: string): void; // bump lastViewedAt
  remove(id: string): void;
  clear(): void;
}
```

Storage key: `evoyage-notebook-v1`. Versioning in the key so we can ship breaking changes cleanly.

Limit: keep the most recent 50 entries; older auto-prune on save.

### 3b. Auto-save on plan complete (in `plan/page.tsx`)
After a successful `POST /api/route` returns, save the trip parameters to the notebook. Only deduplicate if the SAME (start, end, vehicleId, departAt) tuple was already saved within the last 5 min — avoids saving 3 identical entries when the user clicks "Tính lộ trình" multiple times in a row.

### 3c. Notebook view UI (`src/components/trip/TripNotebook.tsx`)
New top-level UI surface accessed via:
- Mobile: a new "Notebook" tab (or extend the existing tab bar — TBD per UI review)
- Desktop: a sidebar entry under existing tabs

List rendering:
- Pinned trips first, then by `lastViewedAt` desc
- Each entry: city → city headline (reuse `extractCityName`), vehicle name, saved-at relative time
- 3 action affordances: re-plan, pin/unpin, delete
- Empty state: "Bạn chưa lưu chuyến đi nào — kế hoạch xong sẽ tự lưu vào đây"

### 3d. Re-plan flow
Tapping a saved trip:
1. Load every saved param into the page-level state (start, end, vehicle, battery, etc.)
2. Update URL via `syncToUrl` so the trip is shareable
3. Auto-trigger `handlePlanTrip` so user lands on the result, not the form
4. `notebook.touch(id)` to bump lastViewedAt

### 3e. Auto-cleanup hooks
- On notebook open, prune entries older than 90 days (configurable constant)
- On `clear()` call, ask for confirmation

### 3f. Analytics (extend Phase 1+2+4 events)
- `notebook_opened` (entry count)
- `trip_replanned_from_notebook` (saved trip id, days_since_saved)
- `trip_pinned` / `trip_unpinned`

## 4. Data flow

```
User completes a trip plan
  → handlePlanTrip → POST /api/route
  → Response saved to setTripPlan
  → notebook.save({ start, end, vehicleId, ..., departAt })
  → Subsequent renders show "Notebook" badge

User opens notebook view
  → notebook.list() → render
  → User taps re-plan
  → setStart/setEnd/setVehicle/etc + setDepartAt
  → handlePlanTrip auto-fires
  → notebook.touch(id) updates lastViewedAt
```

## 5. Decisions log

| Decision | Choice | Why |
|---|---|---|
| Storage layer | **localStorage v1** | Matches existing pattern (range safety factor stored locally); $0 server cost; no auth required |
| Server-side sync | **Defer to Phase 5b** | Validate usage demand first; cross-device sync is a feature, not a default |
| Storage key versioning | **`evoyage-notebook-v1`** | Future v2 with breaking schema changes won't crash legacy clients |
| Entry limit | **50 most recent** | Prevents unbounded localStorage growth; users with > 50 trips are well outside the 80th-percentile use case |
| Dedup window | **5 min same-tuple** | Prevents button-mash duplicates; 5-min boundary cleanly handles "user replans a couple hours later" as a fresh entry |
| Pin semantics | **Boolean per entry** | No ranking among pinned; users with > 5 pins can probably benefit from a folder concept (deferred) |
| Auto-prune age | **90 days since lastViewedAt** | Stale trips lose value; 90 days catches monthly-ish trips |
| Re-plan refresh | **Always re-fetch** | Conditions change (holiday, traffic, station status) — never serve a stale plan from cache |
| Empty state | **Honest "Bạn chưa lưu..." copy** | Don't fake-onboard with a synthetic "example trip" |
| Mobile entry surface | **TBD per UI review** | Adding a 5th tab needs DESIGN.md review; spec defers to that pass |

## 6. Files to create / modify

**Create**:
- `src/lib/trip/notebook-store.ts` + tests (storage layer)
- `src/components/trip/TripNotebook.tsx` + tests (view)
- `src/components/trip/TripNotebookEntry.tsx` + tests (list row)

**Modify**:
- `src/app/plan/page.tsx` — auto-save on plan complete + load-and-replan handler
- `src/lib/analytics.ts` — add 3 notebook events
- `src/locales/vi.json` + `src/locales/en.json` — view title, action labels, empty state, save toast
- `src/components/layout/MobileTabBar.tsx` (or alternative entry) — TBD per UI review (see §5)

## 7. Edge cases

| Case | Handling |
|---|---|
| User in Incognito (no localStorage write access) | `notebook.save` is a no-op; UI hides notebook entry surface to avoid teasing a feature that won't persist |
| LocalStorage quota exceeded | On QuotaExceededError, prune oldest 10 entries and retry once; if still failing, show "Notebook đầy — xoá vài chuyến đi cũ" |
| Saved vehicle no longer in DB (e.g. ID rotated) | Fall back to customVehicle field if present; otherwise show "Xe không còn trong eVoyage" warning on the entry; tap = open vehicle picker |
| Saved trip URL-shared then opener has different vehicle access | URL params already drive page state; saved-trip pre-fill is best-effort |
| User clears browser data | Notebook gone; no recovery (acceptable for v1 — server sync is Phase 5b) |
| Same start/end picked but different waypoints | Treated as different entries (waypoints affect dedup tuple) |

## 8. Testing strategy

**Unit tests**:
- `notebook-store.test.ts` — save/list/pin/touch/remove/clear, dedup window, prune-on-50, version-key isolation, QuotaExceededError handling
- `TripNotebook.test.tsx` — empty state, pinned-first sort, action callbacks
- `TripNotebookEntry.test.tsx` — relative-time rendering, vehicle-missing fallback

**Integration test**:
- Plan a trip → notebook.save fires → open notebook → tap re-plan → page state restored → handlePlanTrip auto-fires

**Manual QA**:
- [ ] Plan 3 trips, all appear in notebook
- [ ] Pin 1 → it floats to top
- [ ] Re-plan 1 → URL updates, plan renders, lastViewedAt updates
- [ ] Delete 1 → it's gone
- [ ] Reload page → notebook persists
- [ ] Incognito mode → notebook surface hidden
- [ ] 50+ trip stress test → oldest pruned correctly

## 9. Out of scope (this phase)

- **Server-side sync** — Phase 5b after usage signal
- **Sharing notebook entries directly** — current ShareButton via the active trip plan is sufficient
- **Trip groups / folders** — premature without usage data
- **Calendar integration** — "remind me to charge before this trip" — speculative
- **Trip templates** ("commute" vs "weekend") — no clear user demand yet
- **Cross-device login + sync** — implies auth system, large scope
- **Trip diff** ("show me what changed since I last planned this") — speculative
- **Notebook-from-eVi** ("show me my Đà Lạt trips") — natural follow-up but Phase 5c

## 10. Implementation sequencing (~5-7 days)

1. **Day 1** — `notebook-store.ts` + comprehensive tests (storage layer is the foundation; test edge cases hard before UI is built)
2. **Day 2** — `TripNotebookEntry.tsx` (single-row component) + tests
3. **Day 3** — `TripNotebook.tsx` (list view, sort, empty state) + tests
4. **Day 4** — Integration: auto-save on plan, replan handler, URL-state sync
5. **Day 5** — Locale keys (vi/en) + bilingual review
6. **Day 6** — Analytics events + dev-server visual QA
7. **Day 7** — Edge cases (incognito, quota, missing-vehicle), final QA, ship

Each day = 1+ atomic commit, green tests before moving on.

## 11. Roadmap implications

After Phase 5 ships, the natural follow-ups (per Phase 4 spec §12) are:

- **Phase 5b** — Server-side notebook sync (requires auth)
- **Phase 6** — Multi-driver coordination (group trips, convoy charging) — much larger scope
- **Phase 7** — VinFast partnership-driven features (reservation API, owner perks) — partnership-blocked

Phase 5 is the cleanest standalone next step. It compounds with Phase 1-4 trust intelligence: a driver returns to the same trip, sees updated traffic/popularity/amenities for current conditions, and trusts that eVoyage is a daily companion rather than a one-shot tool.
