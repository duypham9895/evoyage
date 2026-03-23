# TODOS

## Deferred Work

### E2E Test Fixmes — 3 tests need mock refinement
- **F2 (eVi Chat):** Mock auto-triggers `onPlanTrip` via useEffect before test can verify chat response. Needs a two-step mock (incomplete → complete).
- **F7 (Share):** Share modal opens (confirmed via screenshot) but copy link text assertion races with rendering. Needs more specific selector or wait condition.
- **F3 (Radius):** Radius km buttons exist but selector doesn't match — needs investigation of actual DOM structure after geolocation resolves.
- **Priority:** P3 — all 3 are edge cases in the E2E suite. The 18 passing tests cover all critical user flows.
- **Design doc:** `edwardpham-main-design-20260323-113614.md`

## Completed

### ~~eVi "Show on Map" — Station Card → Map Marker Highlight~~ ✓ (v0.5.0)
- **Shipped:** Smart Map Markers + eVi Bridge. Station cards in eVi chat have "Show on Map" button that highlights the station on the map with fly-to + pulse animation. Implemented via lightweight `station-events.ts` event emitter.
- **Design doc:** `edwardpham-main-design-20260322-212855.md`
