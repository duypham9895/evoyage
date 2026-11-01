# Bug: precautionary-stop E2E fails whenever it runs in parallel; CI retries hide it

Group: `p3-e2e-precautionary-reopen-flake` · Date: 2026-11-01 · Checked at `64db6f92e0792aa4643b2ba76958ff0843b80567`

## Summary

The only E2E test for "dismissed precautionary stop survives a saved-trip reopen" does not do its job.
With more than one Playwright worker it fails every time we tried it locally. Run alone, it passes.
CI runs `--workers=2` with `retries: 2`, so a retry that happens to run alone turns it green.
Users are not shown to be affected. The reopen flow does have one latent product gap, described below.

## Severity & priority

- Severity: medium. A regression net for a shipped flow (precautionary stop persistence, ADR-0006 area) gives no signal.
- Priority: P3. Test-harness defect. No user impact has been shown.

## Affected features

- Trip notebook, "Mở lại" / Open: `handleReplanFromNotebook` in `src/app/plan/page.tsx`.
- Precautionary stop dismissal persistence (E2E coverage only).
- E2E harness: `e2e/helpers/app.ts` (`mockAPIs`), `e2e/precautionary-stop.spec.ts`.

---

## Finding 1: `precautionary-stop.spec.ts` hangs after reopening a saved trip

### Symptom

Test: `e2e/precautionary-stop.spec.ts:21`, "dismisses a Tết precautionary stop and persists it through the saved notebook".
It times out at line 49, `page.waitForResponse(... '/api/route' ...)`, after clicking "Mở lại" (line 46).
At failure, the page shows:
- the "Chuyến đi" tab selected
- start and end filled (HCMC to Đà Lạt)
- the vehicle list stuck on "Đang tải..."
- "Tính lộ trình" disabled, with "Chọn xe để tiếp tục"

### Evidence (re-run on 2026-11-01 in the worktree at 64db6f9; Desktop Chrome only)

| Command | Result |
|---|---|
| `npx playwright test e2e/precautionary-stop.spec.ts --project="Desktop Chrome" --retries=0 --repeat-each=3` (cold dev server, parallel workers) | 3/3 failed, same timeout at spec:49 |
| same, single run, warm dev server | 1/1 passed |
| same with `--repeat-each=4` (parallel, warm server) | 4/4 failed |
| same with `--repeat-each=3 --workers=1` (serial, warm server) | 3/3 passed |

The original audit saw the same thing. The full run passed only on retry #2. `--repeat-each=2` alongside `e2e/desktop-tabs.spec.ts` failed 2/2.

What the trace of a failing run shows (`test-results/precautionary-stop-*-repeat2/trace.zip`):
- Network log: 8 API entries, all **before** `page.reload()` (spec:42). These are the vehicle list, two nominatim calls, the vehicle search, `POST /api/route`, narrative and amenities. **After the reload, not one API request completes.** That includes the vehicle-list fetch, which explains "Đang tải...".
- Action log: after the reload, not one `route.fulfill` call runs. The `page.route` mocks are never answered for the reloaded document.
- Console: one `[HMR] connected` and two `[Fast Refresh] rebuilding` / `done` pairs, all during the first page load.
- Dev server log for the same run (`npm run dev -- -p 3001`) has only `GET /` and `GET /plan?...&vid=vf8-plus` lines. No `/api/*` request reached the server.

Code path (line numbers at 64db6f9):
- `src/app/plan/page.tsx:675-711`: `handleReplanFromNotebook` sets start and end, then at `:690-696` **awaits** `fetch('/api/vehicles?id=…')`. That fetch has no timeout or abort. Only after it settles does `:709` call `setAutoPlanRequestId`. If the fetch never settles, the auto-plan never fires and `/api/route` is never requested.
- `src/app/plan/page.tsx:1137-1140` (desktop `onReplan`): this switches to the `planTrip` tab. The snapshot shows "Chuyến đi" selected, so `onReplan` **did** run. The click hit the notebook button, not a Next dev-tools button.
- `src/app/plan/page.tsx:795-799`: `canPlan` needs `activeVehicle`. The vehicle is still null because the awaited fetch never returned, which is why the button shows "Chọn xe để tiếp tục".
- `src/components/trip/BrandModelSelector.tsx:28-51`: the list fetch also never resolves after the reload.
- `playwright.config.ts:8`: `retries: 2`. `.github/workflows/deploy.yml:108`: `npx playwright test --workers=2`.

