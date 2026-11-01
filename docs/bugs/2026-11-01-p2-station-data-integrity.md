# P2 — VinFast station data integrity (daily crawl)

Audit date: 2026-11-01 · Code reference: `64db6f92e0792aa4643b2ba76958ff0843b80567` (origin/main) · Branch: `bug/p2-station-data-integrity`

## Summary

The daily VinFast crawl (`scripts/crawl-vinfast-stations.ts`) stores bad station data. Every VinFast station is listed as 150 kW with 4 ports. About 108 stations whose addresses are in Hà Nội or Đà Nẵng sit on one placeholder point in HCM District 1. Stations that VinFast removed from its feed are never retired. As a result, drivers see wrong speed filters and charge times, get "0.2 km away" results that are really hundreds of km away, and a few dead or misplaced stations can be picked as route stops.

## Severity & priority

- Priority: **P2**. Severity: **medium** for findings 1 and 2. Finding 3 is **low to medium**: the two verifiers disagreed on its impact (see below).
- Nothing crashes. The app is still usable, but trip estimates and stop choices are less trustworthy.

## Affected features

- Nearby stations: the speed filter (`src/components/NearbyStations.tsx:404`, `s.maxPowerKw >= minSpeed`) and the distance list.
- Route planning: stop candidates and charge-time estimates (`src/app/api/route/route.ts:80`, `:364`, `:380`).
- Map markers, StationCard and TripSummary, which all read `maxPowerKw` straight from the DB.

## Findings

The audit raised four findings. Two of them ("108 out-of-region stations stacked on one District 1 coordinate" and "108 VinFast stations share one placeholder coordinate… appear as 0.2 km away") describe the same defect, so they are merged below as **Finding 2**. No finding was dropped: all of them still hold at `64db6f9`.

---

### Finding 1 — Every crawled VinFast station is hardcoded to 150 kW / 4 ports / CCS2+Type2, and the daily crawl overwrites any enrichment

**Symptom.** The "150+ kW" filter in Nearby matches every VinFast station, including private franchise ("Nhượng Quyền") sites and parking-lot AC sites. Charge-time estimates and route stop choice assume 150 kW DC everywhere. An auditor saw the live HCM to Đà Lạt route pick "Bãi đỗ xe tư nhân Ma Đa Guôi" as a 150 kW stop with a 24-minute charge. Neither verifier re-ran that route.

**Evidence (at `64db6f9`).**
- `scripts/crawl-vinfast-stations.ts:141-144` (`buildStationData`): `chargerTypes: JSON.stringify(['DC_150kW', 'AC_11kW'])`, `connectorTypes: JSON.stringify(['CCS2', 'Type2_AC'])`, `portCount: 4`, `maxPowerKw: 150`.
- `scripts/crawl-vinfast-stations.ts:246-249` (ON CONFLICT clause): `"chargerTypes" = EXCLUDED."chargerTypes"`, and the same for `connectorTypes`, `portCount` and `maxPowerKw`. Those four columns have no COALESCE, while `chargingStatus`, `parkingFee` and the others at `:254-265` do.
- `scripts/enrich-vinfast-detail.ts:265-270` writes real `connectorTypes`, `chargerTypes`, `maxPowerKw` and `portCount`. However, `grep -rn "enrich-vinfast\|crawl-vinfast" .github package.json` finds only `.github/workflows/crawl-stations.yml:52`, which runs the crawl. Nothing schedules the enrichment, and the next crawl would overwrite its output anyway.
- Live data (2026-11-01, both verifiers): `curl -s "https://evoyage.duypham.me/api/stations?bounds=..."` returned 500 rows. All 499 VinFast rows had `maxPowerKw=150`, `portCount=4` and `chargerTypes ["DC_150kW","AC_11kW"]`, and this included " Nhượng Quyền TN Homestay A Sấn Mèo Vạc" and several "Bãi đỗ xe …" sites. One sample row, `vinfast-C.QNI10008`, had `scrapedAt 2026-11-01T10:39:56Z`, so today's crawl had just rewritten the placeholders. The finder also reported per-city counts of 390/390 in HCM and 231/231 in HN; verifiers did not re-count those.

**Root cause.**
- *Established:* the CDN locator feed (`VinfastLocatorRaw`, `src/lib/station/vinfast-api-client.ts:23-51`) has no power, port or connector fields, so `buildStationData` fills in placeholders. The upsert then assigns `EXCLUDED.*` to those columns, so every existing row is reset to the placeholder every day.
- *Established:* `maxPowerKw Float`, `portCount Int`, `chargerTypes String` and `connectorTypes String` are all NOT NULL in `prisma/schema.prisma:85-88`.

