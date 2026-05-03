# Trip Calculation — Input Lock & Loading State

**Status**: Approved 2026-05-03
**Owner**: Duy Phạm (PM) · Implementation: Claude Code
**Trigger**: PM observation — during trip calculation, the Plan-Trip button is disabled but every other input that affects the result (origin, destination, vehicle, battery) remains editable. This creates race conditions and UI/result mismatches.

## 1. Problem

In `src/app/plan/page.tsx` (lines 94, 377, 437, 526), `isPlanning` already disables the Plan-Trip button. But the input components rendered in the same view remain interactive:

- `TripInput` (origin / destination + waypoints) — lines 653, 759
- `BrandModelSelector` (vehicle) — lines 685, 775
- `BatteryStatusPanel` (starting battery %) — lines 693, 781

A user can therefore edit any of these mid-calculation. When the in-flight request returns, the result is computed for the *previous* input state, but the displayed inputs are the *new* state. The user sees a plan that doesn't match what's on screen.

Additional problems:
- The current planning fetch in `handlePlanTrip` (line 377 area) does **not** use `AbortController`, so a stale request that returns later can still call `setTripPlan(...)` after the user has moved on.
- No cancel affordance — once a calc starts, the user has no way out except reloading the page (which destroys all input state they just typed).
- No timeout — if the underlying fetch hangs (network drop, third-party API stall, mobile background-tab orphan), the UI is locked in `isPlanning=true` forever.

## 2. Goal

While a trip calculation is in flight, all inputs that affect the result must be locked. The lock must be:

1. **Visible** — user understands the system is working, not frozen
2. **Reversible** — user has a Cancel affordance with a non-destructive escape
3. **Recoverable** — automatic timeout fallback so the UI cannot get permanently stuck

After completion, cancellation, or timeout, all inputs return to fully editable state.

## 3. Solution

### 3.1 Lock scope — what gets disabled

**Locked during `isPlanning`:**
- `TripInput` (both mobile + desktop instances)
- `BrandModelSelector`
- `BatteryStatusPanel`
- Plan-Trip button (already done — keep as-is)
- EVi chat input (to prevent re-triggering a second concurrent plan via voice/text)
- `SampleTripChips` (one-tap demo trips would also race)

**NOT locked:**
- Locale toggle, theme, navigation tabs, map zoom/pan
- Any view-only or app-shell controls

### 3.2 Visual lock pattern

