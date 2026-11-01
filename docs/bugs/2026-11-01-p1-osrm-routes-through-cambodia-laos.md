# P1: OSRM routes HCM <-> Ha Noi through Cambodia and Laos

## Summary

When a trip is planned with the OSRM routing provider, a Ho Chi Minh City -> Ha Noi trip is routed through Cambodia and Laos (1,493.7 km instead of the 1,637.9 km QL1A route). The plan then recommends a charging station in Laos, has legs that arrive at 0%, and shows 60+ identical "No charging station found" warnings. This is the main long-trip case, and OSRM is the default provider.

## Severity & priority

- Severity: **high**. The core trip-planning flow gives a wrong, unusable plan for Vietnam's main north-south corridor.
- Priority: **P1**.
- Not a crash. Mapbox map mode gives a correct route for the same trip.

## Affected features

- Trip planning, `POST /api/route`, every path that ends in the OSRM client:
  - the OSM / Leaflet map mode (`src/app/plan/page.tsx:576` sends `provider: 'osrm'` unless the map mode is `mapbox`),
  - any request without `provider` (schema default is `'osrm'`, `src/app/api/route/route.ts:51`),
  - the Mapbox -> OSRM fallback when Mapbox Directions fails (`route.ts:302-311`).
- Charging-stop selection and warnings downstream (`src/lib/routing/route-planner.ts`).
- The 24 h route cache (`src/lib/routing/route-cache.ts`), which stores the bad OSRM polyline.

## Finding 1: OSRM's cross-border route is returned and planned on without any check

### Symptom

HCM -> Ha Noi with `provider: "osrm"` returns `totalDistanceKm: 1493.7`. The polyline goes through Kratie and Stung Treng (Cambodia) and Pakse, Savannakhet and Thakhek (Laos). Charging stop 2 is "Loco-EV fast charger 1x" at (15.1097884, 105.8210161), near Pakse in Laos, with 0% battery on arrival and a detour of about 1,178 s. Stop 3 also arrives at 0% (detour about 2,013 s). The response has 62-63 warnings, almost all `NO_COMPATIBLE_STATION` "No charging station found in this area", starting at about 305 km. The reverse trip (Ha Noi -> HCM) gives 1,495.7 km and 62 warnings. With `provider: "mapbox"` the same trip is 1,637.9 km with 0 warnings, and the polyline stays on the coast (for example 13.09,109.26 and 15.85,108.19).

### Evidence

Commit `64db6f92e0792aa4643b2ba76958ff0843b80567`:

- `src/lib/routing/osrm.ts:61`: `const OSRM_BASE = 'https://router.project-osrm.org';` (the public demo server, global OSM graph).
- `src/lib/routing/osrm.ts:99-125` (`callOsrm`), URL at line 105: `${OSRM_BASE}/route/v1/driving/${coordinates}?overview=full&geometries=polyline`. It sends no waypoints, no exclusions and no region limit. The first route is returned as-is.
- `src/lib/routing/osrm.ts:185-220` (`fetchDirectionsFromCoords`), `:135-183` (`fetchDirections`) and `:230-304` (`fetchDirectionsWithWaypoints`) all return the `callOsrm` result unchecked. Mapbox is used only on a 5xx or network failure (`shouldFallback`, `:47-54`).
- `src/app/api/route/route.ts:201-216`: coordinate validation (`isValidCoordinate`, a loose Southeast Asia box of lat 0-30 and lng 95-115) runs only when `provider !== 'osrm'`, and it checks only the endpoints, never the polyline.
- `src/app/api/route/route.ts:224-257` (`fetchViaOsrm`): reads and writes the OSRM route cache (`getCachedRoute` at :230, `setCachedRoute` at :249). Lines 313-315 call it for the default provider.
- `src/lib/routing/route-planner.ts:384-385`: pushes a `NO_COMPATIBLE_STATION` warning for every decision point that has no station. The foreign stretch has almost no stations, which produces the warning flood.
- A grep of `src/` for a Vietnam polygon/bbox check, `cambodia`, `laos` or `isInVietnam` on the routing path finds nothing. The only "outside Vietnam" hits are in eVi parsing/prompt code, which does not touch routing.

Re-run on 2026-11-01 against the public OSRM server (not prod):

