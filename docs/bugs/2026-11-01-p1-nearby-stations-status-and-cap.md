# P1: Nearby stations show dead chargers as Active and drop the closest stations at 10/25 km

Status: open, documented only. Code refs are at `64db6f92e0792aa4643b2ba76958ff0843b80567` (origin/main). No cited file changed between the audit HEAD `bfa3a3b` and this base.

> **Status 2026-11-02:** Finding 1 is fixed on this branch. `getStatusKey` in `NearbyStations.tsx` and the `STATUS_KEYS` map in `StationCard.tsx` are replaced by one exact-match helper, `src/lib/station/status-label-key.ts`: ACTIVE -> active, BUSY -> busy, UNAVAILABLE/INACTIVE/OUTOFSERVICE -> inactive, null or unknown -> `map_status_unknown`. This also fixes the related StationCard OUTOFSERVICE item. The three Finding 1 tests now run as `it`. Finding 2 (500-row cap before distance ordering) stays open, and its two tests stay `it.fails`: the fix shape (SQL ORDER BY distance vs moving the UI to `/nearby`) is an owner decision (open question 2). Null showing "Status unknown" follows the recommended answer to open question 1; the owner can still change it.

## Summary

On the Nearby tab (`/plan`), most stations in central HCMC show a green "Active" / "Hoạt động" badge even when the charger is INACTIVE or UNAVAILABLE. In the live 5 km box around District 1 that is 233 of 396 stations (59%). Drivers get sent to chargers that do not work.

If the user widens the radius to 10 or 25 km in HCMC or Hanoi, the list leaves out the nearest stations, including ones 0.1-0.2 km away. The server cuts the result to 500 rows in name order before anything sorts by distance.

## Severity & priority

- Severity: **high** (both findings). Both verifiers kept it at high, not critical. The list still renders and the trip planner excludes these statuses on its own, but the core Nearby flow gives wrong answers.
- Priority: **P1**.

## Affected features

- Nearby stations list: `/plan`, Nearby tab (`src/components/NearbyStations.tsx`)
- `GET /api/stations?bounds=...` (`src/app/api/stations/route.ts`)
- `POST /api/stations/nearby` (`src/app/api/stations/nearby/route.ts`). The UI does not call it today, but it has the same cap bug.

---

## Finding 1: INACTIVE, UNAVAILABLE and null statuses render as "Active"

### Symptom

Stations whose API `chargingStatus` is `INACTIVE` or `UNAVAILABLE`, or is missing, show the green "Active" label (`en.json:438` "Active", `vi.json:438` "Hoạt động").

### Evidence

`src/components/NearbyStations.tsx:66-72`:

```ts
function getStatusKey(status: string | null): string {
  if (!status) return 'nearby_active';
  const lower = status.toLowerCase();
  if (lower.includes('available') || lower.includes('active') || lower === 'hoạt động') return 'nearby_active';
  ...
```

`'inactive'.includes('active')` and `'unavailable'.includes('available')` are both true. The function is called at `:264` and its result is rendered at `:290`.

Node replication of the function: `ACTIVE->nearby_active, INACTIVE->nearby_active, UNAVAILABLE->nearby_active, BUSY->nearby_busy, OUTOFSERVICE->nearby_inactive, null->nearby_active`.

Live data (GET only, run by the verifiers):

```
curl -s 'https://evoyage.duypham.me/api/stations?bounds=10.7319,106.6551,10.8219,106.7467'
# 396 stations: UNAVAILABLE 170, ACTIVE 142, INACTIVE 63, BUSY 16, null 3, OUTOFSERVICE 2
```

`/api/stations` passes the raw uppercase enum through without changing it. Elsewhere the codebase treats these values as not working: `src/app/api/route/route.ts:80` `EXCLUDED_STATION_STATUSES = ['UNAVAILABLE', 'INACTIVE', 'OUTOFSERVICE']`, and `src/components/StationCard.tsx:23-32` maps UNAVAILABLE and INACTIVE to `nearby_inactive`.

### Root cause

