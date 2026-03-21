# Project Structure Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize eVoyage's flat file structure into a clean, domain-grouped architecture without breaking any imports or functionality.

**Architecture:** Group `src/components/` by feature domain (trip, map, feedback, layout, landing). Group `src/lib/` by domain (routing, geo, vinfast, feedback, utils). Clean up root-level screenshot clutter. Consolidate test placement to colocated pattern.

**Tech Stack:** Next.js App Router, TypeScript path aliases (`@/`)

---

## Current Problems

1. **`src/components/`** — 20 files flat, no feature grouping
2. **`src/lib/`** — 33 files flat, 5 domains mixed together
3. **Root directory** — 40+ QA/test screenshots (gitignored but messy locally)
4. **Tests inconsistent** — some colocated (`*.test.ts` next to source), some in `__tests__/` folders
5. **`docs/`** — loose files at root level alongside subdirectories

## Target Structure

```
src/
├── app/                          # (unchanged - Next.js routes)
├── components/
│   ├── feedback/                 # Feedback system UI
│   │   ├── FeedbackFAB.tsx
│   │   ├── FeedbackModal.tsx
│   │   └── StarRating.tsx
│   ├── landing/                  # Landing page (already exists)
│   │   ├── LandingClient.tsx
│   │   └── LandingPageContent.tsx
│   ├── layout/                   # App chrome & navigation
│   │   ├── Header.tsx
│   │   ├── MobileBottomSheet.tsx
│   │   └── MobileTabBar.tsx
│   ├── map/                      # Map renderers
│   │   ├── ElevationChart.tsx
│   │   ├── GoogleMap.tsx
│   │   ├── Map.tsx
│   │   └── MapboxMap.tsx
│   └── trip/                     # Trip planning UI
│       ├── AddCustomVehicle.tsx
│       ├── BatteryStatusPanel.tsx
│       ├── BrandModelSelector.tsx
│       ├── PlaceAutocomplete.tsx
│       ├── ShareButton.tsx
│       ├── StationDetailExpander.tsx
│       ├── StationDetailSkeleton.tsx
│       ├── StationInfoChips.tsx
│       ├── StationInfoChips.test.tsx
│       ├── TripInput.tsx
│       ├── TripSummary.tsx
│       └── WaypointInput.tsx
├── hooks/                        # (unchanged)
├── lib/
│   ├── feedback/                 # (already exists)
│   │   ├── constants.ts
│   │   ├── email.ts
│   │   └── schema.ts
│   ├── geo/                      # Geocoding & map utilities
│   │   ├── coordinate-validation.ts
│   │   ├── coordinate-validation.test.ts
│   │   ├── elevation.ts
│   │   ├── elevation.test.ts
│   │   ├── map-utils.ts
│   │   ├── nominatim.ts
│   │   ├── polyline.ts
│   │   ├── polyline-simplify.ts
│   │   ├── polyline-simplify.test.ts
│   │   └── static-map.ts
│   │   └── static-map.test.ts
│   ├── routing/                  # Route planning & directions
│   │   ├── google-directions.ts
│   │   ├── mapbox-directions.ts
│   │   ├── matrix-api.ts
│   │   ├── matrix-api.test.ts
│   │   ├── osrm.ts
│   │   ├── range-calculator.ts
│   │   ├── range-calculator.test.ts
│   │   ├── route-cache.ts
│   │   ├── route-planner.ts
│   │   ├── route-planner.test.ts
│   │   ├── station-finder.ts
│   │   ├── station-finder.test.ts
│   │   ├── station-ranker.ts
│   │   ├── station-ranker.test.ts
│   │   └── trip-cache.ts
│   ├── vinfast/                  # VinFast integration
│   │   ├── vinfast-browser.ts
│   │   ├── vinfast-client.ts
│   │   └── vinfast-entity-resolver.ts
│   ├── cron-auth.ts              # Standalone utils stay at lib root
│   ├── haptics.ts
│   ├── locale.tsx
│   ├── map-mode.tsx
│   ├── prisma.ts
│   ├── rate-limit.ts
│   ├── rate-limit.test.ts
│   ├── safe-json.ts
│   ├── short-url.ts
│   └── vietnam-models.ts
├── locales/                      # (unchanged)
└── types/                        # (unchanged)
```

