# Bug: production map is blank because the Mapbox token ships as "[SENSITIVE]"

Date: 2026-11-01 · Code reference: `64db6f92e0792aa4643b2ba76958ff0843b80567` (origin/main) · Prod: https://evoyage.duypham.me

## Summary

The map on `/plan` is solid black for every user, on mobile and desktop. The client bundle holds the literal string `"[SENSITIVE]"` as the Mapbox token. Mapbox rejects it with 401, and the app never falls back to the OSM map because it treats any non-empty string as a valid token. A second bug rides on the same path: on a first-time (uncached) route, the trip header, share card and share text show raw coordinates like `10.7737 → 11.9083` instead of place names.

## Severity & priority

| # | Finding | Severity | Priority |
|---|---|---|---|
| 1 | Mapbox token baked into the bundle as `"[SENSITIVE]"`; no OSM fallback | Critical | P0 |
| 2 | Mapbox-provider cache miss returns coordinates as start/end addresses | Medium (filed as High; both verifiers lowered it) | P1, but every first-time route hits it while finding 1 is live |

The audit filed finding 1 twice, once from code/CI review and once from browser QA. Both copies have the same root cause and are merged here as finding 1. Nothing was dropped: both findings still hold at `64db6f9`.

## Affected features

- `/plan` map rendering (basemap, route line, station markers) on all viewports.
- Trip summary header, timeline labels, share card, copied share text, Leaflet start popup, and the route narrative input, on the first plan of any start/end pair.

---

## Finding 1: the Mapbox token in the client bundle is the placeholder `"[SENSITIVE]"`

### Symptom

- The `/plan` map area stays black at 375, 768 and 1440 px. There are no tiles and no route line, only stray A/B/1 markers on desktop. The user sees no error message.
- Console: `Access to fetch at 'https://api.mapbox.com/styles/v1/mapbox/dark-v11?...&access_token=[SENSITIVE]' ... blocked by CORS policy`, then `Error: Failed to fetch`. The CORS error is a side effect: Mapbox's 401 response carries no `Access-Control-Allow-Origin`.
- Route planning in the sidebar still works.

### Evidence

Re-checked on 2026-11-01 for this note. All requests were read-only GETs.

```sh
# 1. The live /plan bundle contains the placeholder
curl -s https://evoyage.duypham.me/_next/static/chunks/3mekd8l-9yzrf.js | grep -o 'mapboxAccessToken:"[^"]*"'
# -> mapboxAccessToken:"[SENSITIVE]"
curl -sI https://evoyage.duypham.me/_next/static/chunks/3mekd8l-9yzrf.js | grep -i last-modified
# -> last-modified: Sun, 01 Nov 2026 13:04:44 GMT   (the deploy of 64db6f9)
# No chunk reachable from /plan contains a "pk.ey" token.

# 2. Mapbox rejects it
curl -s -o /dev/null -w '%{http_code}\n' -H 'Origin: https://evoyage.duypham.me' \
  'https://api.mapbox.com/styles/v1/mapbox/dark-v11?access_token=%5BSENSITIVE%5D'
# -> 401   body: {"message":"Not Authorized - Invalid Token"}

# 3. The deploy that built it says so
gh run view 41308163861 -R duypham9895/evoyage --log | grep 'cannot be pulled'
# -> Pull Vercel environment ... Vercel CLI 65.9.0
#    ! 8 Secret values cannot be pulled from the `production` Environment.
#      Wrote "[SENSITIVE]" as placeholders for the remaining values; ...
```

Run 41308163861 is the production deploy of `64db6f9`. The same warning appears in run 41305855707 (`bfa3a3b`) and in run 36699206556 (2026-09-30, CLI 61.1.0), so the problem dates back to at least 2026-09-30.

A local `vercel pull` produces `.vercel/.env.production.local` (gitignored) with `"[SENSITIVE]"` for exactly 8 keys: `ADMIN_TOKEN`, `CRON_SECRET`, `DATABASE_URL`, `DIRECT_URL`, `GROQ_API_KEY`, `MAPBOX_ACCESS_TOKEN`, `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`, `OPENAI_API_KEY`.

Code at `64db6f9`:

