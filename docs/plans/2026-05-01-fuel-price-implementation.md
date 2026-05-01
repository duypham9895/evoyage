# Fuel & Energy Price Integration — Phase 2 Implementation Plan

**Date:** 2026-05-01
**Status:** Plan — awaiting Duy's review before any code change
**Depends on:** [2026-05-01-fuel-price-research.md](./2026-05-01-fuel-price-research.md)

---

## Goal

After this ships, an eVoyage user can:
1. See **today's unit prices** for gasoline, diesel, home electricity, and V-GREEN charging — on the homepage and the README, auto-updated daily.
2. After planning a route, see **estimated cost of that specific trip** for gasoline, diesel, and electric (their VinFast model + free V-GREEN through 2029) — scaled to the actual route distance.

## Non-goals (explicit)

- No comparison block with named ICE cars on the homepage — moved to trip view only ([memory: feedback_homepage_no_conversion_pitch](../../../memory/feedback_homepage_no_conversion_pitch.md))
- No "you save X" persuasion language — display three numbers, let the customer decide
- No EBoost / EVOne / CHARGE+ / EVPower data in v1 — those networks gate prices behind apps, not scrapable
- No user mileage input — fixed defaults (8 L gas, 7 L diesel)
- No multi-region (Vùng 2) UI — Zone 1 prices only for v1
- No fuel cost history / trends — "today's price" is enough
- No charging-station-specific cost (V-GREEN-by-station) — one network rate is enough

## Crawl cadence — explicit

**All three sources are fetched every run, every day at 03:00 UTC** — no source-specific skipping. Even though Petrolimex actually adjusts weekly (Thursdays), V-GREEN yearly, and EVN every 6–12 months, the crawler checks all of them daily so:
- We never miss an off-cycle adjustment
- The user sees "checked today" even when nothing changed
- The crawler is dumb and predictable — no per-source schedule logic

Two timestamp fields make this transparent:
- `lastSyncedAt` — updated every successful crawl run (proves the data is fresh as of today)
- `effectiveAt` (per source) — only updates when that source's price actually changed

The homepage caption reads: *"Updated 1 May 2026 · Prices effective from 29 Apr 2026"* — so the customer knows we're current AND knows when the price last moved.

## Architecture

```
GitHub Actions cron (daily 03:00 UTC)
        │
        ▼
scripts/crawl-energy-prices.ts ──────┐
        │                            │
        ▼                            ▼
  Petrolimex press release      V-GREEN FAQ page
  EVN tariff page (3 fetches in parallel)
        │
        ▼
src/data/energy-prices.json (committed, single source of truth)
        │
        ├─► src/lib/energy-prices.ts (typed read helper)
        │       │
        │       ├─► HomeEnergyPrices component (homepage hero)
        │       ├─► README auto-update (via scripts/update-readme-stats.ts)
        │       └─► TripCostPanel component (post-route)
        │
        └─► scripts/update-readme-stats.ts (existing pattern)
```

Same pattern as the existing `scripts/crawl-vinfast-stations.ts` + `.github/workflows/crawl-stations.yml` flow that already syncs `src/data/station-stats.json`.

## Data shape — `src/data/energy-prices.json`

