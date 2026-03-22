# TODOS

## Deferred Work

### eVi "Show on Map" — Station Card → Map Marker Highlight
- **What:** When a user taps a station card in eVi chat, highlight that station on the map and fly to its location.
- **Why:** Completes the cross-surface integration between eVi chat and the map. Currently eVi station cards only have a "Navigate" button (Google Maps). Showing on the in-app map would keep users in eVoyage.
- **Pros:** Better UX — users can see station context on the map without leaving the app. Enables future features like "compare stations on map."
- **Cons:** Requires a new communication channel (event bus or shared context) between EVi component and Map component. Architectural change.
- **Context:** Deferred from v1 of "Find Nearby Stations" (design doc: `edwardpham-main-design-20260321-204249.md`). The v1 scope includes map locate button + eVi station search, but cross-surface "show on map" was cut to keep the diff focused. To implement: either add a `highlightStation` callback prop chain from EVi → HomeContent → Map, or introduce a lightweight event emitter.
- **Depends on:** v1 of Find Nearby Stations feature (map locate button + eVi station search) must ship first.