### Root cause

- **Established:**
  - The test hangs because, after `page.reload()`, `fetch('/api/vehicles?id=…')` in `handleReplanFromNotebook` never settles. The Playwright mocks do not answer it, and it never reaches the dev server.
  - This happens reliably under parallel workers and not with `--workers=1`.
  - The auto-plan is chained behind that await, so `/api/route` is never called.
- **Not established (hypotheses, in the order to check):**
  1. Playwright `page.route` interception after `page.reload()` stalls under load against the Turbopack dev server. The Fast Refresh rebuilds seen in the trace are one candidate trigger. Test: run the spec against `npm run build && npm start` (set `PLAYWRIGHT_BASE_URL`) with parallel workers. If it goes green, the cause is dev-server specific.
  2. Something on the reloaded page holds the connection or JS queue: SSE, an HMR websocket, or a long-running effect. Test: add `page.on('request')` / `page.on('requestfailed')` logging around the reload in a scratch copy of the spec.
- **Ruled out as the cause of this hang:** the harness defects below.
  - Defect (a), the list-shape mock, would give a *truthy* object, so `canPlan` would turn true.
  - Defect (b), the loose locator: `onReplan` demonstrably ran.

### Repro

```bash
# in a checkout of 64db6f9 with node_modules installed; nothing else on :3001
npx playwright test e2e/precautionary-stop.spec.ts --project="Desktop Chrome" --retries=0 --repeat-each=4   # expect 4 failed
npx playwright test e2e/precautionary-stop.spec.ts --project="Desktop Chrome" --retries=0 --repeat-each=3 --workers=1   # expect 3 passed
npx playwright show-trace test-results/precautionary-stop-Option--6db0e--through-the-saved-notebook-Desktop-Chrome-repeat1/trace.zip
```

### Regression test

Not unit-testable. The hang depends on a browser, the Next dev server and worker concurrency. The repro above is the regression check: the spec must pass with `--repeat-each=4 --retries=0` on parallel workers.

### Fix direction

- First find out which layer stalls (hypotheses 1 and 2). Do not just add `test.describe.configure({ mode: 'serial' })` or more retries. That hides the problem again.
- Whatever the cause, CI should not be able to pass this test by retrying. Options:
  - run E2E with `--retries=0` for this spec, or
  - fail the job on any `flaky` result (Playwright reports these separately). `--fail-on-flaky-tests` exists in recent Playwright versions; check the installed version first.
- Product hardening, which is a separate decision: give the `?id=` fetch in `handleReplanFromNotebook` (`page.tsx:691`) a timeout or abort. On failure, let the auto-plan proceed or show an error instead of waiting forever. Today a slow or hung `/api/vehicles?id=` in production would leave the user with a silently disabled Plan button. That is a hypothesis about real users. It has not been observed in prod.

---

## Finding 2: the vehicles mock returns the list shape for `?id=` lookups (harness defect a)

### Symptom

`mockAPIs` answers every `**/api/vehicles**` request with `e2e/fixtures/vehicles.json` (`{vehicles: [...], count: 2}`). That includes single-vehicle lookups.

### Evidence

- `e2e/helpers/app.ts:39-45`: one handler, with no branch on the `id` query parameter.
- `src/app/api/vehicles/route.ts:33-65`: the real API returns a single `EVVehicleData` object for `?id=`, or 404.
- Consumers that store the response as the selected vehicle: `src/app/plan/page.tsx:290-296` (URL restore) and `:690-696` (notebook reopen). In E2E they store `{vehicles, count}` as `selectedVehicle`. Its `.id` is undefined, so URL sync drops `vid` and the replanned trip uses a non-vehicle. The spec still passes in serial runs because the route mock ignores the vehicle. The spec therefore does not prove that the vehicle survives a reopen.

