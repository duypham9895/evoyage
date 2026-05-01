# Fuel Price Integration — Phase 1 Research

**Date:** 2026-05-01
**Status:** Phase 1 — source research only. **No implementation yet.**
**Author:** Claude (research) + Duy (PM)

---

## Question to settle before implementing

eVoyage is positioned as an **EV charging app** (VinFast stations, EV trip planning). A panel showing gasoline + diesel costs to an EV driver only makes sense if the framing is right. Three options:

| # | Framing | Headline of the panel |
|---|---|---|
| **A** | EV-savings comparison | "If gas car: ₫150k. If EV: ₫45k. **You save ₫105k.**" |
| **B** | Multi-modal (user's vehicle determines display) | Whichever fuel matches the selected vehicle |
| **C** | Generic fuel-cost calculator (literal reading of spec) | Both gas + diesel cost on every route, no EV comparison |

**Recommendation:** **A** — turn the feature into an EV-savings story. It reinforces the product's reason to exist instead of softening it. The same crawl + math powers it; only the UI framing changes. If Duy meant **A** all along and the spec was just descriptive, no scope change needed. If Duy meant **C**, this needs a product conversation before code.

→ **Decision needed from Duy before Phase 2.**

---

## Source candidates

### Primary recommendation: Petrolimex + MOIT (paired)

| Source | Role in feature | Why |
|---|---|---|
| **Petrolimex** (`petrolimex.com.vn`) | Numeric source — actual retail prices we display | State-owned, ~50% of VN retail market share, single-source-of-truth that other distributors track within ±50 đ/L. Updates the moment regulator allows. Two pricing zones (Vùng 1 / Vùng 2) baked in. |
| **Bộ Công Thương / MOIT** (`moit.gov.vn`) | Citation/attribution source shown in UI | The regulator. Co-issues every price-management announcement with the Ministry of Finance. Most "authoritative" for legal weight, but doesn't publish actual retail numbers — only adjustment direction + caps. |

**UI attribution copy (example):** *"Giá tham khảo từ Petrolimex (Vùng 1), điều hành theo công bố Bộ Công Thương."* / *"Reference price from Petrolimex (Zone 1), per Ministry of Industry and Trade pricing decisions."*

### Other sources considered, rejected

| Source | Why rejected |
|---|---|
| **PVOIL** (`pvoil.com.vn`) | #2 distributor, prices track Petrolimex. No advantage over the leader. WebFetch was 403-blocked, suggesting bot-protection. |
| **GlobalPetrolPrices.com** | Third-party aggregator, weekly snapshot, not authoritative for VN market — would weaken the trust story. |
| **VnExpress / Thanh Niên / Báo Mới** | News outlets reporting on price changes — secondary, not primary source. |

---

## Data freshness

- Vietnamese fuel prices are adjusted on a **fixed cadence: every Thursday at 15:00 ICT** (per Decree 80/2023/NĐ-CP, in effect through 2026), reflecting the prior week's world oil price.
- Adjustments can be skipped (price held) or accelerated during volatile periods. April 2026 saw three adjustments (2nd, 9th, 16th, 23rd, 29th — i.e. weekly).
- **Practical consequence:** crawl daily for safety margin, but expect changes only ~once/week. A weekly cron is enough; daily is harmless and matches how we already crawl VinFast stations.
- Must store both the **price** and the **effective date/time** so the UI can show "updated 2 days ago".

---

## Data access — how to fetch Petrolimex prices

Investigated four routes; ranking by reliability:

| Route | How | Verdict |
|---|---|---|
| **1. Press-release page scrape** | Each adjustment publishes at predictable URL `petrolimex.com.vn/ndi/thong-cao-bao-chi/petrolimex-dieu-chinh-gia-xang-dau-tu-{HH-MM}-phut-ngay-{D-M-YYYY}.html`. Static HTML, server-rendered, contains the new price table. | **Recommended.** Most stable to changes, no auth needed, page is a self-contained snapshot per adjustment. Crawler logic: list latest press releases on `/ndi/thong-cao-bao-chi.html`, find newest adjustment URL, parse table, store. |
| **2. Homepage table scrape via headless browser** | Render `petrolimex.com.vn` (or `hanoi.petrolimex.com.vn`) with Playwright/Puppeteer; the price table populates after JS load. | Works, but heavy (full browser per crawl) and we already have Playwright as a dependency for E2E. |
| **3. Internal CMS API** | The page calls `__vieapps.apis.fetch("portals", "cms.item", "search", ...)` against the VIEApps NGX backend with `SystemID`/`RepositoryID`/`RepositoryEntityID` filters. | Tried direct GET/POST with the encoded `x-request` header — got 405 (POST) and 404 (GET). The wrapper likely uses websockets (`wss://portals.petrolimex.com.vn` is preconnected). Reverse-engineerable but **brittle and undocumented** — single backend change breaks us. |
| **4. RSS / public API** | Searched: none exists. | N/A |

→ **Implementation plan: route #1 (press-release scrape)** with route #2 as a fallback if the press-release format changes.

### MOIT scrape

Press-release URL pattern: `moit.gov.vn/tin-tuc/thong-tin-ve-viec-dieu-hanh-gia-xang-dau-ngay-{D-M-YYYY}.html`. Used **only** for citing the regulator decision date — not for the numeric prices. We don't need to crawl this; we just attribute the source in the UI.

---

## Open-question answers

### Q1. Default fuel consumption per vehicle type

Honest take: this is a wide range. Vietnam-typical numbers from manufacturer specs:

| Vehicle type | Gasoline (L/100km) | Diesel (L/100km) |
|---|---|---|
| Compact sedan (City, Vios, Accent) | 6–7 | — |
| Midsize sedan / crossover (Camry, CR-V, Tucson) | 8–9 | 7–8 |
| Pickup / large SUV (Ranger, Everest) | 10–12 | 8–10 |
| Motorbike (the actual majority of VN vehicles) | 1.5–2.5 | — |

**Recommended single default for the panel:**
- Gasoline: **7.5 L/100km** (typical sedan)
- Diesel: **7.5 L/100km** (typical mid-size diesel SUV)
- Show as "≈" with a small "edit vehicle" affordance.

Motorbikes are excluded because eVoyage's route planner is built around 4-wheel EV journeys, and a motorbike's fuel cost on a 200km trip is a rounding error.

### Q2. Should users override the default?

Yes — but **progressive disclosure**. Don't put the input in the main flow. Pattern: panel shows generic estimate by default, with a small "Use my vehicle's mileage" link that reveals an inline input. Persist per-user in localStorage. Don't gate the panel behind a setup step.

### Q3. Display unit

Lead with **VND total**. Liters is interesting but secondary — most users feel money, not volume.

```
Cost panel layout (recommendation):

  ≈ ₫157,500              ← headline
  117 km · 7.5 L/100km    ← context (small)
  Petrolimex Vùng 1       ← attribution (smaller)
```

If framing **A** is chosen, swap headline for:
```
  EV: ₫45,000 · You save ₫112,500 vs gasoline
```

---

## What ships in Phase 2 (preview, not committed)

1. Daily GitHub Actions cron that hits Petrolimex's latest press-release page, parses prices, writes JSON to `src/data/fuel-prices.json` (same pattern as `scripts/crawl-vinfast-stations.ts`)
2. Type definition + read helper in `src/lib/fuel-price.ts`
3. Cost-estimation helper that takes `(distanceKm, fuelType, lPer100km?)` → `{ vnd, liters }`
4. `<TripCostPanel>` component, only rendered after a route is computed
5. Locale strings (en + vi) for the panel labels and attribution
6. Unit tests for the parser, the cost helper, and the component

**Not in Phase 2:** user vehicle profile, history, Apple/Google Pay-style "expense" log. Add only if asked.

---

## Risks / what could break

- **Petrolimex changes the press-release URL format** → fallback to homepage headless render (route #2)
- **Server-side rendering disabled, full SPA migration** → fallback to route #2 unconditionally
- **Vietnam reforms the price-adjustment cadence** (the Decree 80 framework expires) → crawl frequency stays daily, no logic change needed
- **Two pricing zones (Vùng 1 = lowland, Vùng 2 = remote/mountain, ~+200–300 đ/L)** → MVP uses Zone 1 only. Add a region toggle later only if route-along data suggests passing through Zone 2 districts.
