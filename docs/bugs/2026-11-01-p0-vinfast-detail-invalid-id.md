# P0: VinFast station detail rejects almost every real station id (INVALID_ID)

Date: 2026-11-01 · Code at `64db6f92e0792aa4643b2ba76958ff0843b80567` (origin/main) · Prod: https://evoyage.duypham.me

## Summary

In trip results, tapping "Station details" on almost any VinFast stop shows "temporarily unavailable" and locks the button for a 30 s cooldown. The detail API rejects the station id before looking it up, because its id regex needs 20-36 characters and the VinFast crawler writes 17-character ids. The full-detail, cache and stale-cache tiers never run in prod. A second, latent bug: once the first is fixed, a stream that ends without a terminal event leaves the expander spinning forever.

## Severity & priority

| # | Finding | Severity | Priority |
|---|---|---|---|
| F1 | Id guard rejects 17-char crawler ids (INVALID_ID) | Critical (one verifier pair said critical, the duplicate pair said high) | P0 |
| F2 | Client hangs in loading state if the SSE stream ends without `done`/`error` | Medium (verifiers split: medium / low) | Fix together with F1, because fixing F1 makes this path reachable |

The audit filed F1 twice (from two audit areas). The two are the same bug and are merged here as F1. Nothing was dropped: both findings still hold at `64db6f9`.

## Affected features

- `GET /api/stations/[id]/vinfast-detail` (SSE)
- `StationDetailExpander` in the trip summary (`src/components/trip/TripSummary.tsx:1111`)
- `VinFastStationDetail` cache table (never filled with real detail, because the scrape tier is unreachable)

Trip planning itself still works.

---

## F1: Id guard rejects the 17-char ids the VinFast crawler generates

### Symptom

Any VinFast stop in the trip summary -> "Station details" -> "temporarily unavailable" plus a 30 s retry cooldown. HTTP 400, SSE body `{"stage":"error","code":"INVALID_ID"}`.

### Evidence

Code at `64db6f9`:

- `src/app/api/stations/[id]/vinfast-detail/route.ts:29`:
  `if (!/^[a-z0-9]{20,36}$/.test(stationId))` returns 400 INVALID_ID. It runs before the rate limit and before `prisma.chargingStation.findUnique`.
- `scripts/crawl-vinfast-stations.ts:197`:
  `const id = existingId ?? \`c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}\`;`
  That is `c` + 8 base36 timestamp chars + at most 8 random chars = **at most 17 chars** (can be shorter if the random string is short). The row is written by raw SQL INSERT (around line 214), so Prisma's `@default(cuid())` never runs.
- `scripts/crawl-vinfast-stations.ts:364` uses the same generator for `VinFastStationDetail` ids. The route does not validate those, so it is not part of this bug, but any future id check on that table would hit the same problem.
- `src/components/trip/TripSummary.tsx:1111` renders `<StationDetailExpander stationId={station.id} ...>`. `src/components/trip/StationDetailExpander.tsx:262` fetches `/api/stations/${stationId}/vinfast-detail`; `:266-270` turns `!res.ok` into the error message plus cooldown.
- `git log -S'{20,36}' -- 'src/app/api/stations/[id]/vinfast-detail/route.ts'` -> `5190f6b security: comprehensive hardening across all API endpoints and infra`. Later commits on the file do not change the regex.
- No test file existed for this route before this branch.

Live (read-only GETs, observed 2026-11-01 by the audit and both verifiers):

```
curl -sN https://evoyage.duypham.me/api/stations/cmolmt0xkii77gjoh/vinfast-detail
-> data: {"stage":"error","code":"INVALID_ID"}      (HTTP 400; station has entityId 28896)

curl -sN https://evoyage.duypham.me/api/stations/cmolmt3fd59hvxmep/vinfast-detail
-> data: {"stage":"error","code":"INVALID_ID"}      (HTTP 400)

curl -s 'https://evoyage.duypham.me/api/stations?bounds=10.7319,106.6551,10.8219,106.7467'
-> id lengths Counter({17: 390, 25: 6}); (17, VinFast): 390, (25, VinFast): 3, (25, EVPower): 3
```

