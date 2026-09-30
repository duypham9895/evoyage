# TODOS

## Timing-deferred (gated on data accumulation, NOT scope-deferred)

Per `feedback_classify_deferrals.md` — these items have ADRs/specs locked,
implementation just needs the gate condition to clear.

### ADR-0006 magic-number recalibration

- **Gate:** 2-4 weeks of telemetry from `backup_alternatives_distribution`,
  `alternative_marker_clicked`, `alternative_list_item_clicked`,
  `alternative_navigate_clicked`
- **Target:** ~2026-05-22 onward (events shipped 2026-05-08) — **overdue.** The window
  opened long ago; query the telemetry and either recalibrate or close this out.
- **Magic numbers to validate:** `0.70`, `25`, `3`, `100`, `720`, peak windows,
  bucket boundaries (8 total — see ADR-0006 Consequences)
- **ADR:** `docs/adr/0006-backup-station-selection.md`

### ADR-0008 — Reliability UI exposure decision

- **Gate:** ADR-0007 shipped + 2-4 weeks of its telemetry
  (`reliability_gated_count`, `reliability_distribution`) plus ADR-0006 events
- **Target:** ~2026-06-22 (3 weeks post ADR-0007 ship) — **overdue.** ADR-0007 shipped
  2026-05-08, so the telemetry window is long open; re-check before planning.
- **Note:** the 0008 slot is reserved for this decision by design — ADR-0009 deliberately
  skipped the number (see `docs/adr/0009-precautionary-extra-stops.md`).
- **Decision:** internal-only vs tier badge vs detail percentage vs warning-only
- **Pre-condition:** ADR-0007 telemetry shows whether ranking change actually
  moves user behavior

### Phase 3b popularity calibration

- **Gate:** 4 weeks of `StationStatusObservation` data (per spec)
- **Target:** ~2026-06-02 — **overdue.** Check the observation counts before assuming
  verdicts are still cold.
- **Status:** UI shipped (`StopPopularity.tsx`), API integrated
  (`queryStationPopularity`); verdicts currently "insufficient-data"
  for most stations until data accumulates
- **Spec:** `docs/specs/2026-05-03-phase-3b-popularity-prediction-design.md`

## Scope-deferred (waiting on PM decision, not data)

_None._

## Completed

### ~~ADR-0010 — OpenAI gpt-5 as primary eVi LLM~~ ✓ (2026-05-26)

- **Shipped:** OpenAI gpt-5 replaces Xiaomi MiMo Flash at the head of the provider
  chain; MiniMax M2.7 stays as fallback. `XIAOMI_MIMO_API_KEY` retired,
  `OPENAI_API_KEY` required. Telemetry now reports `provider=openai` on success.
- **ADR:** `docs/adr/0010-openai-primary-llm-provider.md` (ADR-0002 not superseded — cite the pair)

### ~~ADR-0009 — Precautionary extra Stops~~ ✓ (2026-05-31)

- **Shipped:** up to 2 precautionary top-up Stops injected between required Stops when a
  leg's Backup Pressure Score clears a Safety-Factor-tiered threshold (5 / 4 / 3); map pins,
  one-tap dismissal with persistence, and rollout telemetry.
- **Flag:** `PRECAUTIONARY_STOPS_ENABLED`, default off — code is on `main`, the feature is
  still dark in production. See `docs/operations/precautionary-stops-rollout.md`.
- **ADR:** `docs/adr/0009-precautionary-extra-stops.md` (revisits ADR-0006's rejection)
- **CONTEXT.md:** Precautionary Stop term

### ~~ADR-0007 — Station reliability ranking~~ ✓ (2026-05-08)

- **Shipped:** `StationReliability` schema, nightly `/api/cron/aggregate-reliability` job,
  and the reliability multiplier in `scoreStation`
  (`src/lib/routing/station-ranker.ts:98-100`, commit `9c03246`), gated at 100 observations.
- **ADR:** `docs/adr/0007-station-reliability-ranking.md`

### ~~ADR-0006 — Backup Station Selection~~ ✓ (2026-05-08)

- **Shipped:** Dynamic 0–3 alternatives per stop driven by 5-signal
  Backup Pressure Score; 12-min detour-time budget filter; N=0 banner;
  alternative markers on map with click-to-popup; locale parity (vi/en);
  4 telemetry events for calibration window.
- **ADR:** `docs/adr/0006-backup-station-selection.md`
- **CONTEXT.md:** Alternative Station, Backup Pressure Score, Reliability terms

### ~~eVi "Show on Map" — Station Card → Map Marker Highlight~~ ✓ (v0.5.0)
- **Shipped:** Smart Map Markers + eVi Bridge. Station cards in eVi chat have "Show on Map" button that highlights the station on the map with fly-to + pulse animation. Implemented via lightweight `src/lib/events/station-events.ts` event emitter.
- **Design doc:** original session-local design file `edwardpham-main-design-20260322-212855.md` was not committed to the repo; the canonical reference today is the implementation itself plus the smart-marker tests in `src/lib/geo/smart-marker.test.ts`.
