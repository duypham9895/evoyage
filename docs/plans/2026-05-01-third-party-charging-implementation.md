# Third-Party Charging Diversification — Tier A Implementation Plan

**Author:** Duy Phạm (PM) · drafted by Claude Code
**Date:** 2026-05-01
**Scope:** Tier A only — free, low-risk, public data sources. Tiers B (mobile-app reverse-engineer) and C (competitor aggregator scrape) are explicitly **out of scope** for this plan.
**Companion doc:** [`2026-05-01-third-party-charging-research.md`](./2026-05-01-third-party-charging-research.md)

---

## Goal

Make eVoyage's `ChargingStation` table multi-source in practice, not just in schema. Today the live data is ~100% VinFast. After this plan, non-VinFast stations should be a measurable fraction (target: ≥5% of total stations) sourced from public data only, with zero monthly cost.

## Out of scope

- ❌ Google Places API (paid)
- ❌ EBOOST / CHARGE+ mobile app reverse-engineer (Tier B — legal risk)
- ❌ EVCS.VN aggregator scrape (Tier C — competitor + legal risk)
- ❌ PlugShare commercial license

## In scope (5 tasks)

| # | Task | Effort | Owner |
|---|---|---|---|
| 1 | Schema migration + dedup helper | 0.5 d | Claude Code |
| 2 | EVPower Playwright scrape | 1.5 d | Claude Code |
| 3 | OSM `parseProvider` cleanup | 0.5 d | Claude Code |
| 4 | Crowdsource UX boost | 1 d | Claude Code |
| 5 | Manual seed CSV (one-off) | 0.5 d | Duy + Claude Code |

**Total:** ~4 days engineering.

---

## Task 1 — Schema migration + dedup helper

### Schema changes (`prisma/schema.prisma`)
```prisma
model ChargingStation {
  // ... existing fields
  evpowerId   String?  @unique  // EVPower internal station ID, when available
  dataSource  String   @default("vinfast")
  // values: "vinfast" | "osm" | "ocm" | "evpower" | "manual" | "crowdsourced"

  @@index([dataSource])
}
```

### Dedup helper (`src/lib/stations/dedup.ts`)
- `findExistingStationWithinRadius(lat, lng, radiusMeters = 50)` — haversine query against existing rows
- Source priority for conflict resolution: `vinfast > evpower > manual > osm > ocm > crowdsourced`
- Tests in `src/lib/stations/dedup.test.ts`: same-coord match, 49m match, 51m miss, source-priority resolution

### Verification
- [ ] `npx prisma migrate dev --name add_data_source_and_evpower_id` runs clean
- [ ] `npm test` passes including new dedup tests
- [ ] `npx tsx scripts/verify-counts.ts` shows existing data with `dataSource = "vinfast"`

---

## Task 2 — EVPower scrape

### Source
`https://evpower.vn/en/find-a-charging-station` — public locator with AC/DC + city/district filters. JS-rendered, so Playwright (same approach as `crawl-vinfast-stations.ts`).

### Output script
`scripts/crawl-evpower-stations.ts` — same shape as VinFast crawler:
- Launch Chromium, navigate locator page
- Iterate through Vietnamese provinces (use the dropdown)
- Capture station cards: name, address, lat/lng, charger types, status
- Run dedup (Task 1) before insert
- Save raw JSON to `data/evpower-stations.json` for debugging
- Bulk upsert via Prisma

### Test fixtures
- `scripts/__fixtures__/evpower-locator-sample.html` — captured page snapshot
- `src/lib/parsers/evpower.test.ts` — pure parser tests (no network)

### Run cadence
GitHub Actions cron, weekly (vs. VinFast nightly — EVPower changes slowly).

### Verification
- [ ] Script seeds ≥ 30 distinct EVPower stations on first run
- [ ] All inserted stations have `dataSource = "evpower"` and a unique `evpowerId`
- [ ] No duplicates created when run twice
- [ ] No collision with existing VinFast stations within 50m

---

## Task 3 — OSM `parseProvider` cleanup

### Current behavior (`scripts/seed-osm-stations.ts:52`)
Recognizes only: vinfast, v-green, evercharge, evone, evpower, charge+, evs. Falls back to `'Other'` for everything else, losing operator info.