Hanoi box: 231 of 265 VinFast ids are under 20 chars. A live `POST /api/route` HCM -> Da Lat returned stop id `cmolmt2522x8ea2j7` (17 chars, VinFast).

Reported by the audit, not re-run by the verifiers (no DB access): read-only prod query found 25,553 VinFast rows with 17-char ids vs 315 with 25-char ids, and `count(fetchedAt > epoch) = 0` of 24,872 `VinFastStationDetail` rows. The 25-char VinFast rows that do pass the guard all have `entityId = null`, so they only ever get the basic tier.

### Root cause

**Established.** The input-validation regex added in `5190f6b` assumes Prisma cuid ids (25 chars). The VinFast crawler inserts rows through raw SQL with its own id generator that produces at most 17 chars, so every crawler-created station fails the guard. Both verifier pairs confirmed the mechanism in code and on prod.

### Repro

1. `curl -s 'https://evoyage.duypham.me/api/stations?bounds=10.7319,106.6551,10.8219,106.7467'` and take any VinFast station id (17 chars).
2. `curl -sN https://evoyage.duypham.me/api/stations/<id>/vinfast-detail` -> 400 INVALID_ID.
3. UI: plan HCM -> Da Lat, open a VinFast stop, tap station details -> error plus 30 s cooldown.

Locally: `npx vitest run 'src/app/api/stations/[id]/vinfast-detail/route.test.ts'`.

### Regression test

`src/app/api/stations/[id]/vinfast-detail/route.test.ts` ::
`GET /api/stations/[id]/vinfast-detail — id validation > serves detail for a 17-char crawler-generated VinFast station id` (`it.fails`).

It mocks only Prisma, the rate limiter, the entity resolver (returns `entityId: null`, so the route takes the basic-detail path) and the VinFast client. With `it.fails` flipped to `it` it fails with `expected 'data: {"stage":"error","code":"INVALI…' not to contain 'INVALID_ID'`. Two control tests in the same file pass today and must keep passing: a 25-char cuid is served, and `../etc/passwd` is rejected as INVALID_ID.

### Fix direction

- Change the guard in `src/app/api/stations/[id]/vinfast-detail/route.ts:29` to accept the real id shapes. The lower bound must be well under 17, because crawler ids can be shorter than 17 (for example `^[a-z0-9]{10,36}$`). The other option is to keep only a charset/max-length check and rely on `findUnique` -> 404 NOT_FOUND. The id only reaches a parameterised Prisma `findUnique`, so any `[a-z0-9]` id is safe.
- Keep the charset restriction. The control test for `../etc/passwd` guards it.
- Optional: make the crawler use cuid-length ids for new rows. That alone does not fix the ~25k existing rows, so the route change is still required. Do not rewrite existing ids: they are referenced from other tables and shared trip URLs.
- After the fix, the scrape tier (impit -> Playwright) runs in prod for the first time in a long while. Watch function duration and VinFast/Cloudflare blocking, and fix F2 in the same change.

---

## F2: Station-detail client hangs if the SSE stream ends without a terminal event

### Symptom

If the response stream closes cleanly after a progress event (`fetching`, `retrying`, ...) without `done` or `error`, the skeleton keeps spinning, the button reads "loading" and stays disabled until the page is reloaded.

### Evidence

