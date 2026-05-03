# Third-Party EV Charging Station Diversification — Research

**Author:** Duy Phạm (PM) · drafted by Claude Code
**Date:** 2026-05-01
**Status:** Research only — no implementation. Decision needed before planning.

---

## TL;DR

eVoyage's `ChargingStation` table is, in practice, **VinFast-only**. The codebase already wires up two secondary feeds (Open Charge Map and OpenStreetMap Overpass), but **OCM returns only 6 stations for all of Vietnam with null operator data**, and OSM coverage is community-tagged and uneven. Meanwhile the Vietnam EV market now has at least 10+ named non-VinFast operators with material installed bases (EBOOST alone has ~1,900 ports / 220 locations as of March 2025).

There is **no free, well-populated aggregator for Vietnam**. Every path forward has tradeoffs:

| Path | Coverage | Cost | Effort | Risk |
|------|----------|------|--------|------|
| A. Per-operator scrapers (EBOOST, EVPower, etc.) | High per network, manual to add | Free | High (4–8 networks × playwright) | ToS, breakage on UI changes |
| B. Google Places API (New) — `ev_charging_station` type | Broad, includes real-time availability | ~$32 / 1k requests, cacheable | Low (1 integration) | Vendor lock; cost scales with coverage radius |
| C. EVCS.VN aggregator app (com.evcs.vn) | Highest single source — already aggregates 12+ networks | Free | Medium (reverse-engineer mobile API) | High ToS / legal risk |
| D. Manual seed + crowdsourced corrections | Slow but sticky | Free | Low to start, high to maintain | Data freshness |

**Recommended path:** **B (Google Places) + A (EBOOST + EVPower direct scrape) + D (crowdsourced report flow we already have)**, in that order. Skip C — the legal exposure is not worth the saving for a fintech-adjacent product.

---

## 1. Current State Audit

### 1.1 What we already have

```
scripts/crawl-vinfast-stations.ts     ← primary, ~16k stations (incl. scooter swap), Playwright + finaldivision API
scripts/fetch-universal-stations.ts   ← Open Charge Map, runs but returns 6 stations for VN, all null operator
scripts/seed-osm-stations.ts          ← OpenStreetMap Overpass, community-tagged (uneven)
```

`prisma/schema.prisma` `ChargingStation` model:
- `provider: String` — free-form (VinFast, EverCharge, EVONE, EVPower, CHARGE+, EVS, Other)
- `isVinFastOnly: Boolean` — already supports the multi-provider concept
- `ocmId: String? @unique` — only one external ID slot

`src/app/api/stations/route.ts:30` — `ALLOWED_PROVIDERS = {VinFast, EverCharge, EVONE, EVPower, CHARGE+, Other}`. The UI is already designed around multi-provider filtering — it's just unfed.

### 1.2 Verified data balance

Running an OCM fetch against `api.openchargemap.io/v3/poi/?countrycode=VN&maxresults=5000` returns **6 stations**, all with `OperatorInfo.Title = null`. So in practice OCM contributes nothing meaningful for Vietnam.

OSM Overpass typically returns ~few hundred Vietnam EV nodes; tagging quality is highly inconsistent (operator missing on most, power output guessed via `parseMaxPower` default of 22 kW).

**Conclusion:** the user's instinct is correct — the live UI shows VinFast and a thin tail.

---

## 2. The Vietnamese EV Charging Operator Landscape (May 2026)

Sized roughly by published port/station counts where available. Numbers should be treated as PR estimates, not audited.

### Tier 1 — Dominant
| Operator | Network type | Approx scale | Notes |
|---|---|---|---|
| **VinFast / V-Green** | Closed (VinFast) → Public (V-Green) | ~150,000+ ports announced; 99 ultra-fast hubs planned 2026 | Already integrated. V-Green is the spinoff opening to all brands. |

### Tier 2 — Material public networks (worth integrating)
| Operator | Approx scale | Public locator? | Best data path |
|---|---|---|---|
| **EBOOST** (eboost.vn) | ~1,900 ports / ~220 locations | App only — no website locator | Mobile API reverse-engineer or partnership |
| **EVPower** (evpower.vn) | Tens to low hundreds | Yes — `/en/find-a-charging-station` (JS-rendered) | Playwright scrape (similar to VinFast pattern) |
| **CHARGE+** (chargeplus.com/vn) | 17 DC stations on a 1,700km Porsche corridor; 5,000 points by 2030 plan | App only | Partner inquiry; or scrape app |
| **EverEV** (everev.vn) | Franchise model — count opaque | None | Contact only |
| **EV One** | Servicing BYD/MG drivers | Partial — through VinFast app | Through aggregator |

### Tier 3 — Emerging / state-backed
| Operator | Stage | Notes |
|---|---|---|
| **PV Power** (Petrovietnam) | First station Oct 2024; goal 1,000 by 2035 | Korean partner, mostly DC fast |
| **PV Oil + VinFast MoU** | 500 Petrolimex stations target | Partnership stations show up under VinFast's feed already |
| **DatCharge, Rabbit EVC, VuPhong Energy, SolarEV, Autel** | Smaller operators | Listed by EVCS.VN aggregator |
| **THACO / BMW** | Network being co-developed | Likely dealer-anchored |
| **Porsche Destination Charging** | Hanoi + HCMC, Taycan-grade DC | Small but high-relevance for premium users |
| **Mitsubishi, Audi dealer chargers** | Few each | Destination only |

