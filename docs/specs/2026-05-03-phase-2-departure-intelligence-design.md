# Phase 2 — Departure Intelligence + Real-Time Traffic

**Status**: Awaiting approval (drafted 2026-05-03)
**Owner**: Duy Phạm (PM) · Implementation: Claude Code
**Phase context**: Phase 2 of the Trust Intelligence Roadmap defined in `2026-05-03-trip-overview-timeline-design.md` §14. Builds on Phase 1's overview headline (which currently shows ETA caveated as "đến lúc HH:MM nếu đi ngay" — Phase 2 makes that ETA actually trustworthy by accounting for traffic).

**Project framing**: Per `feedback_no_mvp_serious_features.md` and `feedback_zero_infra_cost.md` — build properly, free-tier only.

## 1. Problem

Phase 1 surfaces ETA but with a "if leaving now" caveat — honest about uncertainty, not actually predictive. Real Vietnamese drivers care deeply about:

- **Đi giờ cao điểm** — Friday 4 PM HCM → Long Thành adds 60-90 min vs 6 AM
- **Lễ tết / cuối tuần** — long weekends turn 4-hour drives into 8-hour drives
- **Đi sớm hay đi tối** — many users plan around traffic, not just clock time
- **What-if** — "nếu tôi chờ 2 tiếng nữa thì sao?"

Today the app silently assumes free-flow conditions. The user complaint that originated this redesign was about misleading summary information; shipping an ETA without traffic awareness is the same problem at the next layer.

## 2. Goal

By the end of Phase 2, a driver planning HCM → Đà Lạt at 4 PM Friday should see:

- A departure-time picker prefilled to "now"
- A traffic-aware ETA reflecting Friday-evening congestion on the QL1A → QL20 corridor
- A "what-if" panel showing 3 departure options with their ETAs (e.g., now vs +2h vs early tomorrow)
- A clear callout when the chosen departure falls in a known peak window
- Explicit handling of major Vietnamese holidays (Tết, 30/4, 2/9) where patterns differ

All at $0 ongoing infrastructure cost — Mapbox `driving-traffic` profile fits within the free tier (100k routing requests/month, far above current usage).

## 3. Components

### 3a. Departure-time picker (UI)
- New form control on the trip input panel, default "now"
- Pickers: date (today + next 7 days) + time (15-min increments)
- Persists in the URL as `?depart=2026-05-04T08:00` (round-trippable for shared trips)
- Resets to "now" if a saved value is in the past

### 3b. Traffic-aware routing (Mapbox driving-traffic)
- New routing path: when user has chosen a departure time, the route API hits Mapbox `driving-traffic` instead of the current OSRM default
- Departure time is passed as `depart_at` Mapbox query param (Mapbox supports historic + predictive traffic for ≤ 7 days out)
- Falls back to OSRM if Mapbox usage approaches free-tier limits or returns errors

### 3c. Heuristic peak-hour model (`vietnam-traffic.ts`)
- Static rules calibrated for Vietnam:
  - Weekday morning peak: 06:30–09:00 (HCM/HN city bbox crossings → +30%)
  - Weekday evening peak: 16:30–19:30 (worse on Friday → +50%)
  - Weekend "return-to-city" peak: Sunday 16:00–20:00 (heavy inbound on highways)
  - Long weekend cleanup: day-after-holiday morning is congested
- Functions: `isPeakHour(date, polyline) → { multiplier, reason }` and `peakWindowsForRoute(date, polyline)`
- Used as fallback when Mapbox response missing or as a sanity-check overlay on Mapbox numbers

### 3d. What-if comparison (UI)
- Renders 3 departure cards inline in the trip overview when user views a future-departure plan:
  - "Đi ngay" (current selection)
  - "Chờ +2 giờ" (or to next non-peak window if shorter)
  - "Sáng mai 06:30" (or earliest non-peak slot)
- Each card shows: departure time, predicted total time, predicted ETA, peak-hour callout if applicable
- Tap-to-replan on any card

### 3e. Vietnamese holiday awareness (`vietnam-holidays.ts`)
- Static dataset of major VN holidays, generated for 5 years rolling:
  - Tết Nguyên Đán (lunar — algorithmic computation)
  - Giỗ Tổ Hùng Vương (lunar 10/3)
  - 30/4 (Reunification)
  - 1/5 (Labor)
  - 2/9 (National)
- Each entry: name, date, kind (`travel-heavy` | `local` | `bridge-day`)
- The peak-hour model boosts traffic multiplier 1.5× during travel-heavy windows (the day before, the day of, the day after)

## 4. Data flow

```
User picks departure time
  → URL updates with ?depart=...
  → TripInput passes depart to route API
  → Route API:
      1. If depart is "now" or absent → existing OSRM path (no change)
      2. Else → Mapbox driving-traffic with depart_at
      3. If Mapbox fails or quota tight → OSRM + heuristic multiplier
  → Plan response includes traffic metadata: { multiplier, peakWindows, holiday? }
  → TripSummary renders adjusted ETA + what-if cards
```

## 5. Cost analysis (Mapbox free tier)

- Mapbox free tier: 100,000 directions API requests/month
- Current usage estimated < 1,000/month based on traffic patterns of the app
- What-if panel adds 3 routing calls per plan view (one per departure option) — call it 5× current volume
- Projected: still < 5,000/month — well within free tier
- Caching: route + departure tuple cached 30 min in `RouteCache` table to dedupe (already exists for non-traffic OSRM)

If Mapbox usage ever exceeds 50% of free tier, the heuristic-only fallback path keeps the feature alive at zero degradation in coverage (only in accuracy).

## 6. Decisions log