```
$ curl -s 'https://router.project-osrm.org/route/v1/driving/106.698,10.7726;105.8542,21.0285?overview=full&geometries=geojson' -o osrm.json
$ python3 -I -c "import json;d=json.load(open('osrm.json'));r=d['routes'][0];c=r['geometry']['coordinates'];f=[p for p in c if 12<=p[1]<=17.5 and p[0]<106];print(d['code'],round(r['distance']/1000,1),'km',len(c),'pts',len(f),'foreign')"
Ok 1493.7 km 17045 pts 3445 foreign
```

Sampled foreign points (lat, lng): (13.492, 106.0), (14.923, 105.938), (15.319, 105.758), (15.909, 105.545), (16.497, 105.033), (17.156, 104.992). Between lat 12 and 17.5, every point west of lng 106 is in Cambodia or Laos.

Prod (`https://evoyage.duypham.me/api/route`, provider osrm) was replayed by both audit verifiers on 2026-11-01. It returned HTTP 200, `routeProvider: "osrm"`, 1493.7 km and 63 warnings, and stop 2 was the Laos station above. This author session did not call prod again, because a cache miss makes `/api/route` write a `routeCache` row.

### Root cause

- **Established:** the public OSRM graph covers all of mainland Southeast Asia. For HCM -> Ha Noi, the shortest path goes inland through Cambodia and Laos. `callOsrm` takes `routes[0]` and nothing on the routing path checks that the polyline stays in Vietnam (`osrm.ts:99-125`, `route.ts:201-216`).
- **Established:** the station DB covers Vietnam plus a few stations near the border. Along the foreign stretch the planner finds almost no stations, so it emits a decision point with no station (and a warning) at each step. The one foreign station it does find becomes a recommended stop.
- **Established (data):** station `cmsjt06qg00gn4snumudi2v7x` ("Loco-EV fast charger 1x", in Laos) has the province `Tây Nguyên / Highlands`. The UI therefore gives no hint that the stop is abroad.
- **Hypothesis:** the 0%-arrival legs come from the planner reaching the end of usable range with no candidate station, then taking the far-off foreign one. This was not traced line by line. The empty-decision-point behaviour is a separate audit finding in another group (see "Related").

### Repro

Pure, no prod side effects: run the `curl` above against public OSRM and count the points with `12 <= lat <= 17.5 && lng < 106`.

End to end on a local dev server (`npm run dev`). A cache miss writes one `routeCache` row, so use a dev DB, not prod:

```
curl -s -X POST http://localhost:3000/api/route -H 'Content-Type: application/json' -d '{"start":"Chợ Bến Thành, TP.HCM","end":"Hồ Hoàn Kiếm, Hà Nội","startLat":10.7726,"startLng":106.698,"endLat":21.0285,"endLng":105.8542,"vehicleId":null,"customVehicle":{"brand":"VinFast","model":"VF 6 Plus","batteryCapacityKwh":59.6,"officialRangeKm":460},"currentBatteryPercent":80,"minArrivalPercent":15,"rangeSafetyFactor":0.8,"provider":"osrm"}' > out.json
```

Then decode `.polyline` (precision 5), look at the points with lat 12-17.5 and lng < 106, check `totalDistanceKm` (about 1493.7) and count `.warnings`. Running the same request with `"provider":"mapbox"` should give about 1637.9 km. The prod repro in the audit used `vehicleId: "cmolmmmc40003xkigb1yvhyxx"` (VF6 Plus).

### Regression test

- `src/lib/routing/osrm.test.ts` -> `fetchDirectionsFromCoords — route must stay inside Vietnam` -> `never resolves HCM -> Ha Noi with a polyline through Cambodia/Laos`, marked `it.fails`.
- Only `fetch` is mocked, and the mock is URL-aware. A plain 2-point OSRM call gets a polyline built from the real cross-border sample points. An OSRM call with extra waypoints, or any Mapbox call, gets an in-country coastal polyline. The test accepts either of two outcomes: the call resolves with no point in the Cambodia/Laos box, or it rejects. So any of "retry with Mapbox", "re-query OSRM with VN waypoints" or "refuse the route" makes it pass.
- Today the assertion fails with `expected [ …(5) ] to deeply equal []` (five foreign points). The failure was checked by temporarily flipping the test to `it`.
- **Fixer:** once the fix lands, change `it.fails` to `it`. If you put the guard in `route.ts` instead of `osrm.ts`, this test will not flip. Move it to `src/app/api/route/route.test.ts`, which mocks `@/lib/routing/osrm`, and assert at that level instead.