### Tier 4 — Indirect aggregators
| Source | What it has | Trade-off |
|---|---|---|
| **EVCS.VN / Trạm Sạc EV** (com.evcs.vn) | Aggregates VinFast, V-Green, EBOOST, EV One, EverCharge, EVN, DatCharge, Rabbit EVC, VuPhong, SolarEV, Autel, PV Power. ~97k users. | Likely scraping these networks already. Reverse-engineering their API is the highest-coverage shortcut, but violates their ToS. |
| **PlugShare** | Global, has VN data via crowd | Commercial license only; quoted for "EV industry players" |
| **Open Charge Map** | Already wired in | 6 VN stations, null operators — effectively empty |
| **OpenStreetMap** | Already wired in | Hundreds, uneven quality, no real-time |
| **Google Places API (New)** | `ev_charging_station` type with real-time availability fields | $32/1000 Nearby Search calls; covers what Google has indexed (broad in cities, sparse rural) |

---

## 3. Source Feasibility Matrix

### Legend
- **Cost:** monthly, assuming 100k station views / month and 90% cache hit.
- **Effort:** engineering days for a competent Claude Code session.
- **Freshness:** how often data can practically refresh.

| Source | Coverage VN | Cost / mo | Effort | Freshness | ToS risk | Schema fit |
|---|---|---|---|---|---|---|
| **Google Places API (New)** | High (urban), Medium (rural) | ~$30–80 with caching | 1–2 d | Real-time per query | None — vendor-supported | Need new external ID field |
| **EBOOST app API (RE)** | High | $0 | 3–5 d, ongoing | Hourly | High — app ToS prohibits | Need `eboostId` |
| **EVPower locator scrape** | Medium | $0 | 1–2 d | Daily | Medium | Need `evpowerId` or coord dedup |
| **CHARGE+ partner feed** | Low–Medium | $0 if granted | 5+ d incl. negotiation | Per partner cadence | None if formal | Need `chargeplusId` |
| **EVCS.VN aggregator (RE)** | Highest | $0 | 5–10 d | Hourly | **High** — clear ToS violation, possible IP claim by EVCS.VN themselves | One ID column for all |
| **PlugShare DataTool** | Medium | $$$$ (quote-based, not retail) | 2–3 d after license | Weekly | None | Standard |
| **OSM Overpass** | Medium-low | $0 | already done | On OSM update cadence | None — ODbL attribution | already used |
| **Open Charge Map** | Useless for VN | $0 | already done | OCM cadence | None | already used |
| **Manual seed (one-off)** | Per province | $0 | 0.5 d / 50 stations | Stale fast | None | already used |
| **Crowdsourced corrections** | Already partly built (`StationStatusReport`, `Feedback`) | $0 | 1 d to extend | Real-time | None | extend `Feedback` `STATION_DATA_ERROR` |

---

## 4. Recommendation — Phased Rollout

Rather than picking one path, layer them by cost and risk:

### Phase 1 — Free and safe (1–2 weeks)
1. **Activate EVPower scrape.** Playwright-based, similar pattern to `crawl-vinfast-stations.ts`. Adds a known third-party network with a public locator. Run on the same GitHub Actions cron.
2. **Improve OSM ingest.** Switch `seed-osm-stations.ts` to filter by `tags.operator` properly, and add Vietnamese operator strings (EBOOST, V-Green, EVPower, EVN, EV One) to the matcher in `parseProvider`. Most VN OSM nodes have these tags; we just don't read them all.
3. **Surface "Report a station we're missing"** more prominently (already exists in `Feedback` `STATION_DATA_ERROR`). Ad-hoc human-in-the-loop is the only way to reach the long tail of mall and hotel chargers.

**Expected lift:** maybe 200–500 new stations, all non-VinFast, primarily in Hanoi/HCMC.

### Phase 2 — Paid commercial (3–4 weeks)
4. **Integrate Google Places API (New).** Use `ev_charging_station` Nearby Search around the user's current trip waypoints, not as a global crawl. Cache responses 24 h. Add `googlePlaceId` to schema.
   - **Cost guard:** restrict to actual user search radii (the trip view), not background fill. With caching this should stay under $50/mo at current traffic.
   - **Schema change:** add `googlePlaceId String? @unique` and `dataSource String` ("vinfast" | "osm" | "ocm" | "google" | "evpower" | "manual").

**Expected lift:** broad city coverage, including hotel/mall chargers Google has indexed, with real-time `currentOpeningHours`.

### Phase 3 — Operator partnerships (ongoing)
5. **Open formal data conversations with EBOOST, CHARGE+, V-Green.** They benefit from being discoverable in a third-party trip planner. This is PM work, not engineering — frame eVoyage as drove-traffic-to-them. Goal: a JSON feed URL or CSV drop, even if monthly.