| Decision | Choice | Why |
|---|---|---|
| Real-time traffic source | **Mapbox `driving-traffic` profile** | Already in our routing fallback stack; free tier covers projected usage; supports historical + predictive |
| Departure picker default | **"now"** | 90% of usage is real-time per Phase 1's same call; future-departure is the upgrade |
| What-if option count | **3** | Matches Phase 1's space budget for warnings; more cards become a wall of numbers |
| Holiday computation | **Static 5-year-rolling dataset** | Avoids runtime lunar calculation (fragile + locale-sensitive); regenerate annually |
| Fallback strategy | **OSRM + heuristic** when Mapbox unavailable | Honest UX: degraded accuracy, not a hard failure |
| Caching | **30-min TTL keyed on `(start, end, departISO)`** | Route + departure pair changes hourly enough that 30 min is fresh; 2-tier with existing RouteCache |

## 7. Files to create / modify

**Create**:
- `src/lib/trip/vietnam-holidays.ts` — 5-year holiday dataset + helpers (`isHoliday(date)`, `isHolidayWindow(date, days)`)
- `src/lib/trip/vietnam-holidays.test.ts`
- `src/lib/trip/peak-hour-model.ts` — heuristic functions per §3c
- `src/lib/trip/peak-hour-model.test.ts`
- `src/lib/routing/mapbox-traffic.ts` — wrapper for `driving-traffic` profile with `depart_at`
- `src/lib/routing/mapbox-traffic.test.ts`
- `src/components/trip/DepartureTimePicker.tsx`
- `src/components/trip/DepartureTimePicker.test.tsx`
- `src/components/trip/WhatIfCards.tsx`
- `src/components/trip/WhatIfCards.test.tsx`

**Modify**:
- `src/types/index.ts` — extend `TripPlan` with `trafficMultiplier`, `peakWindows`, `holiday?`, `departureAtIso`
- `src/app/api/route/route.ts` — accept `depart` body field, branch routing engine accordingly
- `src/components/trip/TripInput.tsx` — add `<DepartureTimePicker />`
- `src/components/trip/TripSummary.tsx` — render `<WhatIfCards />` and adjust ETA copy when traffic-aware data present
- `src/locales/vi.json` + `src/locales/en.json` — new keys for picker labels, what-if copy, peak-window callout
- `src/lib/routing/route-cache.ts` — extend cache key to include `departISO`

## 8. Edge cases

| Case | Handling |
|---|---|
| Departure time in the past | Reset to "now" silently, log analytics event |
| Departure > 7 days out | Show warning "Mapbox traffic data only for next 7 days — using heuristic only" |
| Mapbox returns 5xx | Fall back to OSRM + heuristic, badge the ETA as "estimated, not real-time" |
| User picks departure during VN holiday | Boost multiplier 1.5×, callout "Lễ ${name}: dự kiến đông hơn thường" |
| What-if option falls in same peak window as "now" | Show only 2 cards (now + offered alternative) instead of forced 3 |
| Free-tier usage approaching 80% | Telemetry alert; consider deferring what-if cards (1 routing call instead of 4) |

## 9. Testing strategy

**Unit tests (must pass before commit)**:
- `vietnam-holidays.test.ts` — verify Tết 2026, 2027, 2028 dates; 30/4, 2/9 fixed dates; bridge-day flagging
- `peak-hour-model.test.ts` — Friday 17:00 HCM-bbox, Sunday 18:00 highway, weekday 03:00 (no peak)
- `mapbox-traffic.test.ts` — mock fetch, assert `depart_at` passed; assert fallback when 5xx
- `DepartureTimePicker.test.tsx` — picker reset on past time, URL serialize/deserialize
- `WhatIfCards.test.tsx` — 3 vs 2 card rendering rules, tap-to-replan

**Integration tests**:
- End-to-end: pick HCM → Đà Lạt + Friday 16:00 + replan; assert traffic multiplier > 1.0 and a peak-window callout

**Manual QA**:
- [ ] Picker UI fits 360 px portrait
- [ ] Switching departure replans without losing scroll position
- [ ] What-if cards on a real Friday evening trip show realistic deltas
- [ ] Holiday detection on Tết-eve trip surfaces the warning
- [ ] Mapbox quota dashboard shows < 50% utilization after 1 week of real usage

## 10. Out of scope (this phase)

Items below are NOT in this phase. They become candidates for Phase 5+ if user demand surfaces.

- Real-time traffic incident overlays on the route map (would need separate API)
- Carpool/HOV-lane routing
- User-set "must arrive by" reverse-mode (instead of "depart at")
- ML-based personalized peak-hour prediction (the heuristic is sufficient per spec §3c)
- Cross-border routing (HCM → Phnom Penh) — Mapbox supports it but it's a Phase 6+ scope decision

## 11. Implementation sequencing (~2 weeks)

1. **Day 1** — Vietnamese holidays dataset + tests (foundation for §3e)
2. **Day 2** — Peak-hour heuristic model + tests (foundation for §3c, used by fallback)
3. **Day 3** — Mapbox traffic wrapper + tests + route-cache extension
4. **Day 4** — Route API integration: branch on `depart` field, return traffic metadata
5. **Day 5** — DepartureTimePicker UI + URL state sync
6. **Day 6** — TripPlan type extension + TripSummary copy adjustments when traffic data present
7. **Day 7** — WhatIfCards component + tests + integration with TripSummary
8. **Day 8** — End-to-end happy path verification, manual QA on real trips
9. **Day 9** — Locale keys + bilingual review, edge-case handling, performance check
10. **Day 10** — Spec close-out, telemetry hookup, ship.

Each day = 1+ commit, atomic, with green tests before moving on.
