# React Hooks `set-state-in-effect` Cleanup

**Status**: Proposed (2026-05-04)
**Owner**: Duy Phạm (PM) · Implementation: Claude Code
**Trigger**: Pre-commit lint hook blocked the commit for the "Use my location" CTA fix (`531a653`). The fail surfaced a Next 16 lint rule (`react-hooks/set-state-in-effect`) now enforced as an error. The fix shipped with one targeted `eslint-disable` block; this spec scopes the broader cleanup so we stop accruing more disables.

## 1. Problem

Next 16's bundled ESLint config promotes `react-hooks/set-state-in-effect` from warning to error. The rule flags any `setState(...)` call placed synchronously in a `useEffect` body — a pattern React's docs themselves now discourage because it causes a wasted render before the "real" state lands.

Today the codebase has **6 production violations across 5 files** plus **1 just-silenced violation in `NearbyStations.tsx`**. None are bugs in the strict sense (the app works), but every future edit to these files will hit the pre-commit hook, and the natural reaction (more `eslint-disable`) accumulates technical debt and trains us to silence rules without thinking.

## 2. Goal

- Bring the codebase to **zero** `react-hooks/set-state-in-effect` violations under default Next 16 lint settings.
- Preserve all current behavior — no UX regressions, no hydration warnings, no test failures.
- Remove the temporary `eslint-disable` block in `NearbyStations.tsx` added by `531a653`.

## 3. Scope (the 7 spots)

Each violation falls into one of three idiomatic React 19 patterns. Categorized so similar fixes can be batched.

### Category A — External-store sync (2 spots)

`useState` + `useEffect` reading a browser API on mount. The idiomatic React 19 fix is `useSyncExternalStore` (with an SSR snapshot). Eliminates the post-mount setState entirely and behaves correctly under Concurrent Rendering.

| File | Line | Today | Fix |
|---|---|---|---|
| `src/hooks/useIsMobile.ts` | 12 | `setIsMobile(mql.matches)` after mount | Migrate to `useSyncExternalStore` subscribed to `matchMedia`. SSR snapshot returns `false` (matches existing hydration-safe default). |
| `src/lib/map-mode.tsx` | 24, 29 | Read `localStorage` on mount → `setModeState(...)` | Migrate to `useSyncExternalStore` subscribed to `storage` event. SSR snapshot returns `'osm'`. Preserves the legacy `'google' → 'osm'` migration as a one-time write inside the snapshot reader. |

### Category B — Derived state from props (4 spots across 3 files)

State that mirrors a prop or another piece of state. Idiomatic fix is to compute during render (often via `useMemo`) or to use a `key` prop to reset child state. Some need an Effect Event (`useEffectEvent` from React 19) when there's a side effect tied to the change.

| File | Line | Today | Fix |
|---|---|---|---|
| `src/components/map/MapLocateButton.tsx` | 54 | `setButtonState('loading')` inside effect that reacts to `loading` prop | Drop `buttonState` state; derive `'default'` / `'loading'` / `'located'` / `'error'` directly from `loading`/`error`/`latitude`/`longitude` props during render. The 3-second auto-reset to `'default'` becomes a `useEffect` whose only job is `setTimeout` cleanup, with the timer-driven flag stored in a separate `useState` (allowed: setState in callback, not effect body). |
| `src/components/trip/ShareButton.tsx` | 73 | `setVisible(false)` when `tripPlan` becomes null | Replace `visible` state with derived computation: `tripPlan != null && delayElapsed`. Track `delayElapsed` via the existing `setTimeout`. |
| `src/components/trip/ShareButton.tsx` | 100 | Effect with no dep array invalidates short-URL cache when params change | Replace with a `useMemo` keyed on `getCurrentParams()` that returns the cached URL or `null`. |
| `src/hooks/useRouteNarrative.ts` | 162 | `setState(INITIAL_STATE)` when `tripPlan` becomes null | Use `key={tripPlan?.tripId}` on the consuming component to reset, OR derive: track `lastTripId` via ref and return `INITIAL_STATE` from the hook when `tripPlan == null`. |