- `.github/workflows/deploy.yml:175`: `vercel pull --yes --environment=production`
- `.github/workflows/deploy.yml:179`: `vercel build --prod`. No `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` is set on this step. The only secret fallback for it, at line 110, belongs to the E2E step.
- `.github/workflows/deploy.yml:208`: `vercel deploy --prebuilt --prod`
- `src/app/plan/page.tsx:70-71`:
  ```ts
  const hasMapboxToken = Boolean(process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN);
  const activeMapMode = hasMapboxToken ? mode : 'osm';
  ```
- `src/lib/map-mode.tsx:11`: `PREFERRED_MAP_MODE = 'mapbox'` is hardcoded, and the UI has no toggle.
- `src/components/map/MapboxMap.tsx:511-528`: the component guards only against an empty token and passes the value straight to `<MapGL mapboxAccessToken>`. It has no `onError` fallback.

### Root cause

- **Established:** the CI job runs `vercel pull`, then `vercel build`, then a prebuilt deploy. The pull cannot read Sensitive variables, so it writes `"[SENSITIVE]"`. Next.js inlines `NEXT_PUBLIC_*` at build time, so the placeholder ships in the client JS. The CI log, the pulled file and the live bundle all show this.
- **Established:** `page.tsx:70` treats any truthy string as a token, so the OSM/Leaflet fallback never activates.
- **Inferred, not checked in the dashboard:** `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` is flagged Sensitive in Vercel. The pull output strongly implies it.
- **Hypothesis:** server-only vars such as `MAPBOX_ACCESS_TOKEN` and `DATABASE_URL` are fine at runtime because Vercel injects them into the function environment. `/api/route` works on prod, which is consistent with this. It is not proven for every server var, and it does not cover any code that reads a server var at build time, for example during static generation.

### Repro

1. Open https://evoyage.duypham.me/plan in any browser. The map stays black.
2. Open DevTools > Console. You see the CORS error on `api.mapbox.com/styles/v1/mapbox/dark-v11`.
3. Or run the curl commands under Evidence.

### Regression test

- `src/app/plan/page.map-token.test.tsx` › `falls back to the OSM map when the token is the "[SENSITIVE]" vercel-pull placeholder`. It is marked `it.fails` and fails on the real assertion: `Unable to find an element by: [data-testid="osm-map"]`, because Mapbox rendered. Two passing control tests in the same file prove the test can tell the cases apart: a `pk.` token renders Mapbox, and an empty token renders OSM.
- **The CI/Vercel half is not unit-testable.** It depends on Vercel env-var flags and the `vercel pull` output. Verify it with the curl commands above after a deploy.

### Fix direction

1. **The real fix is config.** Either make `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` a plain (non-Sensitive) Vercel variable, or set it explicitly as `env:` on the `Build` step in `deploy.yml` from a GitHub secret. It is a public `pk.` token that ships to every browser anyway, so Sensitive buys nothing. Redeploy afterwards. No code change can make Mapbox work while the bundle holds the placeholder.
2. **Add a build guard in `deploy.yml`** between Build and Deploy: fail the job if `grep -rl '\[SENSITIVE\]' .vercel/output/static` finds anything. A post-deploy smoke check (no placeholder in the live bundle, Mapbox style request returns 200) is a stronger version.
3. **Add defence in depth in code:** in `page.tsx:70`, count the token as present only if it starts with `pk.`. Optionally fall back to OSM on a Mapbox `error` event for a style 401 in `MapboxMap.tsx`. Then flip the `it.fails` above to `it`.

Gotchas:
- Fix 3 alone gives users an OSM map, but the "Mapbox" branch of route planning is chosen off the same flag (`page.tsx:576`), so it also changes which provider `/api/route` gets. That is acceptable, but expect it.
- The preview path (`deploy.yml:143,147`) also does `vercel pull --environment=preview` + `vercel build`. Check whether preview builds carry the same placeholder.
- `MapboxMap.tsx:511` reads the env var separately from `page.tsx:70`. Keep the two checks consistent, ideally through one helper.
- Do not commit any real token. The test uses `pk.test-public-token`.

---

## Finding 2: a Mapbox-provider cache miss returns coordinates as start/end addresses

### Symptom

After planning HCM to Da Lat for the first time, the summary reads `10.7737 → 11.9083`, the timeline labels read `10.7737` / `11.9083`, and the share card and copied text read `10.7737,106.7166 → 11.9083,108.4572`. Planning the same pair again is a cache hit and shows `TP.HCM → Đà Lạt`.

### Evidence