**Repro.**
```bash
curl -s "https://evoyage.duypham.me/api/stations?bounds=10.73,106.65,10.82,106.74" > /tmp/st.json
node -e 'const s=require("/tmp/st.json").stations.filter(x=>x.ocmId?.startsWith("vinfast-"));const c={};for(const x of s){const k=x.maxPowerKw+"/"+x.portCount;c[k]=(c[k]||0)+1}console.log(s.length,c)'
# Observed 2026-11-01: every VinFast row is 150/4
```

**Regression tests** (`src/lib/__tests__/crawl-vinfast-stations.test.ts`):
- `crawl-vinfast-stations: charger specs > does not store a fabricated 150 kW / 4-port spec for a station whose feed row has no power data`
- `crawl-vinfast-stations: charger specs > does not overwrite existing maxPowerKw / portCount / chargerTypes / connectorTypes on an existing station`. This test asserts that the ON CONFLICT SQL has no plain `"col" = EXCLUDED."col",` assignment for those four columns. Either COALESCE with the existing value or dropping the column from the UPDATE list satisfies it.

**Fix direction.**
- In the upsert, preserve the existing power, port and connector columns on conflict, the way `chargingStatus` is already preserved (`:254-265`).
- For new rows, store "unknown" instead of 150. The columns are NOT NULL, so this needs either a Prisma migration (make them nullable) or an agreed sentinel such as `0`. Every reader must then handle the unknown value explicitly: the Nearby speed filter, the route ranker and charge-time estimate in `route.ts`, StationCard, TripSummary and marker size. If unknown silently becomes 0 kW, every VinFast station disappears from the "fast" filter, so decide how the UI should present unknown.
- Then schedule `scripts/enrich-vinfast-detail.ts` (or derive the specs from the `VinFastStationDetail` cache). Without that, the data stays unknown rather than wrong.
- Gotcha: the `VinFastStationDetail` mapping rows are pruned daily (see Related items), so "derive from the detail cache" does not work until that is fixed.

---

### Finding 2 — About 108 out-of-region stations share one placeholder coordinate in HCM District 1; 21 are ACTIVE/BUSY and routable

**Symptom.** In central HCM, Nearby and the map show franchise and private stations such as "NQ Tư nhân Bùi thanh bình — Thanh Xuân, Hà Nội" as 0.1-0.3 km away, mixed in with real nearby stations. The route planner can pick the ACTIVE/BUSY ones as stops on routes passing through District 1.

**Evidence (at `64db6f9`).**
- Live (2026-11-01, reproduced by all four verifier runs): `curl -s "https://evoyage.duypham.me/api/stations?bounds=10.7318,106.6550,10.8219,106.7467"` returned 396 rows. 108 of them sit at exactly lat `10.773106`, lng `106.694794`; the next most common coordinate appears 3 times.
  - `chargingStatus` of the 108: UNAVAILABLE 71, ACTIVE 19, INACTIVE 16, BUSY 2.
  - Examples: `vinfast-C.HNO7065` "NQ Tư nhân Bùi thanh bình", "Thanh Xuân, Hà Nội"; `vinfast-C.HNO7134` "Dong Anh, Hanoi"; `vinfast-C.HNO7075` "Hải Châu, Đà Nẵng". None of the 108 addresses mentions Hồ Chí Minh.
  - `province` is 2483 on 105 rows (the code Hà Nội stations use), with one row each of 4354, 3631 and 3267. Real HCM rows in the same response carry 5072.
- The stored `rawData` on these rows shows that the VinFast feed itself sends `"lat":"10.773106","lng":"106.694794","province_id":"2483"`.
- `scripts/crawl-vinfast-stations.ts:131-140`: `buildStationData` copies `parseFloat(s.lat/lng)` and `s.province_id` unchanged.
- `scripts/crawl-vinfast-stations.ts:292-297`: the only coordinate check is `isNaN` plus `isInVietnam()`. That function, at `:36-38`, is a country bounding box (lat 8-23.5, lng 102-110), and the placeholder passes it.
- `src/app/api/route/route.ts:80` excludes only UNAVAILABLE, INACTIVE and OUTOFSERVICE (applied at `:364`). The 19 ACTIVE and 2 BUSY placeholder rows are therefore route candidates.

**Root cause.**
- *Established:* the upstream feed sends a placeholder coordinate for some private or franchise stations. The crawl has no check for duplicated or placeholder coordinates, and no check that the coordinate is consistent with the province.
- *Correction to the original finding:* a numeric `province` is normal, not a symptom. Every VinFast row stores a numeric `province_id`. What is anomalous is a province of 2483 (Hà Nội) with an HCM latitude, and that mismatch is a usable detection signal.
- *Not verified:* why VinFast emits this coordinate, whether the set of affected rows changes over time, and whether these stations' real coordinates are available anywhere (for example the detail API).
- *Not verified end to end:* that the route planner actually chose one of these stations on a real route, and the exact "0.1-0.2 km" text in the Nearby UI. The API data that both features are built from is confirmed.