```jsonc
{
  "lastSyncedAt": "2026-05-01T03:00:00Z",
  "petrolimex": {
    "source": "https://www.petrolimex.com.vn/.../petrolimex-dieu-chinh-gia-xang-dau-tu-15-gio-00-phut-ngay-29-4-2026.html",
    "effectiveAt": "2026-04-29T15:00:00+07:00",
    "products": {
      "ron95v":   { "vndPerLiter": 24500, "label": "RON 95-V" },
      "ron95iii": { "vndPerLiter": 24300, "label": "RON 95-III" },
      "e5ron92":  { "vndPerLiter": 23700, "label": "E5 RON 92-II" },
      "do005s":   { "vndPerLiter": 25200, "label": "DO 0.05S-V" },
      "do0001s":  { "vndPerLiter": 25500, "label": "DO 0.001S-V" }
    }
  },
  "vgreen": {
    "source": "https://vgreen.net/vi/cau-hoi-thuong-gap",
    "effectiveAt": "2024-03-19T00:00:00+07:00",
    "vndPerKwh": 3858,
    "freeForVinFastUntil": "2029-12-31"
  },
  "evnResidential": {
    "source": "https://www.evn.com.vn/c3/gia-dien/Bieu-gia-ban-le-dien-9-28.aspx",
    "effectiveAt": "2025-05-29T00:00:00+07:00",
    "tiers": [
      { "minKwh":   0, "maxKwh":  100, "vndPerKwh": 1984 },
      { "minKwh": 101, "maxKwh":  200, "vndPerKwh": 2380 },
      { "minKwh": 201, "maxKwh":  300, "vndPerKwh": 2998 },
      { "minKwh": 301, "maxKwh":  700, "vndPerKwh": 3350 },
      { "minKwh": 701, "maxKwh": null, "vndPerKwh": 3967 }
    ],
    "representativeTier": 4,
    "representativeVndPerKwh": 3350
  }
}
```

`representativeTier` exists so the UI doesn't have to decide which tier to show — a typical EV-owning household lands in tier 4 (extra ~150–300 kWh/month from charging).

## Files to create