### Fix direction

- **Where:** the guard belongs in the OSRM client (`osrm.ts`, ideally inside one helper used by all three exported functions), so that the default path, the waypoint path and the Mapbox -> OSRM fallback in `route.ts` are all covered.
- **Detect:** test the decoded polyline against a Vietnam polygon, or at least against a coarse "western corridor" exclusion (the lat 12-17.5 / lng < 106 band catches this case). A plain lat/lng bbox of Vietnam does **not** work, because the bbox contains most of Laos and Cambodia.
- **Recover, in order of preference:**
  1. Retry with Mapbox Directions (`fetchDirectionsMapboxFromCoords`, precision 5) when `MAPBOX_ACCESS_TOKEN` is set. The audit observed Mapbox staying on QL1A for this trip. Re-check its polyline with the same guard.
  2. Re-query OSRM with one or two in-Vietnam via points (for example on QL1A near Quy Nhon / Da Nang). OSRM accepts extra `lng,lat` pairs, but via points change the route and the ETA, so pick them only when the guard trips.
  3. If neither works, return an error or a flagged result the UI can show ("route leaves Vietnam") instead of a silent plan.
- **Gotchas:**
  - **Route cache:** `route.ts:230` serves `osrm:` cache rows for 24 h. A fix in `osrm.ts` alone still returns cached cross-border routes until they expire. Either run the guard on cache hits as well, or tell the fixer to purge `routeCache` rows with the `osrm:` prefix after deploying (ask Duy before any prod DB write).
  - The polyline has about 17k points for this trip, so the check must be O(n) with no spread into `Math.min/max` (see the comment at `route.ts:339-340`).
  - Do not make every request call Mapbox. It costs money, and OSRM is the free default. Call it only when the guard trips.
  - Border-area endpoints (Moc Bai, Lao Bao, Tinh Bien) can briefly leave Vietnam legitimately. Use a tolerance (a few km, or a minimum share of foreign points), not "any point outside".
  - Keep `provider` honest: if the fallback produced the route, return `'mapbox'` so the existing UI fallback note shows.

## Related low-severity items

- Station `cmsjt06qg00gn4snumudi2v7x` ("Loco-EV fast charger 1x", 15.1097884, 105.8210161) is in Laos but has `province: 'Tây Nguyên / Highlands'`. Fix it in the station sync/seed (`scripts/`), not in the UI. This is a data issue, not unit-testable.
- The empty decision points and the warning flood when no station exists (`route-planner.ts:384`) are tracked as a separate audit finding in another bug group. Fixing the routing removes the trigger here, but not the planner behaviour.

## Open questions / what to verify first

1. Does Mapbox Directions stay in Vietnam for the reverse trip and for other long trips (HCM -> Da Nang, Da Nang -> Ha Noi, Can Tho -> Ha Noi)? The audit verified only the HCM -> Ha Noi Mapbox result, and the verifiers did not re-run it.
2. Which other corridors does OSRM route abroad? Try Da Lat / Buon Ma Thuot -> Ha Noi and Kon Tum -> Vinh. These are the likeliest, because of Laos Route 13.
3. Product decision for Duy: when no in-country route is available, should the API fail, or plan on the foreign route with a visible warning?
4. How many `osrm:` rows in the prod `routeCache` hold a cross-border polyline today? This is a read-only query, but it still needs Duy's go before it runs against prod.

## Verification provenance

- Found during the eVoyage full audit. Two adversarial verifier agents confirmed it independently on 2026-11-01, against HEAD `bfa3a3b` and live prod. Both voted "not refuted, severity high", and both reproduced the 1493.7 km / Laos-station result on prod.
- This author session re-read the cited code at `64db6f92e0792aa4643b2ba76958ff0843b80567` (line numbers above are from that commit) and re-ran the public OSRM query. It did not call prod.
- The verifiers are Claude agents: same vendor, same priors; no external verifier ran.