## Import Update Strategy

All imports use `@/` path alias. Moving `src/lib/osrm.ts` → `src/lib/routing/osrm.ts` means updating `@/lib/osrm` → `@/lib/routing/osrm` in every importing file.

**Key high-impact files** (used by many importers):
- `locale.tsx`, `map-mode.tsx`, `prisma.ts`, `rate-limit.ts`, `haptics.ts` → **stay at `@/lib/` root** to minimize import churn
- `nominatim.ts` → moves to `@/lib/geo/nominatim` (3 importers)
- `polyline.ts` → moves to `@/lib/geo/polyline` (6+ importers)
- `map-utils.ts` → moves to `@/lib/geo/map-utils` (3 importers)

---

### Task 1: Delete root-level screenshots

**Files:**
- Delete: all `qa-phase*.png` and `test*.png` files in project root

- [ ] **Step 1: Delete QA and test screenshots from root**

```bash
rm -f qa-phase*.png test*.png
```

These are gitignored artifacts from QA sessions — not tracked, not needed.

- [ ] **Step 2: Verify root is clean**

```bash
ls *.png 2>/dev/null | wc -l
```
Expected: 0

- [ ] **Step 3: Commit** (nothing to commit — files were untracked)

---

### Task 2: Restructure `src/components/` into feature folders

**Files:**
- Move: `src/components/FeedbackFAB.tsx` → `src/components/feedback/FeedbackFAB.tsx`
- Move: `src/components/FeedbackModal.tsx` → `src/components/feedback/FeedbackModal.tsx`
- Move: `src/components/StarRating.tsx` → `src/components/feedback/StarRating.tsx`
- Move: `src/components/Header.tsx` → `src/components/layout/Header.tsx`
- Move: `src/components/MobileBottomSheet.tsx` → `src/components/layout/MobileBottomSheet.tsx`
- Move: `src/components/MobileTabBar.tsx` → `src/components/layout/MobileTabBar.tsx`
- Move: `src/components/Map.tsx` → `src/components/map/Map.tsx`
- Move: `src/components/MapboxMap.tsx` → `src/components/map/MapboxMap.tsx`
- Move: `src/components/GoogleMap.tsx` → `src/components/map/GoogleMap.tsx`
- Move: `src/components/ElevationChart.tsx` → `src/components/map/ElevationChart.tsx`
- Move: 11 trip-related components → `src/components/trip/`
- Move: `src/components/__tests__/StationInfoChips.test.tsx` → `src/components/trip/StationInfoChips.test.tsx`
- Modify: `src/app/plan/page.tsx` (update all component imports)
- Modify: `src/components/trip/FeedbackFAB.tsx` (update FeedbackModal import)
- Modify: `src/components/feedback/FeedbackModal.tsx` (update StarRating import)
- Modify: `src/components/trip/TripInput.tsx` (update PlaceAutocomplete, WaypointInput imports)
- Modify: `src/components/trip/TripSummary.tsx` (update StationDetailExpander import)
- Modify: `src/components/trip/WaypointInput.tsx` (update PlaceAutocomplete import)
- Modify: `src/hooks/useUrlState.ts` (update WaypointInput type import)

- [ ] **Step 1: Create feature directories**

```bash
mkdir -p src/components/{feedback,layout,map,trip}
```

- [ ] **Step 2: Move feedback components**

```bash
git mv src/components/FeedbackFAB.tsx src/components/feedback/
git mv src/components/FeedbackModal.tsx src/components/feedback/
git mv src/components/StarRating.tsx src/components/feedback/
```