- `src/lib/routing/mapbox-directions.ts:72-73` returns `startAddress: \`${originLat.toFixed(4)},${originLng.toFixed(4)}\`` and the same for `endAddress`.
- `src/app/api/route/route.ts:290-291` copies `mapboxResult.startAddress/endAddress` into `directions` on a Mapbox cache miss.
- Other branches use the user-entered `start`/`end`: the Mapbox cache hit (`route.ts:266-267`), the OSRM cache hit (`route.ts:236-237`) and the OSRM fetch (via `fetchDirectionsFromCoords(..., start, end)`). The fallback client `mapbox-directions-fallback.ts` documents and keeps the same contract.
- `route.ts:714-715` puts them into the response.
- Consumers that show the coordinates:
  - `TripSummary.tsx:447-448`: `extractCityName` splits on `,` (`src/lib/trip/extract-city.ts:48`), which gives `10.7737`.
  - `ShareButton.tsx:196, 373, 378, 390, 408`.
  - `Map.tsx:140`.
  - `useRouteNarrative.ts:107`: the LLM narrative input.
- Live (2026-11-01, both verifiers): two identical POSTs to `/api/route` with `provider:'mapbox'` and fresh coordinates. The first returned `startAddress:"10.7721,106.6983"`. The second, a cache hit, returned the entered name.

### Root cause

**Established.** The Mapbox Directions client has no address input and returns coordinate strings. The Mapbox cache-miss branch passes those through instead of the request's `start`/`end`. Every client sends `provider:'mapbox'` today (`page.tsx:576`) because of finding 1, so every first-time route hits this branch.

### Repro

On prod `/plan`, pick a start/destination pair that has not been planned before and tap "Tính lộ trình". Read the summary header and open Share. The `curl` repro writes to the route cache, so prefer the UI or local dev.

### Regression test

`src/app/api/route/route.test.ts` › `POST /api/route provider resilience` › `returns the user-entered start/end names on a Mapbox cache miss, not coordinate strings`. It is marked `it.fails` and fails with `expected '10.0000,106.0000' to be 'A'`. The Mapbox client is mocked to return exactly what the real client returns.

### Fix direction

In `route.ts`, set `startAddress: start, endAddress: end` in the Mapbox cache-miss branch, as the other branches already do. The alternative is to make `fetchDirectionsMapbox` take and return the names, like `mapbox-directions-fallback.ts` does, but the route.ts change is smaller. Flip the `it.fails` once done. Fixing finding 1 does not fix this: a valid token still sends `provider:'mapbox'`.

---

## Related low-severity items (not covered by tests here)

- The landing hero map's `aria-label` is the raw key `hero_map_alt` (`src/components/landing/VietnamMap.tsx`), and `<html lang>` stays `vi` after switching the landing page to English (`src/components/landing/LandingPageContent.tsx`, `src/lib/locale.tsx`). Screen readers announce the key, and they read English text with Vietnamese phonetics.

## Open questions / what to verify first

1. In the Vercel dashboard, is `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` (and `MAPBOX_ACCESS_TOKEN`) flagged Sensitive? This decides between fix options (a) and (b).
2. Do preview deployments (`deploy.yml:143-147`) ship the same placeholder?
3. Does any other code read one of the 8 placeholder vars at **build** time (static generation, `generateStaticParams`, module-level reads)? Those would also be baked in as `"[SENSITIVE]"`.
4. Test-suite note, unrelated to this bug: `src/app/plan/page.effects.test.tsx` › `geolocationSupported` times out at the default 5 s on a cold page import when the full suite runs in parallel. It fails that way at `64db6f9` without this branch. The new page test adds 3 more page renders and makes the flake show up more often when only `src/app/plan/` runs. It passes when run alone.

## Verification provenance

- The audit ran on 2026-11-01 against HEAD `bfa3a3b` and live prod. Two independent adversarial verifier agents tried to refute each finding. Neither could; both confirmed findings 1 and 2. They are the same vendor as the author, with the same priors; no external verifier ran.
- This note's author re-checked everything at `64db6f9` on 2026-11-01: the cited code lines, the live bundle chunk, the Mapbox 401 and the deploy log of run 41308163861. The author also confirmed that each `it.fails` test fails on its real assertion when flipped to `it`.
- Not verified by anyone: the Vercel dashboard flags, or the black map seen in a browser screenshot by the verifiers. The 401 on the style request implies the black map.