- **Established:** the substring checks for "available" and "active" run before any negative case, so the negative enum values match the positive branch. A null status also defaults to active.
- **Design choice, not a pure bug:** what null *should* show. Only 3 of 396 stations are affected. The test only requires that null is not shown as "Active".

### Repro

1. Open `/plan`, go to the Nearby tab, set the location to `10.7769,106.7009` and the radius to 5 km.
2. Any station whose API status is INACTIVE or UNAVAILABLE shows the green "Active" label.

### Regression test

`src/components/NearbyStations.test.tsx`, in the describe block `status badge maps the API enum exactly`:

- `shows INACTIVE stations as Inactive, not Active` (`it.fails`)
- `shows UNAVAILABLE stations as Inactive, not Active` (`it.fails`)
- `does not claim a station with no status is Active` (`it.fails`)
- `shows ACTIVE stations as Active`: a control that passes today and must keep passing.

### Fix direction

- Replace `getStatusKey` with an exact match on the uppercase enum: ACTIVE -> active, BUSY -> busy, UNAVAILABLE/INACTIVE/OUTOFSERVICE -> inactive, null or unknown -> a neutral "unknown" key. `map_status_unknown` already exists and `StationCard.tsx` uses it.
- `StationCard.tsx:12-32` already has an exact-match map, but it is missing OUTOFSERVICE (see related items). Extract one shared mapping and use it in both places rather than adding another copy. Other `chargingStatus` consumers to check at the same time: `src/components/trip/StationInfoChips.tsx`, `src/components/map/Map.tsx`, `src/components/trip/TripSummary.tsx`.
- Gotcha: keep the badge colour (`getStatusColor`, `:74`) in step with the label. An unknown key currently falls through to the muted colour, which is fine.

---

## Finding 2: The 500-row cap runs before the distance ordering, so the nearest stations are dropped

### Symptom

In HCMC or Hanoi, choosing 10 km or 25 km returns a list that is missing most of the nearest stations. For example, "Vincom Center Đồng Khởi" at 0.21 km is missing. The results look like an arbitrary subset.

### Evidence

- `src/app/api/stations/route.ts:99-103`: `findMany({ where, orderBy: { name: 'asc' }, take: 500 })`. The only geographic filter is the bounding box.
- `src/app/api/stations/nearby/route.ts:67-73`: `findMany({ where: <bbox of radiusKm/80 deg>, take: 500 })` with no `orderBy`. `findStationsNearPoint` (`:82`) sorts only the rows that survived the cap.
- `src/components/NearbyStations.tsx:28` offers radii `[2, 5, 10, 25]`. `:373` fetches `/api/stations?bounds=`, and `:396-406` filter and sort by haversine distance on the client, so the client can only sort what the server already cut.

Live repro (GET plus one read-only POST, run by the verifiers; centre `10.7769,106.7009`):

```
curl -s 'https://evoyage.duypham.me/api/stations?bounds=10.6868,106.6094,10.8670,106.7924'   # 10 km box -> count 500 (capped)
curl -s 'https://evoyage.duypham.me/api/stations?bounds=10.5517,106.4724,11.0021,106.9294'   # 25 km box -> count 500, last name "Cửa hàng xăng dầu Mỹ Anh 2"
```

334-335 of the ~395 stations in the 5 km box are missing from the 25 km response, including the 5 nearest: 0.07 km "Trạm NHÀ CHỜ XE BUÝT 6180 SỐ 63", 0.21 km "Vincom Center Đồng Khởi, Hầm B6", 0.22 km "Vincom Center Đồng Khởi - Hầm B5", and two more. 272 are missing from the 10 km response.

```
curl -s -X POST https://evoyage.duypham.me/api/stations/nearby -H 'Content-Type: application/json' \
  -d '{"latitude":10.7768,"longitude":106.6998,"radiusKm":5}'    # ~290-301 stations
curl -s -X POST https://evoyage.duypham.me/api/stations/nearby -H 'Content-Type: application/json' \
  -d '{"latitude":10.7768,"longitude":106.6998,"radiusKm":25}'   # ~406-407 stations; ~253-263 of the 5 km set are absent, nearest 4 included
```

