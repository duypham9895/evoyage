# Phase 3b — Station Popularity Prediction (UI + API)

**Status**: Drafted 2026-05-03 — implementation gated on ≥4 weeks of accumulated `StationStatusObservation` data (~end of May 2026)
**Owner**: Duy Phạm (PM) · Implementation: Claude Code
**Phase context**: Companion to Phase 3a (data collection foundation, shipped 2026-05-03 in `2026-05-03-station-status-data-collection-design.md`). This spec covers the user-facing half: how the heatmap built nightly by `aggregate-popularity` becomes a "trạm này thường đông giờ này" callout in the trip overview.

**Project framing**: Per `feedback_no_mvp_serious_features.md` and `feedback_zero_infra_cost.md` — build properly, free-tier only. The popularity prediction is **honest about uncertainty**: we say "thường đông" (typically busy) not "sẽ đông" (will be busy), because the heatmap is descriptive statistics, not real-time prediction.

## 1. Problem

Phase 3a is silently aggregating ~9000 status observations/day into a 168-cell-per-station heatmap. Phase 4 surfaced amenities — but a driver still doesn't know whether arriving at Trạm Bảo Lộc on Friday at 5 PM means a 5-min wait or a 45-min wait. Without that signal, the trust gap from Phase 1's "summary trip in here ... doesn't have any meaning" complaint reopens at the stop level.

## 2. Goal

When a driver views a trip plan with charging stops, each stop card surfaces a **predicted busy probability** for the user's expected arrival hour, anchored to:

- Day-of-week and hour (matched against the 168-cell heatmap)
- Holiday boost (Tết, 30/4, 2/9 — reusing `vietnam-holidays.ts` from Phase 2)
- Sample-count confidence (low-data cells get a "chưa đủ dữ liệu" honest fallback)

When the predicted probability is high (e.g. > 60%), the trust intelligence layer surfaces:

- The probability copy: "Trạm này thường đông Thứ 6 5 giờ chiều — thử trạm khác?"
- A reservation deep-link to V-GREEN's web app for that station
- A nudge to the existing alternatives chooser (Phase 1 §7c) if available

## 3. Components

### 3a. Prediction query API (`src/lib/station/popularity-query.ts`)
Pure function consumed by the route handler:

```ts
queryStationPopularity({
  prisma,
  stationId,
  arrivalAtIso,
}): Promise<PopularityVerdict | null>
```

Behavior:
1. Compute `(dayOfWeek, hour)` from arrival time in `Asia/Ho_Chi_Minh`
2. Look up the matching `StationPopularity` row
3. If sample count < threshold (e.g. 20 — enough for ~3 weeks of weekly observations) → return `{ kind: 'insufficient-data' }`
4. If holiday window applies, boost probability by +0.15 (capped at 1.0)
5. Return `{ kind: 'ready', busyProbability, sampleCount, dayOfWeek, hour, isHolidayBoosted }`

### 3b. Trip plan integration (`src/app/api/route/route.ts`)
After building each `chargingStop`, attach a `popularity?: PopularityVerdict` field. ETA on the stop drives `arrivalAtIso` for the lookup. Defaults to "now + driveTime" when no `departAt` set; defaults to `departAt + driveTime` when set.

This is additive — `popularity` is optional; UI gracefully omits when absent.

### 3c. UI: stop-card popularity row (`src/components/trip/StopPopularity.tsx`)
Renders inside the existing stop card detail pane (between StationDetailExpander and StationAmenities). Three visual states:

- `insufficient-data` (default for new stations): muted "chưa đủ dữ liệu để dự đoán"
- `ready` + `busyProbability ≥ 0.6`: warning chip "Thường đông Thứ 6 17h (X% mẫu)"
- `ready` + `busyProbability < 0.6`: subtle "Thường rảnh Thứ 6 17h"

Each ready state with `busyProbability ≥ 0.6` AND a V-GREEN station shows a reservation deep-link button.

### 3d. Reservation deep-link (`src/lib/station/vinfast-reservation-url.ts`)
Pure URL builder:

```ts
buildVinfastReservationUrl(station: { storeId, stationCode }): string | null
```

Returns the V-GREEN reservation page URL when the station has a `storeId` (VinFast-internal), or `null` for non-VinFast stations. Open in a new tab so the user doesn't lose their trip context.

### 3e. Calibration check script (`scripts/popularity-calibration-report.ts`)
Operator-run before launch (and periodically after) to verify the heatmap matches reality:

- Pick 10 known-busy stations (Bảo Lộc weekend evening, Đà Lạt Tết, etc.)
- Print the busyProbability for known busy hours
- Manual sanity check: if "Friday 5 PM Trạm Bảo Lộc" returns < 0.5, the heatmap or threshold needs tuning

## 4. Data flow

```
User views trip plan with chargingStops
  → For each stop:
      arrivalAt = (departAt ?? now) + cumulativeDriveTimeToStop
      verdict = await queryStationPopularity({ stationId, arrivalAtIso })
      stop.popularity = verdict
  → Response carries enriched chargingStops
  → TripSummary's stop card renders <StopPopularity verdict={...} />
  → Reservation button (if applicable) opens V-GREEN URL in new tab
```

