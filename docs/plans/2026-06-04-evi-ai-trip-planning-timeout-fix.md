# eVi AI Trip Planning Timeout Fix Plan

Date: 2026-06-04

## Problem

The AI trip-planning flow on `https://evoyage.duypham.me/plan` fails during a common multi-turn conversation:

1. User asks: `Kế hoạch đi Đà Lạt ngày mai`
2. eVi asks for start location.
3. User answers: `từ vị trí hiện tại`
4. Browser sends a second `POST /api/evi/parse` request with conversation history, GPS coordinates, and accumulated trip params.
5. Production returns `503` with `service_unavailable` after about 8 seconds.

Expected behavior: eVi should use the user's GPS location as the start, preserve Đà Lạt as the destination, and continue asking for the next missing field, usually vehicle.

## Confirmed Evidence

- First-turn production request succeeds: `POST /api/evi/parse` with `Kế hoạch đi Đà Lạt ngày mai` returned `200` in about `6.82s`.
- Second-turn production request fails deterministically: same route with history, `message: "từ vị trí hiện tại"`, `userLocation`, and `accumulatedParams.end` returned `503` in about `8.39s` and `8.50s`.
- Vercel production logs for failed requests show: `[eVi] parseTrip failed (unexpected): Request was aborted.`
- `src/lib/evi/minimax-client.ts` calls `callLLM` with `timeoutMs: 8000`.
- `src/lib/evi/llm-module.ts` creates an `AbortController` and aborts after the configured timeout.
- OpenAI SDK throws `APIUserAbortError` with message `Request was aborted.` when a provided signal is aborted.
- Current infrastructure-error classifier handles `AbortError`, but not OpenAI SDK's `APIUserAbortError`, so fallback to MiniMax does not run.
- Vercel production env contains both `OPENAI_API_KEY` and `MINIMAX_API_KEY`, and logs show OpenAI succeeds for nearby first-turn requests, so missing provider env is not the root cause.

## Root Cause

Primary root cause: the second-turn LLM parse exceeds the hard 8-second timeout and is aborted by application code.

Secondary root cause: the abort error shape emitted by the OpenAI SDK is not recognized as fallback-eligible infrastructure failure, so provider fallback is bypassed and the route returns `503`.

Architectural observation: this exact second-turn case should not require an LLM call at all. The user says "current location", and the client already provides `userLocation` plus accumulated destination. The server can resolve this deterministically.

## Goals

- Exact failed production flow returns `200`, not `503`.
- Current-location follow-up with GPS and accumulated destination bypasses LLM.
- OpenAI SDK aborts fall back to MiniMax instead of surfacing as unexpected errors.
- First-turn trip parsing, station search, invalid-request handling, and rate limiting remain unchanged.
- Scope remains surgical: no UI redesign, no schema change, no env change, no DB migration.

## Non-Goals

- Do not replace the provider chain.
- Do not rewrite the eVi chat state machine.
- Do not change user-facing copy except if tests expose an existing mismatch.
- Do not add broad NLP intent infrastructure.
- Do not edit Vercel env vars.

## Files To Touch

- `src/app/api/evi/parse/route.ts`
- `src/app/api/evi/parse/route.test.ts`
- `src/lib/evi/llm-module.ts`
- `src/lib/evi/llm-module.test.ts`
- `src/lib/evi/minimax-client.ts`

## Implementation Plan

### 1. Add Route Regression Test For Exact Production Payload

File: `src/app/api/evi/parse/route.test.ts`

Add a test that constructs the failed second-turn request:

```json
{
  "message": "từ vị trí hiện tại",
  "history": [
    { "role": "user", "content": "Kế hoạch đi Đà Lạt ngày mai" },
    { "role": "assistant", "content": "Bạn muốn xuất phát từ đâu ạ?" }
  ],
  "userLocation": { "lat": 10.804067355, "lng": 106.7142873 },
  "previousVehicleId": null,
  "accumulatedParams": {
    "start": null,
    "end": "Thành phố Đà Lạt, Phường Xuân Trường - Đà Lạt, Tỉnh Lâm Đồng, Việt Nam",
    "vehicleBrand": null,
    "vehicleModel": null,
    "currentBattery": 80
  }
}
```