- `src/components/trip/StationDetailExpander.tsx:277-319`: `while (true) { const { done, value } = await reader.read(); if (done) break; ... }`. After the loop nothing checks that a terminal stage arrived. `stage` stays at the last progress value.
- `:247` `isStreaming` is true for connecting/fetching/retrying/parsing; `:252` `if (isStreaming) return;` blocks any retry; `:335` disables the button.
- Only the outer `catch` (`:320-325`) sets error + cooldown, and it runs only when `read()` rejects.
- Server side: `route.ts:7` `maxDuration = 25`. The scrape path has an impit race of 5 s (`src/lib/vinfast/vinfast-client.ts:218`), a Playwright `goto` timeout of 12 s (`src/lib/vinfast/vinfast-browser.ts:61`) and an untimed `page.evaluate` fetch (`vinfast-browser.ts:84`). There is no overall deadline below `maxDuration`.
- One verifier reproduced the hang with a jsdom component test (stream emits `fetching` then closes; button still disabled after 3 s).

### Root cause

- **Established:** the client treats end-of-stream as success and never checks for a terminal event.
- **Hypothesis (unverified):** that a Vercel `maxDuration` kill produces a *clean* EOF. One verifier argued a killed function more likely aborts the chunked response, which makes `read()` reject and lands in the existing catch (error + cooldown, no hang). On every path the route controls, it emits `done` or `error` before closing. So the real-world trigger is unproven; the client gap is real and cheap to close.
- Not reachable in prod today, because F1 rejects the request before the stream starts.

### Repro

`npx vitest run src/components/trip/StationDetailExpander.test.tsx`. The test mocks `fetch` to return a 200 `ReadableStream` that sends `data: {"stage":"fetching"}\n\n` and closes.

### Regression test

`src/components/trip/StationDetailExpander.test.tsx` ::
`StationDetailExpander — SSE stream handling > leaves the loading state with an error when the stream ends without a terminal event` (`it.fails`).

Flipped to `it` it fails with `Unable to find an element with the text: station_detail_temp_unavailable`. The control test `shows the error + retry cooldown when the server sends an error event` passes today.

### Fix direction

- Client: after the read loop, if no `done`/`error` event was seen, set `stage = 'error'`, the unavailable message and the 30 s cooldown. Track this with a local variable in the handler, not by reading `stage` state (it is stale inside the callback).
- Server: wrap Tiers 1-2 in an overall deadline (for example 20 s, under `maxDuration = 25`) that always falls through to Tier 3/4 (`done` with stale/basic detail) or `error`. Give the `page.evaluate` fetch its own timeout.

---

## Related low-severity items

- `vinfast-detail/route.ts:37` rate limit (`20/min/IP`) uses `checkRateLimit` without a Redis limiter, so it is enforced per serverless instance only. This endpoint can launch Playwright/Chromium and hit a Cloudflare-protected upstream, so after F1 is fixed the weak limit matters more. Reported by two audit areas; not verified separately in this group.

## Open questions / what to verify first

1. Do other routes reject crawler ids with a different id check? `grep -rn '{20,36}' src/app/api` at `64db6f9` matches only `vinfast-detail/route.ts:29`, but other shapes of id validation were not searched.
2. Re-run the prod DB counts (17-char vs 25-char VinFast ids; `VinFastStationDetail` rows with real `fetchedAt`) read-only, to size the impact and to have a baseline for after the fix.
3. Once F1 is fixed, does the scrape tier actually succeed from Vercel (impit / Playwright, Cloudflare)? If it mostly fails, users get the basic tier, which is still better than an error.
4. What does a Vercel `maxDuration` kill look like to the browser: clean EOF or aborted stream? This decides whether F2 is live or only hardening.

## Verification provenance

- Audit of eVoyage on 2026-11-01 against HEAD `bfa3a3b` and live prod. Each finding was checked by 2 adversarial verifier agents (Claude, same vendor, same priors; no external verifier ran). F1 (both copies): 4/4 not refuted. F2: 2/2 not refuted, severity split medium/low.
- Re-confirmed by reading the cited code at `64db6f92e0792aa4643b2ba76958ff0843b80567` on branch `bug/p0-vinfast-detail-invalid-id`. Line numbers above are for that commit. Live prod was not re-queried for this note; the live outputs quoted above are from the audit and verifiers.