### Root cause

Established: the mock was written for the list endpoint only.

### Repro

`npx vitest run src/lib/__tests__/e2e-vehicles-mock.test.ts`

### Regression test

`src/lib/__tests__/e2e-vehicles-mock.test.ts` › "returns a single vehicle object for an ?id= lookup, like GET /api/vehicles?id=". It is marked `it.fails` and is currently green because the assertion fails. A companion `it` guards the list shape.

The test drives `mockAPIs` with a fake `Page` and `Route`, so no browser is needed. It sits under `src/` because `vitest.config.ts` only includes `src/**`.

### Fix direction

In `e2e/helpers/app.ts`, branch on `new URL(route.request().url()).searchParams.get('id')`. Return the matching fixture entry, or 404 when there is none. Then flip `it.fails` to `it`.

Consider also asserting in `precautionary-stop.spec.ts` that "VinFast VF 8 Plus" is shown after the reopen. That would make the spec actually cover vehicle restore.

---

## Finding 3: the `/Open|Mở lại/` locator also matches Next dev-tools buttons (harness defect b)

### Evidence

`e2e/precautionary-stop.spec.ts:46` uses `getByRole('button', { name: /Open|Mở lại/ }).first()`. In `next dev`, the page also renders "Open Next.js Dev Tools" and "Open issues overlay". Only `.first()` and DOM order keep the test on the notebook button.

In the failing runs the correct button was clicked: `onReplan` switched the tab. So this defect is fragile, but it is **not** the cause of Finding 1.

### Regression test

Not unit-testable. It depends on the dev overlay DOM.

### Fix direction

Scope the locator to the notebook. Either use `getByRole('button', { name: /^(Open|Mở lại)$/ })`, or use a locator inside the notebook list container (`src/components/trip/TripNotebook.tsx`).

---

## Related low-severity items (not investigated here)

- `eslint.config.mjs` `globalIgnores` does not list `.worktrees/**`, `.claude/**` or `.vercel/**`. As a result, `npm run lint` reports about 33k problems locally.
- `react-hooks/set-state-in-effect` error at `src/hooks/useRouteNarrative.ts:176`.
- Observed while preparing this note:
  - `src/app/plan/page.effects.test.tsx` › `geolocationSupported` (2 tests) fails in this worktree **with or without** the new test file. It was not caused by this branch and was not investigated.
  - The worktree's `node_modules` is a symlink to the main checkout. Next prints a Turbopack root-directory warning for it.

## Open questions / what to verify first

1. Does the parallel failure reproduce against a production build (`npm run build && npm start`, `PLAYWRIGHT_BASE_URL=http://localhost:3001`)? If not, the problem is in the dev server or HMR and the product is fine.
2. Do Desktop Safari, Desktop Firefox and the Mobile projects show the same behaviour? Only Desktop Chrome was run. The spec also skips every other project at line 7.
3. Does CI's Playwright report list this test as `flaky` on recent green runs? Download the `playwright-report` artifact from a `deploy.yml` run on `main`.
4. Should the reopen fetch get a timeout in product code (Finding 1, product hardening)? That is a product decision.

## Verification provenance

- The audit findings were checked by 2 adversarial verifier agents on 2026-11-01, against HEAD `bfa3a3b` and live prod. These are Claude agents (same vendor, same priors). No external verifier ran.
- Re-confirmed for this note at `64db6f92e0792aa4643b2ba76958ff0843b80567` by re-reading the cited code and re-running the spec locally (results in the Evidence table). Two things are new to this note:
  - the serial-passes / parallel-fails split
  - the trace showing that no mock fulfilment and no server hit happen after the reload