### Category C — Async fetch loading flip (1 spot)

The "set loading=true; await fetch; set loading=false" pattern. Three viable approaches; pick one consistently.

| File | Line | Today | Options |
|---|---|---|---|
| `src/components/NearbyStations.tsx` | 365–366 (currently `eslint-disable`) | `setFetchLoading(true); setFetchError(null);` then `fetch(...)` | (1) Adopt **SWR** (~5 KB gzipped, already a peer of Next ecosystem) and replace the effect with `useSWR(`/api/stations?bounds=${bounds}`)`. (2) Adopt **TanStack Query v5** (richer DX, ~12 KB gzipped, more dependencies). (3) Roll a tiny in-house `useFetch` hook that flips loading inside the async callback (no library). |

**Recommendation**: SWR. Lightest, idiomatic for Next, gives us deduplication + revalidation we don't have today. `useFetch` in-house is fine for one call site but we have ~5 other fetch effects (in `EVi.tsx`, `StationDetailExpander.tsx`, etc.) that would also benefit, so investing in SWR pays back.

## 4. Sequencing

Three small commits, each independently testable. Total estimated effort: half a day.

1. **Commit 1 — Category A** (`useIsMobile`, `map-mode`). Lowest risk: pure mechanical migration to `useSyncExternalStore`. Verified by existing `useIsMobile.test.ts` plus a new test for the localStorage migration path.
2. **Commit 2 — Category B** (`MapLocateButton`, `ShareButton`, `useRouteNarrative`). Medium risk: each touches user-visible behavior (button state machine, share modal visibility, narrative reset). Requires careful regression testing — every existing test for these files must stay green, and we should add a test for "tripPlan transitions from non-null → null → non-null".
3. **Commit 3 — Category C** (`NearbyStations` fetch + remove the temporary `eslint-disable`). Pulls in SWR as a dependency. Requires updating 1138-test suite mocks for `useSWR`. Optional follow-up: migrate `EVi.tsx`, `StationDetailExpander.tsx`, etc. as a separate phase.

## 5. Risks

- **Concurrent rendering edge cases**: `useSyncExternalStore` with a wrong SSR snapshot causes hydration mismatches. Both Category A migrations need explicit SSR snapshots that match what we render today.
- **`MapLocateButton` state machine**: derived state must produce identical button-color and icon transitions. The 3-second auto-reset and 5-second error-reset timers both have UX implications — visual regression test recommended.
- **SWR adoption ripples**: introducing SWR for one call site sets a precedent. If we don't migrate the other fetch effects in a follow-up phase, we'll have two patterns for the same problem (worse than one consistent disable).
- **No production bug today**: all 7 violations represent suboptimal-but-working code. If a higher-priority feature lands first, this can wait — but the blocking pre-commit hook means it should land within the next 1-2 sprints.

## 6. Success Criteria

- `npx eslint 'src/**/*.{ts,tsx}'` reports **zero** `react-hooks/set-state-in-effect` violations.
- The `eslint-disable` block in `NearbyStations.tsx` (lines 367–371 of `531a653`) is removed.
- `npm test` stays at **1138+** passing tests with no skipped or quarantined cases.
- `npx next build` succeeds with no new warnings.
- Manual QA on `/plan`: mobile/desktop breakpoint switching (Cat A), share button reveal/hide on trip plan/replan (Cat B), nearby stations fetch on radius change (Cat C).

## 7. Out of Scope

- Migrating the **other** fetch effects (`EVi.tsx`, `StationDetailExpander.tsx`, `useSpeechInput.ts`, etc.) to SWR. Tracked as a follow-up phase once SWR has proven itself in `NearbyStations`.
- Suppressing the rule globally in `eslint.config.mjs`. Considered and rejected — the rule is correct and the violations are small enough to fix properly.
- Refactoring the dual-source `initialLocation` / `useGeolocation` pattern in `NearbyStations`. Working as designed; orthogonal to this cleanup.