- Disabled inputs render with `opacity-60` + `cursor-not-allowed` + `aria-disabled="true"`
- A loading overlay with a spinner + label *"Đang tính lộ trình..."* covers the input panel area
- Tap on a disabled input → inline hint or toast: *"Đang tính lộ trình, vui lòng chờ..."* (don't silently swallow the tap; the user already thinks something is broken)

Per `feedback_less_icons.md`, the spinner is the only icon allowed here — it's a functional status indicator, not decoration.

### 3.3 Cancel behavior

- A **Cancel** button replaces the Plan-Trip button while `isPlanning === true`
- On Cancel:
  - Call `abortController.abort()` to kill the in-flight request
  - Clear the timeout timer
  - Set `isPlanning = false`
  - **Revert to the previous `tripPlan` if one exists**, otherwise leave it `null`
  - Restore input editability

The revert behavior matches the user's stated preference (option a): *less destructive than a full reset, lets the user resume from a known-good state*.

### 3.4 Timeout fallback

- Constant: `TRIP_CALC_TIMEOUT_MS = 10_000`
- When the timer fires:
  - Abort the in-flight request (same path as Cancel)
  - Show a non-blocking error: *"Tính lộ trình lâu hơn bình thường. Thử lại?"* with a Retry button
  - Revert to previous `tripPlan` if one exists
  - Restore input editability

**Why 10s and not "wait forever":** A normal calc (Mapbox routing + station fetch + cost calc) completes in <5s. A response that hasn't returned in 10s usually means the request will never return (server hang, network drop, orphaned mobile request). Without a timeout, the only escape is page reload, which wipes the user's typed input state — that is strictly worse UX. Tunable later via analytics.

### 3.5 Pipeline scope (v1)

- Lock spans the **whole** calculation pipeline (route + stations + ETA + cost)
- Not per-stage — simpler to reason about, lower risk of stale-stage bugs
- Future iteration (out of scope for v1): if analytics show drop-off during long calcs, we can break the lock per-stage and stream partial results

### 3.6 AbortController plumbing

- The planning fetch (currently in `handlePlanTrip`, `src/app/plan/page.tsx:377`) gains an `AbortController` instance
- Pass `controller.signal` into `fetch()`
- Store the controller in a `useRef` so Cancel and the timeout handler can both abort it
- On unmount, abort any in-flight request to avoid leaked state updates

## 4. Implementation plan

1. Add `disabled?: boolean` prop to `TripInput`, `BrandModelSelector`, `BatteryStatusPanel`, `SampleTripChips`, and the EVi input area (audit each component for whether it already accepts a disabled prop)
2. In `src/app/plan/page.tsx`:
   - Add `useRef<AbortController | null>(null)` for the in-flight controller
   - Add `useRef<ReturnType<typeof setTimeout> | null>(null)` for the timeout
   - Add `cancelPlanning()` callback (handles abort + clear timer + revert + setIsPlanning(false))
   - Wire `disabled={isPlanning}` to all locked inputs (both mobile and desktop instances)
   - Replace Plan-Trip button area with conditional render: Plan button when idle, Cancel button + spinner overlay when `isPlanning`
3. In the planning fetch:
   - Create new AbortController, store in ref
   - Set timeout, store in ref
   - Pass `signal` to fetch
   - On success / error / abort: clear timeout, clear controller ref, setIsPlanning(false)
4. Add timeout error toast/banner with Retry action

## 5. Locale keys (vi/en — both files must match per `locale-keys.test.ts`)

| Key | Vietnamese | English |
|---|---|---|
| `plan.calculating_label` | Đang tính lộ trình... | Calculating route... |
| `plan.cancel` | Huỷ | Cancel |
| `plan.calc_timeout_message` | Tính lộ trình lâu hơn bình thường. Thử lại? | Calculation took longer than expected. Try again? |
| `plan.calc_timeout_retry` | Thử lại | Retry |
| `plan.locked_input_hint` | Đang tính lộ trình, vui lòng chờ... | Calculating, please wait... |

## 6. Tests required (per CLAUDE.md mandatory testing rules)

**Unit:**
- `TripInput`, `BrandModelSelector`, `BatteryStatusPanel` render disabled state correctly when `disabled` prop is `true`
- Tap/click on disabled input does not fire change handlers

**Integration:**
- During `isPlanning`, all four input components are disabled
- Cancel button click aborts the request, reverts to previous tripPlan, and re-enables inputs
- Timeout fires after `TRIP_CALC_TIMEOUT_MS`, aborts the request, shows the error message, re-enables inputs
- Stale fetch responses returning *after* abort do not call `setTripPlan` (verified via mock with delayed resolve)

**E2E (Playwright):**
- User clicks Plan Trip → verifies all inputs are visibly disabled
- User clicks Cancel during calculation → verifies inputs re-enable and previous result is preserved
- (Optional) Simulate slow API → verify timeout message appears

## 7. Out of scope (deferred)

- **Per-stage progressive lock** (3.5) — needs analytics first to justify
- **Streaming partial results** (route shown first, stations fill in) — separate spec if pursued
- **Server-side calc cancellation** — `AbortController` only cancels the client; the server may keep computing. Acceptable for v1 because (a) compute is cheap, (b) results are simply discarded client-side
- **Optimistic local re-calc** — recalculating cost/ETA locally when only battery changes (avoids round-trip) — separate optimization spec

## 8. Decisions log

- **2026-05-03**: Cancel reverts to previous `tripPlan` (option a), not full input clear (option b). Less destructive; user can resume from known-good state.
- **2026-05-03**: Timeout = 10s for v1. Tune via analytics once instrumented.
- **2026-05-03**: Whole-pipeline lock for v1. Per-stage deferred until analytics show abandonment during long calcs.
- **2026-05-03**: Spinner is the only icon allowed in the loading overlay (functional status indicator per `feedback_less_icons.md`).
