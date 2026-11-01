# P1: Overpass amenities fail slowly and the daily POI warmer is broken

Date: 2026-11-01 · Code reference: `64db6f92e0792aa4643b2ba76958ff0843b80567` (origin/main) · Branch: `bug/p1-overpass-amenities-and-warm-pois`

## Summary

When a driver opens a station's amenities, eVoyage calls the public Overpass server live. That server is often slow or "at capacity", so the panel waits 7-37 s and then shows nothing. The failure is not cached, so the next view waits again. The daily job that should pre-fill the cache has been cancelled 14 of the last 15 days. Even on the day it succeeded, it wrote rows in a format the amenities route ignores.

## Severity and priority

- Priority: **P1**. Group severity: **high**.
- Finding 1 (route: slow, uncached failures): medium.
- Finding 2 (warmer: cancelled daily, wrong cache format): high. One verifier rated it medium because amenities is a secondary feature.
- Amenities is effectively broken in production. The rest of the app (trip planning, stations, eVi) is not affected.

## Affected features

- `GET /api/stations/[id]/amenities`: the station card amenities panel.
- GitHub Actions workflow "Warm Station POIs" (`.github/workflows/warm-station-pois.yml`) and the `StationPois` cache table.

All files are at `64db6f9`:

- `src/lib/station/overpass-client.ts`
- `src/app/api/stations/[id]/amenities/route.ts`
- `scripts/warm-station-pois.ts`
- `.github/workflows/warm-station-pois.yml`

---

## Finding 1: Amenities route waits up to 30 s per view and never caches a failure

### Symptom

While overpass-api.de is slow or down, every view of a station with no cache row calls Overpass again. It waits up to 30 s (more in practice) and returns `{"pois":[],"cachedAt":null,"fromCache":false,"error":"network_error"}`. The UI then shows the empty state. Real timeouts are labelled `network_error` instead of `timeout`.

### Evidence

Live production calls on 2026-11-01, read-only GET:

```
curl -s -w "\n%{http_code} %{time_total}\n" https://evoyage.duypham.me/api/stations/cmolmt0xkii77gjoh/amenities
# audit:      200 in 37.5s  {"pois":[],"cachedAt":null,"fromCache":false,"error":"network_error"}
# verifier A: 200 in 8.36s, then 7.49s on a repeat call (still fromCache:false, so not cached)
# verifier B: 200 37.189305, same body
```

Timeout error name, checked in Node:

```
node -e "fetch('https://10.255.255.1',{signal:AbortSignal.timeout(500)}).catch(e=>console.log('name:',e.name))"
# name: TimeoutError
```

Code at `64db6f9`:

- `src/lib/station/overpass-client.ts:15` sets `REQUEST_TIMEOUT_MS = 30_000`.
- `overpass-client.ts:96` uses `signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)`.
- `overpass-client.ts:99` checks only `err.name === 'AbortError'`. A `TimeoutError` falls through to `:102` and is reported as `network_error`, so the `'timeout'` kind is never returned.
- `src/app/api/stations/[id]/amenities/route.ts:166-167`: a Stage 1 failure returns `overpassFallback(cached, err)`.
- `route.ts:205-226` (`overpassFallback`): when there is no cached row, it returns an empty body and writes nothing.
- `route.ts:192-196`: the only `upsert` runs on the success path.
- `route.ts:183-187`: a Stage 2 failure is cached as empty, but a Stage 1 failure is not.
- `src/lib/station/overpass-client.test.ts` had no timeout case before this branch.

### Root cause

**Established:**

1. The timeout is 30 s on one public endpoint.
2. A Stage 1 failure with no prior cache writes no negative cache row, so every view retries Overpass.
3. Timeouts are misclassified because the client checks `AbortError` while `AbortSignal.timeout` throws `TimeoutError`.

**External, not a code defect:** Overpass is slow or overloaded. The code defects turn that outage into a slow, repeated failure for every user.