**Repro.**
```bash
curl -s "https://evoyage.duypham.me/api/stations?bounds=10.7318,106.6550,10.8219,106.7467" > /tmp/st.json
node -e 'const s=require("/tmp/st.json").stations;const g={};for(const x of s){const k=x.latitude.toFixed(4)+","+x.longitude.toFixed(4);(g[k]??=[]).push(x)}const top=Object.entries(g).sort((a,b)=>b[1].length-a[1].length).slice(0,3);for(const [k,v] of top)console.log(k,v.length);const p=top[0][1];const st={};for(const x of p)st[x.chargingStatus]=(st[x.chargingStatus]||0)+1;console.log(st,p.slice(0,3).map(x=>[x.ocmId,x.address]))'
# Observed 2026-11-01: 10.7731,106.6948 x108; UNAVAILABLE 71, ACTIVE 19, INACTIVE 16, BUSY 2
```
In the UI: open `/plan`, go to the "Trạm sạc" tab, use location 10.7769,106.7009, and look at the results 0.1-0.3 km away.

**Regression test** (`src/lib/__tests__/crawl-vinfast-stations.test.ts`):
- `crawl-vinfast-stations: coordinate validation > does not upsert out-of-region stations stacked on the feed placeholder coordinate`. It feeds 2 real HCM rows plus 10 Hà Nội rows (province_id 2483) placed on the placeholder coordinate, and asserts that no upserted row is at the placeholder. The fixture trips every detection signal at once: the known constant, a coordinate shared by many rows, and a latitude that contradicts the province. **If the fix flags these rows instead of skipping them, change the assertion to check the flag. Do not delete the test.**

**Fix direction.**
- In the crawl filter (`:292-297`), skip or flag rows that:
  - sit on the known placeholder coordinate, or
  - share an exact coordinate with more than N other stations, or
  - have a `province_id` whose usual latitude band disagrees with `lat`.
- Prefer a rule that does not depend only on the hardcoded constant, because VinFast may change the constant.
- Clean up the roughly 108 existing rows. The upsert only touches in-feed rows, so skipping them in the crawl leaves the old DB rows in place; this overlaps with Finding 3.
- If you flag rather than skip, exclude flagged rows from `/api/stations`, the nearby query and the route candidate query (`route.ts:364`, `:392`).
- Gotcha: do not let this filter drop enough rows to trip `assertPlausibleStationCount`. That guard trips below 50% of the previous count, and 108 of about 25k is far from it, but a broad province-mismatch rule could remove far more.

---

### Finding 3 — The crawl never retires stations that disappear from the VinFast feed

**Symptom.** Stations that VinFast removed from its locator feed months ago are still in the DB with their last status. Those whose last status was ACTIVE, BUSY or null can still be offered as charging stops.

**Evidence (at `64db6f9`).**
- `scripts/crawl-vinfast-stations.ts` `main()` makes only three writes to the DB:
  1. `bulkUpsertStations` on in-feed rows (`:348`), which is what sets `scrapedAt`.
  2. `markExistingOutOfService` (`:349`), whose ids come from `partitionOutOfService` (`src/lib/station/partition-out-of-service.ts:23-45`) and so only include rows that are in the feed and report OUTOFSERVICE.
  3. The `VinFastStationDetail` mapping upsert (`:356-376`).
- Nothing marks or deletes a VinFast row that is absent from the feed. No other job does it either: `scripts/poll-vinfast-station-status.ts` writes only cookies, and `src/lib/maintenance/prune-stale-caches.ts` does not touch `ChargingStation`.
- The route planner filters on `chargingStatus` only (`route.ts:80`, `:364`) and never checks `scrapedAt`.
- Read-only prod SQL (2026-11-01, finder plus one verifier inside a READ ONLY transaction): VinFast rows with `scrapedAt < now() - 3 days` and status not OUTOFSERVICE total 726, last scraped May: 4, Jun: 10, Jul: 660, Oct: 52. The oldest example is `vinfast-C.KHO0092` "Nhà ở Xã hội Cam Nghĩa Cam Ranh", status ACTIVE, `scrapedAt` 2026-05-07.
- A post-mortem dated 2026-10-01 (`docs/POST-MORTEM-2026-10-01.md`, untracked in the main checkout and not on this branch) already counted 692 ghost stations. The problem is known and growing.