### Changes
- Extend matcher to recognize: `eboost`, `evn`, `pv power`, `pv oil`, `petrolimex`, `solarev`, `datcharge`, `rabbit evc`, `vuphong`, `autel`, `porsche`, `bmw`, `mercedes`, `audi`, `mitsubishi`, `byd`, `mg`
- Default to **operator string truncated to 50 chars** instead of `'Other'` when no match — preserves the long tail
- Add `dataSource = "osm"` to every insert
- Apply dedup helper before insert

### Tests
`scripts/__tests__/seed-osm-parser.test.ts` — unit-test `parseProvider` with each new string.

### Verification
- [ ] Re-run script; provider distribution shows ≥ 5 distinct non-VinFast providers
- [ ] No duplicates against existing data (dedup catches OSM nodes that overlap VinFast stations)

---

## Task 4 — Crowdsource UX boost

### What exists today
- `Feedback` model with `STATION_DATA_ERROR` category
- `StationStatusReport` model (WORKING / BROKEN / BUSY) with denormalized `lastVerifiedAt` on station

### What's missing
A clean way for users to **add** a station that's not in our data — currently they can only correct existing ones.

### Changes
- Add new feedback category `MISSING_STATION` with fields: `stationName`, `address`, `latLng`, `provider` (free text), `notes`
- Trip-view affordance: when user is at a coordinate with no nearby station, show "Báo trạm thiếu / Add a missing station here" CTA
- Backend: when 3+ `MISSING_STATION` reports cluster within 50m and agree on name, auto-create a `ChargingStation` row with `dataSource = "crowdsourced"` and a low confidence flag
- Manual review queue: simple admin page listing pending crowdsource entries before promotion

### Verification
- [ ] CTA visible on trip view when no station within 1km of route waypoint
- [ ] Submitting reports creates Feedback rows, not station rows directly
- [ ] Auto-promotion logic tested with a fixture of 3 clustered reports
- [ ] Locale strings added to both `en.json` and `vi.json`

### Decision needed from PM
Auto-promote at 3 reports, or require manual approval for every crowdsourced station? Defaulting to **manual approval first** — flip to auto later once we trust the volume.

---

## Task 5 — Manual seed CSV

### Process
1. Duy collects ~50 known non-VinFast stations from public news, Facebook groups, blog posts (no scraping of EVCS.VN/PlugShare)
2. CSV columns: `name, address, lat, lng, provider, chargerTypes, maxPowerKw, sourceUrl`
3. `scripts/seed-manual-stations.ts` reads CSV, runs dedup, inserts with `dataSource = "manual"`

### Verification
- [ ] CSV committed to `data/manual-stations.csv`
- [ ] Script idempotent (re-runnable safely)
- [ ] Each row has `sourceUrl` for accountability

---

## Risk & rollback

- **Risk:** EVPower changes their locator HTML and the scraper breaks silently.
  - **Mitigation:** GH Actions job alerts on Slack/email if station count drops by >20% week over week.
- **Risk:** Dedup logic incorrectly merges two distinct stations within 50m of each other (e.g. dual-side highway charging).
  - **Mitigation:** Dedup matches on coordinates **and** name similarity (Levenshtein ≤ 5 or substring). When in doubt, insert as separate.
- **Rollback:** Each new source is gated by `dataSource` field. To remove a source, delete rows `WHERE dataSource = 'evpower'`. No code rollback needed.

---

## Acceptance criteria (whole plan)

- [ ] `ChargingStation` count includes ≥ 5% non-VinFast (`isVinFastOnly = false` and `dataSource != 'vinfast'`)
- [ ] At least 4 distinct provider names beyond VinFast/V-Green appear in the DB
- [ ] No regression in VinFast station count or detail-API freshness
- [ ] All new code paths covered by tests; `npm test` passes
- [ ] `npx next build` succeeds
- [ ] Locale keys synced between en.json and vi.json
- [ ] No new external monthly costs

---

## Sequence (proposed)

Day 1 → Task 1 (schema + dedup helper + tests)
Day 2 → Task 2 part 1 (EVPower scraper, parser tests)
Day 3 → Task 2 part 2 + Task 3 (EVPower seed + OSM cleanup)
Day 4 → Task 4 (crowdsource UX) + Task 5 (manual CSV)

I'll commit after each task completes and tests pass — atomic commits per the project's commit style.