- [ ] **Step 3: Move layout components**

```bash
git mv src/components/Header.tsx src/components/layout/
git mv src/components/MobileBottomSheet.tsx src/components/layout/
git mv src/components/MobileTabBar.tsx src/components/layout/
```

- [ ] **Step 4: Move map components**

```bash
git mv src/components/Map.tsx src/components/map/
git mv src/components/MapboxMap.tsx src/components/map/
git mv src/components/GoogleMap.tsx src/components/map/
git mv src/components/ElevationChart.tsx src/components/map/
```

- [ ] **Step 5: Move trip components**

```bash
git mv src/components/AddCustomVehicle.tsx src/components/trip/
git mv src/components/BatteryStatusPanel.tsx src/components/trip/
git mv src/components/BrandModelSelector.tsx src/components/trip/
git mv src/components/PlaceAutocomplete.tsx src/components/trip/
git mv src/components/ShareButton.tsx src/components/trip/
git mv src/components/StationDetailExpander.tsx src/components/trip/
git mv src/components/StationDetailSkeleton.tsx src/components/trip/
git mv src/components/StationInfoChips.tsx src/components/trip/
git mv src/components/TripInput.tsx src/components/trip/
git mv src/components/TripSummary.tsx src/components/trip/
git mv src/components/WaypointInput.tsx src/components/trip/
git mv src/components/__tests__/StationInfoChips.test.tsx src/components/trip/StationInfoChips.test.tsx
rmdir src/components/__tests__
```

- [ ] **Step 6: Update all imports in `src/app/plan/page.tsx`**

Replace these import paths:
- `@/components/Header` → `@/components/layout/Header`
- `@/components/TripInput` → `@/components/trip/TripInput`
- `@/components/BrandModelSelector` → `@/components/trip/BrandModelSelector`
- `@/components/AddCustomVehicle` → `@/components/trip/AddCustomVehicle`
- `@/components/BatteryStatusPanel` → `@/components/trip/BatteryStatusPanel`
- `@/components/TripSummary` → `@/components/trip/TripSummary`
- `@/components/ShareButton` → `@/components/trip/ShareButton`
- `@/components/FeedbackFAB` → `@/components/feedback/FeedbackFAB`
- `@/components/MobileBottomSheet` → `@/components/layout/MobileBottomSheet`
- `@/components/MobileTabBar` → `@/components/layout/MobileTabBar`
- `@/components/Map` → `@/components/map/Map`
- `@/components/GoogleMap` → `@/components/map/GoogleMap`
- `@/components/MapboxMap` → `@/components/map/MapboxMap`
- `@/components/WaypointInput` → `@/components/trip/WaypointInput`

- [ ] **Step 7: Update intra-component imports**

- `src/components/feedback/FeedbackFAB.tsx`: dynamic import `@/components/FeedbackModal` → `@/components/feedback/FeedbackModal`
- `src/components/feedback/FeedbackModal.tsx`: import `StarRating` — check if it uses `@/components/StarRating` or relative `./StarRating`
- `src/components/trip/TripInput.tsx`: update `PlaceAutocomplete` and `WaypointInput` imports
- `src/components/trip/TripSummary.tsx`: update `StationDetailExpander` import
- `src/components/trip/WaypointInput.tsx`: update `PlaceAutocomplete` import

- [ ] **Step 8: Update `src/hooks/useUrlState.ts`**

Change: `@/components/WaypointInput` → `@/components/trip/WaypointInput`

- [ ] **Step 9: Build and verify**

```bash
npm run build
```
Expected: Build succeeds with no import errors.

- [ ] **Step 10: Run tests**