Exact counts drift by a few stations between runs because the station data is re-synced.

### Root cause

- **Established:** the DB query applies `take: 500` before any distance ordering. In `/api/stations` the cap drops rows in name order. In `/nearby` it drops them in whatever order the rows are stored. A box larger than about 5 km in a dense city holds more than 500 stations.

### Repro

Compare the station ids from the 5 km and 25 km calls above. The nearest stations from the 5 km call are missing from the 25 km call. In the UI, set the radius to 25 km at `10.7769,106.7009` and look for "Vincom Center Đồng Khởi". It is not listed.

### Regression tests

Both tests replace Prisma `findMany` with a small fake that honours the `where` lat/lng range, `orderBy: { name }` and `take`. The fake holds 600 rows about 15 km out, plus one station next to the centre.

- `src/app/api/stations/route.test.ts`, test `GET /api/stations — dense-city radius box > keeps the station nearest the box centre when the box holds more than 500 stations` (`it.fails`)
- `src/app/api/stations/nearby/route.test.ts`, test `POST /api/stations/nearby — dense-city radius > returns the nearest station when the bounding box holds more than 500 stations` (`it.fails`)

**Gotcha for the fixer:** if the fix moves the query to `prisma.$queryRaw` (for example to order by distance in SQL), the fake will not be called. Port the fake to whichever Prisma method the fix uses, and keep the assertion: with more than 500 rows in the box, the nearest station is still returned (first, for `/nearby`).

### Fix direction

- Order by distance in the DB before the cap. Options: PostGIS, or `$queryRaw` with `ORDER BY (lat - :lat)^2 + ((lng - :lng) * cos(:lat))^2`. Alternatively, raise or remove the cap for radius-sized boxes. The box is already limited to 5° by 5° (`route.ts:88`), but a 25 km box in HCMC can still hold more than 1,000 rows. Check the payload size first (see the related item on `rawData`).
- `/api/stations?bounds=` is also used by the map viewport. Name order there is harmless, but a distance order needs a centre point. Consider an optional `center=` param, or move NearbyStations to `/api/stations/nearby` once that endpoint orders correctly. Its response shape is different (`{ station, distanceKm, ... }[]`), so the component needs adapting.
- Do not just raise `take` without a bound. The comment at `route.ts:87` exists to prevent full-table scans.

---

## Related low-severity items (not tested here)

- **eVi StationCard shows OUTOFSERVICE as "Status unknown".** `src/components/StationCard.tsx:23-32` has no OUTOFSERVICE key, so `:62` falls back to `map_status_unknown`. This goes away if Finding 1's fix creates one shared map.
- **`/api/stations` returns `rawData` and contact fields, about doubling the payload.** The 5 km HCMC response is about 822 KB and the 25 km response about 1.0 MB, roughly half of it raw upstream JSON the UI does not use. `route.ts:99` has no `select`. This matters if Finding 2 is fixed by raising the cap.

## Open questions / what to verify first

1. What should a null status show: "unknown" (recommended) or something else? This is a product decision. The test only forbids "Active".
2. Fix shape for Finding 2: ORDER BY distance in SQL (keeps the cap, needs `$queryRaw`), or switch the UI to `/nearby`? Decide before writing code. It determines which test fake needs porting.
3. Re-run the live curls before fixing. Counts drift with each station sync, but the shape (count == 500 at 10/25 km, nearest missing) should hold.

## Verification provenance

- Each finding was checked by 2 adversarial verifier agents (Claude, same vendor, same priors; no external verifier ran) on 2026-11-01 against HEAD `bfa3a3b` and live prod `https://evoyage.duypham.me`. All 4 votes were "not refuted, severity high". Prod was only read (GET requests plus a read-only POST to `/nearby`).
- Re-checked by reading the code at `64db6f9`. The cited lines are unchanged.
- The regression tests were confirmed to fail on the intended assertion: flipping `it.fails` to `it` makes all 5 fail with assertion errors, not setup errors.
