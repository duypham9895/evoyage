# TODOS

## Timing-deferred (gated on data accumulation, NOT scope-deferred)

Per `feedback_classify_deferrals.md` — these items have ADRs/specs locked,
implementation just needs the gate condition to clear.

### ADR-0007 — Station reliability ranking

- **Gate:** `StationStatusObservation` has ≥30 days accumulated for the bulk of stations
- **Target:** ~2026-06-02 (Phase 3 collection started 2026-05-03)
- **Effort:** ~210 LOC + ~30 tests across 3-4 sessions
- **ADR:** `docs/adr/0007-station-reliability-ranking.md`

### ADR-0006 magic-number recalibration

- **Gate:** 2-4 weeks of telemetry from `backup_alternatives_distribution`,
  `alternative_marker_clicked`, `alternative_list_item_clicked`,
  `alternative_navigate_clicked`
- **Target:** ~2026-05-22 onward (events shipped 2026-05-08)
- **Magic numbers to validate:** `0.70`, `25`, `3`, `100`, `720`, peak windows,
  bucket boundaries (8 total — see ADR-0006 Consequences)
- **ADR:** `docs/adr/0006-backup-station-selection.md`

### ADR-0008 — Reliability UI exposure decision

- **Gate:** ADR-0007 shipped + 2-4 weeks of its telemetry
  (`reliability_gated_count`, `reliability_distribution`) plus ADR-0006 events
- **Target:** ~2026-06-22 (3 weeks post ADR-0007 ship)
- **Decision:** internal-only vs tier badge vs detail percentage vs warning-only
- **Pre-condition:** ADR-0007 telemetry shows whether ranking change actually
  moves user behavior

### Phase 3b popularity calibration

- **Gate:** 4 weeks of `StationStatusObservation` data (per spec)
- **Target:** ~2026-06-02
- **Status:** UI shipped (`StopPopularity.tsx`), API integrated
  (`queryStationPopularity`); verdicts currently "insufficient-data"
  for most stations until data accumulates
- **Spec:** `docs/specs/2026-05-03-phase-3b-popularity-prediction-design.md`

## Scope-deferred (waiting on PM decision, not data)

_None._

## Completed

### ~~ADR-0006 — Backup Station Selection~~ ✓ (2026-05-08)

- **Shipped:** Dynamic 0–3 alternatives per stop driven by 5-signal
  Backup Pressure Score; 12-min detour-time budget filter; N=0 banner;
  alternative markers on map with click-to-popup; locale parity (vi/en);
  4 telemetry events for calibration window.
- **ADR:** `docs/adr/0006-backup-station-selection.md`
- **CONTEXT.md:** Alternative Station, Backup Pressure Score, Reliability terms

### ~~eVi "Show on Map" — Station Card → Map Marker Highlight~~ ✓ (v0.5.0)
- **Shipped:** Smart Map Markers + eVi Bridge. Station cards in eVi chat have "Show on Map" button that highlights the station on the map with fly-to + pulse animation. Implemented via lightweight `station-events.ts` event emitter.
- **Design doc:** `edwardpham-main-design-20260322-212855.md`