```bash
npx vitest run
```
Expected: All tests pass.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor: group components into feature folders (trip, map, feedback, layout)"
```

---

### Task 3: Restructure `src/lib/` into domain folders

**Files:**
- Create: `src/lib/geo/`, `src/lib/routing/`, `src/lib/vinfast/`
- Move: 10 geo files → `src/lib/geo/`
- Move: 15 routing files → `src/lib/routing/`
- Move: 3 vinfast files → `src/lib/vinfast/`
- Move: colocated tests alongside their source files
- Delete: `src/lib/__tests__/` directory
- Modify: all files that import moved modules

- [ ] **Step 1: Create domain directories**

```bash
mkdir -p src/lib/{geo,routing,vinfast}
```

- [ ] **Step 2: Move geo modules**

```bash
git mv src/lib/coordinate-validation.ts src/lib/geo/
git mv src/lib/elevation.ts src/lib/geo/
git mv src/lib/map-utils.ts src/lib/geo/
git mv src/lib/nominatim.ts src/lib/geo/
git mv src/lib/polyline.ts src/lib/geo/
git mv src/lib/polyline-simplify.ts src/lib/geo/
git mv src/lib/static-map.ts src/lib/geo/
git mv src/lib/__tests__/coordinate-validation.test.ts src/lib/geo/
git mv src/lib/__tests__/elevation.test.ts src/lib/geo/
git mv src/lib/__tests__/polyline-simplify.test.ts src/lib/geo/
git mv src/lib/__tests__/static-map.test.ts src/lib/geo/
```

- [ ] **Step 3: Move routing modules**

```bash
git mv src/lib/google-directions.ts src/lib/routing/
git mv src/lib/mapbox-directions.ts src/lib/routing/
git mv src/lib/matrix-api.ts src/lib/routing/
git mv src/lib/osrm.ts src/lib/routing/
git mv src/lib/range-calculator.ts src/lib/routing/
git mv src/lib/route-cache.ts src/lib/routing/
git mv src/lib/route-planner.ts src/lib/routing/
git mv src/lib/station-finder.ts src/lib/routing/
git mv src/lib/station-ranker.ts src/lib/routing/
git mv src/lib/trip-cache.ts src/lib/routing/
git mv src/lib/range-calculator.test.ts src/lib/routing/
git mv src/lib/route-planner.test.ts src/lib/routing/
git mv src/lib/station-finder.test.ts src/lib/routing/
git mv src/lib/__tests__/matrix-api.test.ts src/lib/routing/
git mv src/lib/__tests__/station-ranker.test.ts src/lib/routing/
git mv src/lib/__tests__/rate-limit.test.ts src/lib/
```

- [ ] **Step 4: Move VinFast modules**

```bash
git mv src/lib/vinfast-browser.ts src/lib/vinfast/
git mv src/lib/vinfast-client.ts src/lib/vinfast/
git mv src/lib/vinfast-entity-resolver.ts src/lib/vinfast/
```

- [ ] **Step 5: Remove empty `__tests__/` directory**

```bash
rmdir src/lib/__tests__
```

- [ ] **Step 6: Update imports in API routes**

**`src/app/api/route/route.ts`** (heaviest — 12 import changes):
- `@/lib/coordinate-validation` → `@/lib/geo/coordinate-validation`
- `@/lib/osrm` → `@/lib/routing/osrm`
- `@/lib/google-directions` → `@/lib/routing/google-directions`
- `@/lib/mapbox-directions` → `@/lib/routing/mapbox-directions`
- `@/lib/route-planner` → `@/lib/routing/route-planner`
- `@/lib/polyline` → `@/lib/geo/polyline`
- `@/lib/route-cache` → `@/lib/routing/route-cache`
- `@/lib/matrix-api` → `@/lib/routing/matrix-api`
- `@/lib/station-ranker` → `@/lib/routing/station-ranker`
- `@/lib/station-finder` → `@/lib/routing/station-finder`
- `@/lib/trip-cache` → `@/lib/routing/trip-cache`

**`src/app/api/stations/[id]/vinfast-detail/route.ts`**:
- `@/lib/vinfast-client` → `@/lib/vinfast/vinfast-client`
- `@/lib/vinfast-entity-resolver` → `@/lib/vinfast/vinfast-entity-resolver`

**`src/app/api/share-card/route.tsx`**: (no changes — uses rate-limit which stays at root)

- [ ] **Step 7: Update imports in components**

- `src/components/map/GoogleMap.tsx`: `@/lib/polyline` → `@/lib/geo/polyline`, `@/lib/map-utils` → `@/lib/geo/map-utils`
- `src/components/map/Map.tsx`: same polyline + map-utils changes
- `src/components/map/MapboxMap.tsx`: same polyline + map-utils changes
- `src/components/map/ElevationChart.tsx`: `@/lib/elevation` → `@/lib/geo/elevation`
- `src/components/trip/PlaceAutocomplete.tsx`: `@/lib/nominatim` → `@/lib/geo/nominatim`
- `src/components/trip/TripInput.tsx`: `@/lib/nominatim` → `@/lib/geo/nominatim`
- `src/components/trip/WaypointInput.tsx`: `@/lib/nominatim` → `@/lib/geo/nominatim`
- `src/components/trip/StationDetailExpander.tsx`: `@/lib/vinfast-client` → `@/lib/vinfast/vinfast-client`
- `src/components/trip/BatteryStatusPanel.tsx`: `@/lib/range-calculator` → `@/lib/routing/range-calculator`

- [ ] **Step 8: Update internal lib cross-references**

- `src/lib/routing/route-planner.ts`: `@/lib/range-calculator` → `@/lib/routing/range-calculator`, `@/lib/station-finder` → `@/lib/routing/station-finder`, `@/lib/polyline` → `@/lib/geo/polyline`
- `src/lib/geo/elevation.ts`: `@/lib/polyline` → `@/lib/geo/polyline`, `@/lib/station-finder` → `@/lib/routing/station-finder`
- `src/lib/geo/polyline-simplify.ts`: `@/lib/polyline` → `@/lib/geo/polyline`
- `src/lib/routing/route-cache.ts`: `@/lib/prisma` stays (prisma at root)
- `src/lib/vinfast/vinfast-entity-resolver.ts`: `@/lib/prisma` stays

- [ ] **Step 9: Update test import paths**

Tests that moved need their relative imports updated if they use relative paths. Most use `@/` paths so they follow the same rules as Step 6-8.

- [ ] **Step 10: Build and verify**

```bash
npm run build
```
Expected: Build succeeds.

- [ ] **Step 11: Run tests**

```bash
npx vitest run
```
Expected: All tests pass.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor: group lib modules into domain folders (geo, routing, vinfast)"
```

---

### Task 4: Clean up docs structure

**Files:**
- Move: `docs/prd-feedback-system.md` → `docs/design/prd-feedback-system.md`
- Move: `docs/security-audit-2026-03-18.md` → `docs/design/security-audit-2026-03-18.md`

- [ ] **Step 1: Move loose docs into subdirectories**

```bash
git mv docs/prd-feedback-system.md docs/design/
git mv docs/security-audit-2026-03-18.md docs/design/
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "refactor: organize loose docs into design/ subdirectory"
```

---

### Task 5: Add .DS_Store to gitignore (if not already)

- [ ] **Step 1: Verify .DS_Store is gitignored**

Already present in `.gitignore`. No action needed.

---

### Task 6: Final verification

- [ ] **Step 1: Full build**

```bash
npm run build
```

- [ ] **Step 2: Full test suite**

```bash
npx vitest run
```

- [ ] **Step 3: Verify no orphaned imports**

```bash
grep -r "from '@/components/" src/ | grep -v node_modules | grep -v ".next"
grep -r "from '@/lib/" src/ | grep -v node_modules | grep -v ".next"
```

Manually verify all paths point to existing files.