## 5. Decisions log

| Decision | Choice | Why |
|---|---|---|
| Confidence threshold | **20 samples** per cell | ~3 weeks of weekly observations; below this we don't claim a prediction |
| Busy threshold | **0.6 probability** | Anything above means majority of past observations at that cell were BUSY; below is a slim signal |
| Holiday boost | **+0.15** stacked on base probability, capped 1.0 | Reuses Phase 2's `isHoliday` infrastructure; doesn't double-count when station is already historically busy on holidays |
| Source of arrival time | **departAt + cumulativeDriveTime** | Coherent with Phase 2: if user picked Friday 17:00 departure, predict for the actual Friday-evening arrival hour at each stop |
| Reservation surface | **Deep-link only**, not embedded reservation | V-GREEN's reservation flow involves OAuth, payment, slot picking — out of scope for trust-intelligence layer; deep-link punts cleanly |
| Insufficient-data UX | **Honest "chưa đủ dữ liệu"** instead of hiding | Hiding makes the absence ambiguous; explicit fallback teaches the user that we'd tell them if we had data |
| Real-time vs descriptive | **Descriptive (heatmap-only)** | Real-time presence requires continuous polling — already gated by V-GREEN cooperation. Phase 3b is honest about its statistical-not-live nature in the copy |

## 6. Files to create / modify

**Create**:
- `src/lib/station/popularity-query.ts` + tests
- `src/lib/station/vinfast-reservation-url.ts` + tests
- `src/components/trip/StopPopularity.tsx` + tests
- `scripts/popularity-calibration-report.ts`

**Modify**:
- `src/types/index.ts` — extend `ChargingStop` and `ChargingStopWithAlternatives` with optional `popularity?: PopularityVerdict`
- `src/app/api/route/route.ts` — call `queryStationPopularity` per stop after planning
- `src/components/trip/TripSummary.tsx` — render `<StopPopularity />` inside each expanded stop card
- `src/locales/vi.json` + `src/locales/en.json` — popularity copy variants per state, reservation CTA label

## 7. Edge cases

| Case | Handling |
|---|---|
| Station has no `StationPopularity` row at all | `insufficient-data` verdict |
| Sample count < 20 in target cell | `insufficient-data` verdict (not "rảnh"; we genuinely don't know) |
| Arrival time crosses midnight in VN local | Compute against the post-midnight `(dow, hour)` cell, not the departure-day cell |
| Holiday window applies AND base probability already > 0.85 | Cap at 1.0; don't re-boost above |
| Non-VinFast station with high probability | Show callout but no reservation CTA |
| Station's busyProbability is exactly 0.6 boundary | Treat as `ready` busy state (≥ inclusive) |
| User in transit and picks an immediate-now departure | Same flow; arrival hour computed from now + drive |

## 8. Testing strategy

**Unit tests**:
- `popularity-query.test.ts` — fixture seed of `StationPopularity` rows; assert verdict for known cells, insufficient-data for sparse cells, holiday boost path
- `vinfast-reservation-url.test.ts` — URL shape with valid storeId, null for empty, VinFast vs non-VinFast
- `StopPopularity.test.tsx` — three render states, reservation button visibility per condition

**Integration test**:
- End-to-end happy path: seed observations + popularity, build a route, verify each stop carries `popularity`, UI renders the expected callout

**Manual QA**:
- [ ] Bảo Lộc / Đà Lạt / Vincom Mega Mall stops on Friday 17:00 trip — verdict matches operator intuition after calibration script confirms data
- [ ] Reservation deep-link opens correct V-GREEN page in new tab
- [ ] Bilingual: vi / en copy for each verdict variant
- [ ] Mobile portrait 360px — popularity row doesn't overflow

## 9. Out of scope (this phase)

- Real-time presence (requires continuous polling or V-GREEN partnership)
- ML-based forecasting (heuristic + holiday boost is sufficient for v1; can add later if data shows seasonal patterns)
- Per-user prediction ("based on your past trips") — privacy + value tradeoff not validated
- Mid-trip replan suggestions when a stop's predicted busy time changes (would need streaming)
- Embedded reservation (V-GREEN OAuth flow is its own multi-week scope)

## 10. Implementation sequencing (~5 days, when data ready)

1. **Day 1** — Calibration report script + manual data sanity check; tune busy / sample thresholds based on real distribution
2. **Day 2** — `popularity-query.ts` + `vinfast-reservation-url.ts` + tests
3. **Day 3** — Route API integration + ChargingStop type extension
4. **Day 4** — `StopPopularity` UI component + locale keys
5. **Day 5** — Wire into TripSummary + bilingual review + manual QA on golden routes

Implementation start condition: aggregation has run ≥ 4 weeks AND calibration report shows known-busy cells with sample counts ≥ 20.

## 11. Roadmap implications

After Phase 3b ships, the original Trust Intelligence Roadmap (§14 of `2026-05-03-trip-overview-timeline-design.md`) is fully complete. The natural follow-up directions are described in Phase 4 spec §12: trip notebook, multi-driver coordination, VinFast partnership-driven features.