Expected assertions:

- Response status is `200`.
- `tripParams.startSource === "geolocation"`.
- `tripParams.startLat` and `tripParams.startLng` match the supplied `userLocation`.
- `tripParams.end` is preserved or geocoded from accumulated destination.
- `tripParams.currentBattery === 80`.
- `followUpType` asks for the next missing field, likely `free_text` for vehicle.
- `error === null`.

### 2. Add Deterministic Current-Location Resolver

File: `src/app/api/evi/parse/route.ts`

Before calling `parseTrip`, detect this narrow case:

- `userLocation` exists.
- `accumulatedParams?.end` exists.
- Message means "current location" or "here".

Suggested narrow matcher terms:

- `vị trí hiện tại`
- `vi tri hien tai`
- `ở đây`
- `o day`
- `current location`
- `my location`
- `here`

Implementation shape:

- Add helper: `isCurrentLocationReply(message: string): boolean`.
- Normalize message with `.toLowerCase().trim()` and Vietnamese diacritic folding if already available locally; otherwise keep a tiny explicit phrase list.
- Add helper or inline branch to create a `MinimaxTripExtractionResult`-compatible object.
- Return extraction object with:
  - `startLocation: null`
  - `endLocation: accumulatedParams.end`
  - `vehicleBrand: accumulatedParams.vehicleBrand`
  - `vehicleModel: accumulatedParams.vehicleModel`
  - `currentBatteryPercent: accumulatedParams.currentBattery`
  - `isTripRequest: true`
  - `isStationSearch: false`
  - `stationSearchParams: null`
  - `isOutsideVietnam: false`
  - `missingFields`: include `vehicle` if no known vehicle; do not include `start_location` because GPS is present.
  - `followUpQuestion`: vehicle prompt if vehicle is missing.
  - `confidence: 1`

Then continue through existing route logic so reverse geocode, destination geocode, vehicle resolution, and response shaping stay centralized.

Important constraint: only bypass LLM when `userLocation` and accumulated destination exist. If either is missing, keep existing LLM path.

### 3. Add Test That LLM Is Not Called For Current-Location Follow-Up

File: `src/app/api/evi/parse/route.test.ts`

Use existing `parseTrip` mock.

Expected assertions:

- `parseTrip` is not called.
- Response is successful.
- Start source is `geolocation`.
- Destination and battery carry forward.

This test prevents future regressions where the deterministic path is accidentally removed.

### 4. Fix OpenAI Abort Classification

File: `src/lib/evi/llm-module.ts`

Current classifier:

```ts
if (err.name === 'AbortError') return true;
```

Required behavior:

- Treat OpenAI SDK `APIUserAbortError` as infrastructure/fallback-eligible.
- Treat message `Request was aborted.` as infrastructure/fallback-eligible.

Suggested surgical change:

```ts
if (err.name === 'AbortError' || err.name === 'APIUserAbortError') return true;
if (/Request was aborted/i.test(err.message)) return true;
```

Keep existing checks for `429`, `5xx`, network failures, empty response, thinking-only response, and missing API key.

### 5. Add LLM Module Regression Test For OpenAI SDK Abort

File: `src/lib/evi/llm-module.test.ts`

Add test:

- Mock OpenAI primary provider to reject with:

```ts
Object.assign(new Error('Request was aborted.'), { name: 'APIUserAbortError' })
```

- Mock MiniMax fallback provider to return valid JSON.
- Assert result succeeds.
- Assert constructor/provider order is OpenAI then MiniMax.
- Assert warning log shows fallback from OpenAI to MiniMax if existing tests already inspect logs.

### 6. Raise Parse Timeout Modestly

File: `src/lib/evi/minimax-client.ts`

Current:

```ts
timeoutMs: 8000,
```

Recommended:

```ts
timeoutMs: 12_000,
```

Reason:

- Production successful first turns already take about 5-7s.
- 8s leaves too little headroom for multi-turn prompts.
- `12_000` improves reliability while staying well inside `maxDuration = 60` for the route.
- Deterministic current-location branch removes the exact hot-path LLM call, so this is a safety improvement, not the only fix.

If tests or production telemetry still show frequent aborts after deploy, consider `15_000` as a follow-up, not first move.

## Test Plan

### Focused Tests

Run:

```bash
npm test -- src/app/api/evi/parse/route.test.ts src/lib/evi/llm-module.test.ts
```

Must pass:

- Exact current-location second-turn route regression.
- No-LLM deterministic branch test.
- OpenAI `APIUserAbortError` fallback test.
- Existing parse route tests.
- Existing provider-chain tests.

### Full Required Checks

Run before commit:

```bash
npm test
npx next build
```

Expected:

- Unit/integration suite passes.
- Next build passes with no TypeScript errors.
- Locale key test stays green.

## Production Verification

After deploy, replay exact second-turn request against production:

```bash
curl -sS -w 'status=%{http_code} time=%{time_total}\n' \
  -X POST https://evoyage.duypham.me/api/evi/parse \
  -H 'content-type: application/json' \
  --data '{"message":"từ vị trí hiện tại","history":[{"role":"user","content":"Kế hoạch đi Đà Lạt ngày mai"},{"role":"assistant","content":"Bạn muốn xuất phát từ đâu ạ?"}],"userLocation":{"lat":10.804067355,"lng":106.7142873},"previousVehicleId":null,"accumulatedParams":{"start":null,"end":"Thành phố Đà Lạt, Phường Xuân Trường - Đà Lạt, Tỉnh Lâm Đồng, Việt Nam","vehicleBrand":null,"vehicleModel":null,"currentBattery":80}}'
```

Expected:

- `status=200`
- Response time materially below 8s for current-location branch.
- Response contains `tripParams.startSource: "geolocation"`.
- Response preserves destination and battery.
- No new `Request was aborted.` errors for this exact path in Vercel logs.

Also verify in browser:

1. Open `https://evoyage.duypham.me/plan`.
2. Send `Kế hoạch đi Đà Lạt ngày mai`.
3. Allow location if prompted.
4. Send `từ vị trí hiện tại`.
5. Confirm eVi continues instead of showing service unavailable.

## Rollout Notes

- No database migration.
- No Vercel env update.
- No feature flag required because deterministic branch is narrow and covered by tests.
- Monitor Vercel logs for:
  - `[eVi] parseTrip failed`
  - `[llm] provider=openai failed=Request was aborted. — falling back to minimax`
  - `/api/evi/parse` `503` count.

## Rollback Plan

Rollback is low risk:

1. Revert deterministic current-location branch if it causes incorrect parsing.
2. Keep abort-classification fix unless it causes provider-loop issues; it is generally correct for fallback semantics.
3. Revert timeout from `12_000` to `8000` only if route latency/cost materially increases.

No data cleanup is required.

## Risks And Mitigations

- Risk: matcher over-classifies unrelated messages as current-location replies.
  - Mitigation: only activate when `userLocation` and `accumulatedParams.end` are both present.
- Risk: deterministic branch skips LLM when user intended to change destination with word "here".
  - Mitigation: keep phrase list narrow and require existing destination.
- Risk: longer timeout increases perceived wait.
  - Mitigation: exact current-location path bypasses LLM; timeout only improves fallback safety for other turns.
- Risk: MiniMax fallback has different output quirks.
  - Mitigation: existing `stripProviderQuirks` and schema validation remain in place; add abort fallback test only.

## Acceptance Criteria

- Exact production repro returns `200` locally and after deploy.
- Current-location follow-up uses GPS start without LLM.
- OpenAI SDK abort falls back to MiniMax in unit test.
- No regression in existing eVi parse tests.
- `npm test` passes.
- `npx next build` passes.