**Correction from a verifier:** the 30 s+ wait only happens when Overpass hangs. When Overpass fails fast (for example a 502 returned in about 1 s), each view still costs one uncached round trip of about 7-8 s and returns empty. A 502 is labelled `network_error` correctly. Only real timeouts are mislabelled.

### Repro

1. Pick any station id with no `StationPois` row.
2. Call it twice while Overpass is degraded:

   ```
   for i in 1 2; do curl -s -w " %{time_total}s\n" https://evoyage.duypham.me/api/stations/cmolmt0xkii77gjoh/amenities; done
   ```

3. Both calls return `fromCache:false` with the full latency. Before a fix, the second call is not faster.

### Regression tests

- `src/lib/station/overpass-client.test.ts` › `queryNearbyPois` › `throws OverpassError(timeout) when the request times out (AbortSignal.timeout -> TimeoutError)`: `it.fails`.
- `src/app/api/stations/[id]/amenities/route.test.ts` › `on Stage 1 Overpass failure with no cache, writes a short-TTL negative cache row`: `it.fails`. It asserts that `upsert` is called and that `expiresAt` is more than 0 and at most 24 h ahead.

The latency itself (how long a slow upstream holds a request) is not unit-tested, because that depends on the timeout value the fix chooses. Verify it manually with the repro above.

### Fix direction

- **`overpass-client.ts`**
  - Treat `err.name === 'TimeoutError'` (and keep `AbortError`) as `'timeout'`.
  - Lower the per-request timeout to about 8 s for the interactive route. The warmer may want a longer budget, so consider making the timeout a parameter rather than one constant shared by both callers.
- **`route.ts` `overpassFallback`**
  - When there is no prior cache row, upsert an empty v2 envelope with a short TTL (for example 1 h).
  - Do not use `CACHE_TTL_DAYS`, or a single outage would hide amenities for 30 days.
  - When a stale row exists, keep serving it. Decide whether to extend its `expiresAt` briefly so you do not hammer Overpass.
- **Gotchas**
  - Fixing the error kind changes the `error` / `staleReason` value the client receives (`network_error` becomes `timeout`). Check whether the UI branches on those strings.
  - A negative-cache row with `rows: []` looks the same as a real "no amenities nearby" result. If the UI needs to tell them apart, add a field to the envelope.
  - Changing the envelope shape means bumping `POIS_SCHEMA_VERSION`.

---

## Finding 2: The Warm Station POIs job is cancelled almost every day and writes a format the route ignores

### Symptom

The daily warmer is cancelled at about 15 min 18 s. Almost no stations get warmed. Even when it completes, the rows it writes count as cache misses in the live route. Worse, it overwrites valid rows the route wrote earlier.

### Evidence

Workflow runs (read-only):

```
gh run list -R duypham9895/evoyage --workflow warm-station-pois.yml --limit 15 --json conclusion,createdAt,databaseId
# 2026-10-18 .. 2026-11-01: 14 x "cancelled" (15m17s-15m21s), 1 x "success" (39754164939, 2026-10-22, 14m48s)
```

- The 2026-10-22 success logged `Done. Warmed 2, empty 2, failed 46.`

Log of the 2026-11-01 run:

```
gh run view 41300513425 -R duypham9895/evoyage --log | grep -E "FAILED|POIs|canceled"
# [1/50] ...: FAILED (network_error) ... [40/50] ...: FAILED (network_error)
# only [23/50] "0 POIs (cached empty)" and [37/50] "1 POIs"
# ##[error]The operation was canceled.   (11:23:15)
```

- The gaps between log lines are either about 3 s (a fast non-OK response plus the 3 s pause) or about 33 s (a 30 s timeout plus the 3 s pause).

Direct Overpass probe, using the same POST body and headers as `overpass-client.ts:85-97`:

- The audit probe and verifier B both got: `502 ... This Overpass API server is currently at capacity. All query workers are busy and the request queue is full ... Retry your request using exponential backoff ... For automated or high-volume use, run a local Overpass API instance`.
- Verifier A got `200`, but only after 33.7 s. That is longer than the 30 s client timeout, so the client would also have failed that request.

Code at `64db6f9`:

- `overpass-client.ts:14` hard-codes one endpoint, `https://overpass-api.de/api/interpreter`.
- `overpass-client.ts:108-117`: every non-OK status except 429 becomes `network_error`, with no retry, backoff or mirror.
- `overpass-client.ts:99`: the TimeoutError misclassification (see Finding 1).
- `.github/workflows/warm-station-pois.yml:20` sets `timeout-minutes: 15`.
- `scripts/warm-station-pois.ts`:
  - `:22` sets `TOP_N = 50` and `:26` sets `REQUEST_PAUSE_MS = 3000`.
  - `:111-114` adds a 30 s back-off on each 429.
  - Worst case: 50 × (30 s timeout + 3 s pause) ≈ 27.5 min, which is more than 15 min.
- `scripts/warm-station-pois.ts:107-108` logs only `err.kind`, never `err.message` or `err.statusCode`, so the CI log cannot show the 502.
- **Cache format mismatch** (found by verifier B):
  - `scripts/warm-station-pois.ts:95-96` writes `poisJson: JSON.stringify(rows)`. That is a bare array of rows with no `schemaVersion` and no `tier`.
  - `route.ts:101-113` (`readCachedRows`) returns `null` for any bare array (`:106`).
  - So every warmed row is a cache miss in the route.
  - The warmer's `upsert` also overwrites any valid `{schemaVersion:2, rows}` row the route wrote earlier. That destroys good cache and the stale fallback at `route.ts:212`.
  - The warmer also lacks the route's drive-tier stage and `dedupePois`.

### Root cause

**Established:**

1. The client depends on a single overloaded public endpoint, with no retry or fallback for 502/503/504.
2. Timeouts are misclassified (as in Finding 1).
3. The time budget cannot fit: worst-case runtime is longer than the 15-minute job timeout, and the script has no deadline of its own, so it is killed instead of exiting with a summary.
4. The logs lack status codes.
5. The warmer duplicates the route's decoration logic but writes the pre-v2 cache format. Even a successful warm run therefore does not help users and actively invalidates good cache rows.

**Hypothesis, not verified:** whether the 502s or the slow 200s dominate. The two verifiers saw different responses at different moments. Both lead to the same failure path.

User-facing empty amenities come from live Overpass failures inside the route (Finding 1). The broken warmer only removes the mitigation.

### Repro

```
# 1. CI history and failure log (read-only)
gh run list -R duypham9895/evoyage --workflow warm-station-pois.yml --limit 15
gh run view 41300513425 -R duypham9895/evoyage --log | grep -E "FAILED|canceled"

# 2. Overpass health, with the client's headers
curl -s -o /dev/null -w "%{http_code} %{time_total}\n" -X POST https://overpass-api.de/api/interpreter \
  -H 'Content-Type: text/plain;charset=UTF-8' -H 'User-Agent: eVoyage/1.0 (+https://evoyage.duypham.me)' -H 'Accept: application/json' \
  --data-binary $'[out:json][timeout:25];\nnode[amenity~"^(restaurant|cafe|fast_food|atm|toilets|fuel|pharmacy)$"](around:500,10.78,106.7);\nout body;'

# 3. Timeout error name
node -e 'fetch("https://example.com",{signal:AbortSignal.timeout(1)}).catch(e=>console.log(e.name))'   # TimeoutError
```

- Do not run `scripts/warm-station-pois.ts` locally against production. It writes to the prod DB.
- The format mismatch is reproduced by the unit test below, with Prisma mocked.

### Regression tests