### What we are explicitly NOT doing
- ❌ **Not reverse-engineering EVCS.VN's API.** They are themselves an aggregator, possibly scraping the same operators. Pulling their data is two layers of legal exposure (their ToS + the underlying operators' ToS) for a product that wants to grow into fintech-adjacent partnerships.
- ❌ **Not paying for PlugShare.** Their pricing model targets large EV players; quote will likely exceed Google Places + scraping combined for VN-only coverage.

---

## 5. Schema & Code Implications

### Schema additions needed (Phase 2)
```prisma
model ChargingStation {
  // ... existing fields
  googlePlaceId   String?   @unique
  evpowerId       String?   @unique  // if Phase 1 EVPower scrape lands first
  dataSource      String    @default("vinfast")  // "vinfast" | "osm" | "ocm" | "google" | "evpower" | "manual"
  // ...
  @@index([dataSource])
}
```

### Dedup strategy
Each source has its own ID space, so we need a coordinate-based dedup pass:
- For each candidate from a non-VinFast source, search existing stations within **50m haversine radius**.
- If a match exists, prefer the higher-quality source (rule of thumb: VinFast > Google > EVPower > OSM > OCM).
- Otherwise insert as new with the source's ID.

### API surface
`src/app/api/stations/route.ts:30` — extend `ALLOWED_PROVIDERS` set as new providers come in. Confirm the UI filter chips can scale to 7–8 providers without crowding.

---

## 6. Open Questions for Duy

1. **Budget tolerance.** Is $30–80/mo on Google Places acceptable, or do we want to stay strictly free? The "free" path means slower coverage growth and more scraping maintenance.
2. **Aggregator question.** Confirm "no" on EVCS.VN reverse-engineer — agreed legal risk is too high?
3. **Phase order.** Phase 1 (EVPower scrape + OSM cleanup) is a cheap two-week win. Should we ship that before deciding on Phase 2 budget? My recommendation: yes — measure the lift, then decide on Google Places.
4. **Real-time availability.** Google Places provides `currentOpeningHours` and some availability fields, but not socket-level "is this plug free." Are we okay with same level we have today (charging_status from VinFast feed only) for non-VinFast networks?
5. **Display treatment.** When a station has `dataSource = "google"` we likely should show "Source: Google Maps" attribution. Acceptable?

---

## 7. Verification Plan

If we proceed to Phase 1:
- [ ] EVPower scrape runs nightly on GH Actions and seeds at least 50 distinct EVPower stations.
- [ ] OSM rerun yields ≥ 10× more distinct providers than today (currently 1).
- [ ] No regression in VinFast station count or detail availability.
- [ ] `npm test` still green; new tests for `parseProvider` covering EBOOST, EVPower, V-Green, EVN strings.

If Phase 2:
- [ ] Google Places integration only fires from authenticated trip-view requests (no background polling).
- [ ] Cache hit rate ≥ 80% over a week.
- [ ] Cost dashboard shows daily Google Places spend < $3.
- [ ] Stations from Google show provenance badge in the station detail card.

---

## Sources

- [EBOOST charging station network (eboost.vn)](https://eboost.vn/en/)
- [EBOOST receives foreign funding (VietnamPlus)](https://en.vietnamplus.vn/ev-charging-operator-eboost-receives-foreign-funding-post248833.vnp)
- [EVPower Vietnam find-a-station](https://evpower.vn/en/find-a-charging-station)
- [CHARGE+ Vietnam](https://www.chargeplus.com/vn)
- [Charge+ × Grab Vietnam partnership (VIR)](https://vir.com.vn/charge-grab-partner-to-develop-ev-charging-network-in-vietnam-143011.html)
- [EverEV (everev.vn)](https://everev.vn/en/about-us)
- [Trạm Sạc EV — EVCS.VN (Google Play)](https://play.google.com/store/apps/details?id=com.evcs.vn)
- [PV Power 1,000 EV stations by 2035 (The Investor)](https://theinvestor.vn/petrovietnam-power-unit-aims-to-develop-1000-ev-charging-stations-by-2035-d12183.html)
- [VinFast × Petrolimex 500 station plan (VietnamPlus)](https://en.vietnamplus.vn/vinfast-petrolimex-open-e-vehicle-charging-stations-post240091.vnp)
- [V-Green 99 fast-charging stations 2026 (electrive)](https://www.electrive.com/2026/03/20/v-green-to-build-99-fast-charging-stations-in-vietnam/)
- [Vietnam EV charging market overview (Trade.gov)](https://www.trade.gov/market-intelligence/vietnam-electric-vehicle-infrastructure)
- [Local landowners drive VN charging expansion (Rest of World)](https://restofworld.org/2024/vietnam-ev-charging-network-expansion-landowners/)
- [Google Places API (New) EV charging announcement](https://mapsplatform.google.com/resources/blog/introducing-the-new-places-api-with-access-to-new-ev-accessibility-features-and-more/)
- [PlugShare DataTool (commercial)](https://company.plugshare.com/data.html)
- [Open Charge Map API](https://api.openchargemap.io/v3/poi/)