**Root cause.**
- *Established:* the crawl has no "absent from the feed" step.
- *Impact correction (verifier):* most of the 726 are already UNAVAILABLE or INACTIVE, which the route planner already skips. The stale rows broken down by status are UNAVAILABLE 634, INACTIVE 62, ACTIVE 25, null 3, BUSY 2. **Only about 30 stale rows are actually routable** (25 ACTIVE + 2 BUSY + 3 null). The finding's "25,812 routable" figure counts UNAVAILABLE and INACTIVE rows too, so it should not be quoted.
- *Hypothesis, not checked:* each stale row is really gone from the feed rather than temporarily missing. Nobody fetched the feed to confirm. A stale `scrapedAt` is strong indirect evidence, because the upsert rewrites `scrapedAt` on every in-feed row.
- Side effect: these rows' statuses are frozen, so an UNAVAILABLE on a ghost row is not live data either.

**Repro** (read-only; run it inside `BEGIN READ ONLY` against a DB connection string you hold as "[SENSITIVE]", and never write):
```sql
SELECT "chargingStatus", count(*)
FROM "ChargingStation"
WHERE provider = 'VinFast'
  AND "scrapedAt" < now() - interval '3 days'
GROUP BY 1;
-- Routable ghosts only:
SELECT count(*) FROM "ChargingStation"
WHERE provider = 'VinFast' AND "scrapedAt" < now() - interval '3 days'
  AND ("chargingStatus" IS NULL OR "chargingStatus" NOT IN ('UNAVAILABLE','INACTIVE','OUTOFSERVICE'));
```

**Regression test** (`src/lib/__tests__/crawl-vinfast-stations.test.ts`):
- `crawl-vinfast-stations: retiring stations that left the feed > issues a retirement write for an existing VinFast station that is absent from a plausible feed`. It seeds the DB with three VinFast rows, sends a feed containing two of them, and asserts that some write besides the INSERT upserts targets the missing row (by id or ocmId) or selects rows by `scrapedAt`. This assertion is deliberately loose so it does not dictate the design.
- It cannot check the grace window (K days). If you implement one, add a test for it.

**Fix direction.**
- After the plausibility gate passes (`:340-344`), retire VinFast rows whose `scrapedAt` is older than K days by setting `chargingStatus = 'OUTOFSERVICE'` or a new retired status. Alternatively, exclude stale rows from route candidates in `route.ts`.
- Keep the retirement behind `assertPlausibleStationCount`, so that a truncated feed cannot mass-retire stations.
- A grace window of a few days covers stations that are only temporarily missing.
- Gotcha: if you add a new status value, update `EXCLUDED_STATION_STATUSES` in `route.ts:80`, or the change does nothing for routing.

## Related low-severity items (not tested here)

- **Daily churn of VinFastStationDetail mapping rows.** The crawl writes about 24.8k mapping rows with `fetchedAt = new Date(0)` (`scripts/crawl-vinfast-stations.ts:366`). The ON CONFLICT clause updates only `storeId` (`:372`), so even existing rows keep the epoch timestamp. The nightly prune (`src/lib/maintenance/prune-stale-caches.ts:100-101`, `fetchedAt < now() - 30 days`) then deletes all of them. Each day `vinfastDetailPruned` is roughly the size of the whole table, and between the prune (about 22:00 UTC) and the next crawl (about 06:40 UTC) the mappings do not exist. That costs about 50k wasted writes a day, and it blocks "derive power from the detail cache" in Finding 1. Two audit findings reported this independently; it was not unit-tested in this branch.

## Open questions / what to verify first

1. **Finding 1:** should the fix use nullable columns (needs a migration) or a sentinel value? How should the UI show "power unknown"? This is a product decision; ask Duy before coding.
2. **Finding 1:** does `enrich-vinfast-detail.ts` still work against the current VinFast detail API? Run it once against a staging DB before scheduling it.
3. **Finding 2:** does the VinFast detail endpoint return a real coordinate for these stations? If it does, fix the rows instead of dropping them.
4. **Finding 3:** pick K. Check how often a station legitimately drops out of the feed for one or two days by comparing `scrapedAt` distributions across several days.
5. **Finding 3:** confirm that a sample of stale `ocmId`s, such as `vinfast-C.KHO0092`, is absent from today's CDN feed.

## Verification provenance

- Each finding was adversarially checked by **2 verifier agents** on 2026-11-01. They ran read-only code reads at HEAD `bfa3a3b` / `e6b984f`, live GETs against https://evoyage.duypham.me, and, for Finding 3, one read-only prod SQL session.
- Same vendor, same priors; no external verifier ran.
- All 4 original findings were confirmed and none was refuted.
- Severity votes: Findings 1 and 2 medium/medium. Finding 3 low/medium, split over impact (only about 30 rows are routable), not over the root cause.
- This document's author re-read every cited line at `64db6f92e0792aa4643b2ba76958ff0843b80567` and found every finding still present. The regression tests above were run there: each `it.fails` fails on its intended assertion (checked by temporarily running them as plain `it`), and the full suite stays green (1743 passed).