- `src/lib/station/overpass-client.test.ts` › `queryNearbyPois` › `recovers from a transient 502 (retry with backoff or mirror fallback) and returns POIs`: `it.fails`, using fake timers. Either fix passes it: a retry against the same URL or a second fetch to a mirror.
- `src/lib/__tests__/warm-station-pois.test.ts` › `writes poisJson in the route's schema-versioned envelope ({ schemaVersion: 2, rows[].tier })`: `it.fails`.
- `src/lib/__tests__/warm-station-pois.test.ts` › `logs the Overpass HTTP status code when a station fails`: `it.fails`.
- The timeout-classification test from Finding 1 also covers this finding.
- **Not unit-testable:** the 15-minute job budget versus runtime, and Overpass capacity. These are CI and live-infra behaviour. Verify them with the `gh run` commands above after a fix: runs should end `success` well under 15 min, with a summary line.

The warmer test file sits under `src/lib/__tests__/` (the shared location in the repo convention), not next to the script. Vitest only includes `src/**/*.test.ts`, and the script calls `main()` on import, so the test mocks `@prisma/client` and the Overpass client, then imports the script once per test.

### Fix direction

- **Shared cache module (the most important fix).** Move the route's `decorateWalk`/`decorateDrive`, `envelope()`, `POIS_SCHEMA_VERSION` and the Stage 1/Stage 2 fetch logic into one module, for example `src/lib/station/station-pois.ts`. Have both the route and the warmer use it, so the warmer writes exactly what the route reads. Fixing Overpass reliability alone will not warm anything for users.
- **`overpass-client.ts`**
  - Classify `TimeoutError` as `timeout`.
  - Treat 502/503/504 (and `timeout`) as retryable with bounded exponential backoff.
  - Consider a mirror fallback. The 502 body itself recommends a private instance; `overpass.kumi.systems` is one public option. Check its usage policy first.
  - Keep the interactive route's total budget small. Retries must not push a user request back toward 30 s+.
- **`scripts/warm-station-pois.ts`**
  - Log `err.message` and `err.statusCode`.
  - Add a run deadline below the job timeout (for example 12 min) that stops cleanly and prints the summary.
  - Exit non-zero when most stations fail, so the run shows as `failure` rather than `cancelled`.
  - On failure, do not overwrite a valid existing row.
- **`warm-station-pois.yml`**: revisit `timeout-minutes` and `TOP_N` against the new per-request budget.

---

## Related low-severity items

- **The warmer selects arbitrary stations, not popular ones** (`scripts/warm-station-pois.ts:65-70`). It orders by `lastVerifiedAt` then `scrapedAt`, which can pick obscure household or company chargers instead of the stations users open most. Consider ordering by the popularity aggregate once the warmer works.

## Open questions and what to verify first

1. Is overpass-api.de still answering 502 or >30 s right now? Run the curl in the Finding 2 repro before choosing between retry-only and a mirror or private instance.
2. Does any UI code branch on the `error` / `staleReason` strings (`network_error` vs `timeout`)? Run `grep -rn "staleReason\|network_error" src/components src/app`.
3. How many `StationPois` rows in production are bare arrays written by the warmer? This needs a read-only query, for example `SELECT count(*) FROM "StationPois" WHERE "poisJson" LIKE '[%'`, run by the owner. Do not write.
4. What negative-cache TTL is acceptable to product (1 h suggested)? Does the UI need to show "temporarily unavailable" separately from "nothing nearby"?
5. Is the Overpass usage policy compatible with the traffic, given the "automated or high-volume use" note in the 502 body?

## Verification provenance

- The audit ran on 2026-11-01 against HEAD `bfa3a3b` and live production https://evoyage.duypham.me.
- Each finding was checked by two adversarial verifier agents. Neither refuted any finding. Their corrections are folded in above: the latency range, the 502 vs slow-200 question, and the warmer cache-format defect.
- On this branch, every cited line was re-read at `64db6f9` (origin/main). No line had shifted from the audit, and no finding was dropped.
- The CI run history was re-checked on 2026-11-01.
- Same vendor, same priors: no external verifier ran.