| File | Purpose |
|---|---|
| `scripts/crawl-energy-prices.ts` | Fetches all three sources, writes the JSON above |
| `scripts/crawl-energy-prices.test.ts` | Parser unit tests (no live HTTP) |
| `src/data/energy-prices.json` | Initial seed (manually populated to today's values, then auto-updated) |
| `src/lib/energy-prices.ts` | Typed read helper + price formatters |
| `src/lib/energy-prices.test.ts` | Helper unit tests |
| `src/lib/trip-cost.ts` | `computeTripCost({ distanceKm, vehicle? }) → { gasoline, diesel, electric }` |
| `src/lib/trip-cost.test.ts` | TDD-first tests, then implement |
| `src/components/landing/HomeEnergyPrices.tsx` | Homepage block (info-only) |
| `src/components/landing/HomeEnergyPrices.test.tsx` | Component test |
| `src/components/trip/TripCostPanel.tsx` | Trip-view block (after route planning) |
| `src/components/trip/TripCostPanel.test.tsx` | Component test |
| `.github/workflows/crawl-energy-prices.yml` | Daily cron — copy of existing crawl-stations.yml |

## Files to modify

| File | Change |
|---|---|
| `src/locales/en.json` | Add labels for energy-prices block, trip-cost panel, source attribution |
| `src/locales/vi.json` | Same keys, Vietnamese copy (Duy reviews wording) |
| `src/components/landing/LandingPageContent.tsx` | Render `<HomeEnergyPrices>` near existing "last sync" caption |
| `src/components/trip/...` (existing route-result component) | Render `<TripCostPanel>` once a route is computed |
| `README.md` | Add "Today's energy prices" section that the updater rewrites |
| `scripts/update-readme-stats.ts` | Extend to also rewrite the energy-prices section |
| `CLAUDE.md` | Bump test counts after the new tests land |

## Build sequence (TDD per project rules)

Each step has a verification check before moving on.

### Step 1 — Crawler parsers (offline-only)
1. Write failing tests for parsing Petrolimex press-release HTML → typed object
2. Write failing tests for parsing V-GREEN FAQ page → typed object
3. Write failing tests for parsing EVN tariff page → typed object
4. Implement parsers; tests pass
**Verify:** `npm test scripts/crawl-energy-prices` green; no HTTP yet

### Step 2 — Crawler script + data file
1. Implement the live-fetch wrapper around the parsers (with timeouts + retry)
2. Run locally: `tsx scripts/crawl-energy-prices.ts` → `src/data/energy-prices.json` populated
3. Commit the seed JSON to the repo
**Verify:** JSON file exists with realistic values, schema matches

### Step 3 — Read helper + cost calculator
1. TDD: tests for `getEnergyPrices()` reader
2. TDD: tests for `computeTripCost({ distanceKm, vehicle })` covering:
   - Distance × generic 8 L/100km × gasoline price
   - Distance × generic 7 L/100km × diesel price
   - Electric: derives kWh/100km from `vehicle.usableBatteryKwh / vehicle.officialRangeKm × 100 × 1.2` (real-world multiplier vs. NEDC); applies free V-GREEN flag if vehicle is VinFast and date < 2029-12-31; otherwise EVN representative tier
   - Edge cases: missing vehicle → default to VF 8; zero distance → all zeros
3. Implement; tests pass
**Verify:** `npm test src/lib/trip-cost` green

### Step 4 — Homepage block
1. Component test: `<HomeEnergyPrices>` renders four rows (gas, diesel, EVN home, V-GREEN), shows last-sync caption, shows source attribution
2. Implement; matches DESIGN.md typography (no decorative icons per CLAUDE.md "Less Icons, More Humanity")
3. Wire into `LandingPageContent.tsx`
**Verify:** local dev server, manual check on mobile (393×852) and desktop (1440×900); visual matches the mock at the top of this doc

### Step 5 — Trip cost panel
1. Component test: `<TripCostPanel>` with mock distance + vehicle renders three cost lines
2. Implement
3. Wire into the existing route-result component
**Verify:** plan a route in dev, panel appears with correct math

### Step 6 — Locale strings
1. Add keys to both `en.json` and `vi.json`
2. The existing `locale-keys.test.ts` automatically catches mismatches
3. Duy reviews Vietnamese copy ("Duy" voice, third-person)

### Step 7 — README + cron
1. Extend `scripts/update-readme-stats.ts` to render an energy-prices markdown block from the JSON
2. Add `.github/workflows/crawl-energy-prices.yml` (daily 03:00 UTC, writes JSON, runs README updater, commits with `[skip ci]`)
3. Trigger workflow manually once to verify
**Verify:** workflow run is green; README diff is what we expect

### Step 8 — Final test sweep + commit
1. `npm test` — all 728+ tests still pass plus the new ones (target ~750)
2. `npx next build` — no TypeScript errors
3. Update CLAUDE.md test count
4. Single feature commit per gstack-style discipline (gstack tooling removed but the discipline stays)

## Math details (for the implementer)

**Gasoline trip cost:**
`distanceKm × 8 / 100 × petrolimex.products.ron95iii.vndPerLiter`

**Diesel trip cost:**
`distanceKm × 7 / 100 × petrolimex.products.do005s.vndPerLiter`

**Electric trip cost — primary line:**
- If vehicle is VinFast AND today < `vgreen.freeForVinFastUntil`: `0` with caption "Free at V-GREEN until 2029"
- Else: `distanceKm × kWhPer100km × evnResidential.representativeVndPerKwh`

Where `kWhPer100km = (vehicle.usableBatteryKwh / vehicle.officialRangeKm × 100) × 1.2`. The 1.2 is the NEDC-to-real-world honesty multiplier; document this clearly in the code comment.

**Electric trip cost — secondary line (always shown when free is the primary):**
"₫{n} if charging at home" using the EVN tier 4 calc above, so the customer sees both numbers.

## Risks & fallbacks

| Risk | Fallback |
|---|---|
| Petrolimex changes press-release URL format | Crawler fails loudly; we don't ship stale prices. Manual fix unblocks within hours. |
| V-GREEN page redesign breaks parser | Same — crawler fails, we update the parser. Last-known value is preserved in the JSON until then. |
| EVN page is JS-rendered for tier prices | Use Playwright (already a project dep) for that one fetch only |
| GitHub Actions cron flakes | Existing pattern; alerts go to repo notifications |
| Free V-GREEN policy ends or changes before 2029 | The flag is data-driven (`freeForVinFastUntil` is in the JSON); change one date, no code change |

## What "done" looks like

- Homepage shows today's four prices, with source attribution and last-sync time
- README has the same block, auto-rewritten daily
- Planning a 117 km route shows three cost numbers, free V-GREEN is correctly identified for VinFast vehicles
- All tests green (target: ~750 total, up from 728)
- Daily workflow runs and commits with `[skip ci]` on no-change days
- Vietnamese + English copy reviewed by Duy

## Open items for Duy before code starts

None — all decisions captured. Awaiting plan review.
