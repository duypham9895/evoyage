# Mobile Tab Bar Redesign + eVi FAB

**Date:** 2026-05-03
**Author:** Duy (PM) + Claude
**Status:** Approved design — ready for implementation plan
**Scope:** Mobile only (`/plan` route). Desktop sidebar unchanged.

---

## Problem

The mobile bottom-sheet tab bar on `/plan` packs five peer tabs (`eVi`, `Tuyến đường`, `Xe`, `Pin`, `Trạm sạc`) into one row. Five distinct issues compound into "the tab bar feels massive":

1. **Discoverability fail** — On 390px mobile, `overflow-x-auto` clips the leftmost tab (`eVi`), but the scroll affordance is invisible. User believes the visible tabs are the entire navigation.
2. **Ragged label widths** — `Tuyến đường` (12 chars) and `Trạm sạc` (8) vs `Xe` (2) and `Pin` (3) create a ~6:1 width ratio. Visual noise.
3. **Heavy active state** — Solid accent pill + `font-semibold` + `min-h-[44px]` makes the active tab compete with the content panel below it.
4. **Mode mismatch** — `Tuyến đường → Xe → Pin → Trạm sạc` is a sequential planning flow. `eVi` is a cross-context AI assistant. Putting them as five equal peer tabs hides the actual mental model.
5. **Vertical real estate** — Tab bar consumes ~52px of an already-constrained bottom sheet.

## Goal

Reduce visual weight, eliminate horizontal scroll, surface the planning sequence, and give eVi a context-independent entry point — without changing the underlying planning workflow or breaking existing tests.

## Non-goals

- Desktop sidebar redesign (separate concern).
- FeedbackFAB redesign or repositioning.
- URL state schema changes (verified: `activeTab` is not in URL params).
- Vietnamese label rewording (already passed UX writing audit on 2026-05-03).
- New eVi features. The chat panel itself is untouched — only its container changes.

---

## Design

### 1. Tab bar — 4 equal-width segments

Remove `eVi` from `MobileTab`. Remaining 4 tabs render as equal-width segments using `flex-1`, eliminating both the scroll requirement and the ragged-width problem.

**Layout (`MobileTabBar.tsx`):**

```
┌─────────────────────────────────────────────────────────┐
│  Tuyến đường   │   Xe   ▔▔▔   │   Pin   │   Trạm sạc  │
└─────────────────────────────────────────────────────────┘
                       ▲ active = 2px accent underline
```

**Spec:**

| Property | Before | After |
|----------|--------|-------|
| Container classes | `flex gap-1 p-1 ... overflow-x-auto scrollbar-hide` | `flex p-0.5` (no gap, no overflow) |
| Per-segment classes | `shrink-0 ... px-4 py-3 rounded-lg min-h-[44px]` | `flex-1 ... px-2 py-2.5 min-h-[40px]` (no per-segment rounding) |
| Active visual | `bg-accent text-background font-semibold` (filled pill) | `text-foreground font-semibold border-b-2 border-accent` (underline) |
| Inactive visual | `text-muted` | `text-muted` (unchanged) |
| Notification dot | 5px dot after label, before active | 5px dot after label, before active (unchanged) |
| Touch target | 44px | 40px (acceptable for secondary nav per HIG/Material) |

**Type change:**

```ts
// Before
export type MobileTab = 'evi' | 'route' | 'vehicle' | 'battery' | 'stations';

// After
export type MobileTab = 'route' | 'vehicle' | 'battery' | 'stations';
```

**`TABS` constant** drops the `evi` entry. Keyboard cycle (`ArrowLeft`/`ArrowRight` in `plan/page.tsx:364,369`) cycles through the 4 remaining tabs.

### 2. eVi FAB

A circular floating action button gives eVi a persistent, context-independent entry point.

**Component:** `src/components/trip/EViFab.tsx`

**Spec:**

- **Shape:** 56×56 circle, `bg-accent`, text `eVi` in `text-background` `font-semibold` (text-first, no chat icon — per CLAUDE.md "less icons" rule).
- **Position (mobile):** `fixed right-3 bottom-[calc(55vh+64px)] z-[750]`. Stacks above existing `FeedbackFAB` (44×44 at `bottom-[calc(55vh+8px)]`). Math: FeedbackFAB top edge at 52px from sheet → 12px gap → eVi FAB bottom at 64px, top edge at 120px. Right-edge alignment uses `right-3` to match FeedbackFAB.
- **Visibility:** `lg:hidden` (mobile only — desktop has eVi as a sidebar tab). Hidden when `isEViOpen === true` (avoid covering the open sheet).
- **Tap behavior:** `onClick` calls `onOpen` → parent sets `isEViOpen=true`.
- **Accessibility:** `aria-label="Open eVi assistant"` (use `t('evi_fab_label')` — new locale key). Hit area meets 44×44 minimum.

### 3. eVi mobile sheet

Fullscreen overlay container that hosts the existing `<EVi>` component when opened from the FAB.

**Component:** `src/components/trip/EViMobileSheet.tsx`

**Spec:**

- **Container:** `fixed inset-0 z-[800] bg-surface flex flex-col` when open. Slide-up animation (reuse existing `MobileBottomSheet` motion primitive if available, otherwise simple `transform translate-y` transition).
- **Header:** Sticky top bar, ~52px tall, `border-b border-surface-hover`. Title `eVi` left, close button (X) right.
- **Body:** Renders the existing `<EVi>` component as-is. Receives the same `onTripParsed`, `onPlanTrip`, `onFindNearbyStations`, `isPlanning` props that are currently passed in `plan/page.tsx:742`.
- **Dismiss:** Close button (X) in header, `Escape` key. No backdrop dismiss — sheet is fullscreen, no backdrop visible.
- **State preservation:** When `isEViOpen` toggles to `false`, the sheet hides via CSS (`hidden` class), **not** unmount. This preserves chat scroll position, draft message, and conversation history across open/close cycles.

```tsx
// Conceptual structure
<div className={isOpen ? 'fixed inset-0 z-[800] flex flex-col bg-surface' : 'hidden'}>
  <header>...<button onClick={onClose}>X</button></header>
  <div className="flex-1 min-h-0">
    <EVi {...eviProps} />
  </div>
</div>
```

### 4. State refactor in `plan/page.tsx`

```ts
// Before (line 68)
const [activeTab, setActiveTab] = useState<MobileTab>('evi');

// After
const [activeTab, setActiveTab] = useState<MobileTab>('route');
const [isEViOpen, setIsEViOpen] = useState(false);
```

**Default landing tab** changes from `evi` → `route`. Intent: form-first UX. New users land on the planning form; tapping the FAB is the deliberate "ask AI" affordance.

### 5. Call site mapping (8 changes in `plan/page.tsx`)

| Line | Before | After |
|------|--------|-------|
| 68 | `useState<MobileTab>('evi')` | `useState<MobileTab>('route')` + new `useState(false)` for `isEViOpen` |
| 241–246 | `handleOpenEviFromNudge` calls `setActiveTab('evi')` and `setBottomSheetSnap({point:'full'})` | Replace with `setIsEViOpen(true)`; remove snap call |
| 289–293 | `handleBackToChat` calls `setActiveTab('evi')` and snap full | Replace with `setIsEViOpen(true)`; remove snap call |
| 364 | Cycle: `evi → route → vehicle → battery → stations` | Cycle: `route → vehicle → battery → stations` |
| 369 | Reverse cycle including `evi` | Reverse cycle 4 tabs only |
| 692 | `onSwitchToEVi={() => { setActiveTab('evi'); ... }}` | `onSwitchToEVi={() => setIsEViOpen(true)}` |
| 740–742 | `<div className={activeTab === 'evi' ? 'flex flex-col' : 'overflow-y-auto'}>` then conditional `{activeTab === 'evi' && <EVi ... />}` | Remove the `evi` branch from the className condition. Remove the inline `<EVi>` render. The container becomes always `overflow-y-auto`. |
| 809–811 | `{activeTab !== 'stations' && activeTab !== 'evi' && planButton}` (×3) | `{activeTab !== 'stations' && planButton}` (drop `evi` check) |

**New rendering** — add at the end of `plan/page.tsx` JSX (alongside `<FeedbackFAB />`):

```tsx
<EViFab onOpen={() => setIsEViOpen(true)} isOpen={isEViOpen} />
<EViMobileSheet
  isOpen={isEViOpen}
  onClose={() => setIsEViOpen(false)}
  onTripParsed={handleTripParsed}
  onPlanTrip={handleEViPlanTrip}
  onFindNearbyStations={handleFindNearbyStations}
  isPlanning={isPlanning}
/>
```

### 6. Desktop behavior

`useDesktopSidebarTab` is **untouched**. Desktop continues to render eVi as one of the sidebar tabs (because desktop has horizontal space and the FAB pattern is awkward at scale). The mobile/desktop divergence is intentional:

- Mobile: 4-tab bottom sheet + eVi FAB
- Desktop: 3+ sidebar tabs including eVi (existing behavior)

`EViFab` and `EViMobileSheet` are scoped `lg:hidden`. Desktop sees neither.

### 7. EViNudge repositioning

`EViNudge.tsx:65` currently anchors at `bottom-[calc(55vh+64px)] right-3`, which collides directly with the new eVi FAB (also at `bottom-[calc(55vh+64px)] right-3`).

**Change:** Move the nudge to anchor *above* the FAB. Math: eVi FAB top edge at 120px from sheet top → 12px gap → nudge bottom at 132px.

```diff
- className="fixed bottom-[calc(55vh+64px)] right-3 lg:bottom-36 lg:right-6 ..."
+ className="fixed bottom-[calc(55vh+132px)] right-3 lg:bottom-36 lg:right-6 ..."
```

The CTA button inside the nudge already calls `onOpenEvi`, which the parent rewires to `setIsEViOpen(true)`. No nudge content changes.

### 8. Locale cleanup

`tab_evi` keys become unused after removing the eVi tab. Add a new `evi_fab_label` key for the FAB's `aria-label`.

**`src/locales/en.json`:**

```diff
- "tab_evi": "eVi",
+ "evi_fab_label": "Open eVi assistant",
```

**`src/locales/vi.json`:**

```diff
- "tab_evi": "eVi",
+ "evi_fab_label": "Mở trợ lý eVi",
```

The existing `locale-keys.test.ts` will catch any orphaned `tab_evi` references.

---

## Components summary

| File | Status | Purpose |
|------|--------|---------|
| `src/components/layout/MobileTabBar.tsx` | Modify | 4 tabs, flex-1, underline active state, no scroll |
| `src/components/trip/EViFab.tsx` | New | Circular FAB, mobile-only, opens eVi sheet |
| `src/components/trip/EViMobileSheet.tsx` | New | Fullscreen overlay hosting `<EVi>` with state preservation |
| `src/components/trip/EViNudge.tsx` | Modify | Reposition to avoid FAB collision |
| `src/app/plan/page.tsx` | Modify | State split, 8 call site changes, new component renders |
| `src/locales/en.json` | Modify | Remove `tab_evi`, add `evi_fab_label` |
| `src/locales/vi.json` | Modify | Remove `tab_evi`, add `evi_fab_label` |

---

## Test plan

| File | Type | What it verifies |
|------|------|------------------|
| `src/components/layout/MobileTabBar.test.tsx` (new) | Component | Renders exactly 4 tabs (no eVi), active tab has accent underline (not pill), notification dots appear when `hasRoute`/`hasVehicle`, segments use `flex-1` (no horizontal scroll), keyboard `ArrowLeft`/`ArrowRight` cycles through 4 tabs |
| `src/components/trip/EViFab.test.tsx` (new) | Component | Renders circular button with `eVi` text, calls `onOpen` on click, has `lg:hidden` class, hidden via `display:none` when `isOpen=true`, has accessible `aria-label` |
| `src/components/trip/EViMobileSheet.test.tsx` (new) | Component | Renders `<EVi>` content when `isOpen=true`, close button calls `onClose`, `Escape` key calls `onClose`, child `<EVi>` is **not unmounted** when sheet hides (verify via component instance ref or test ID persistence) |
| `src/components/trip/EViNudge.test.tsx` (existing) | Component | No assertion changes — callback contract unchanged. Verify the existing test still passes after position class change. |
| `e2e/bilingual.spec.ts` (update) | E2E | If the test currently clicks the `eVi` tab text, replace with FAB selector (`[aria-label="Open eVi assistant"]` or its localized form) |
| `src/lib/__tests__/locale-keys.test.ts` (auto) | Auto | Catches any leftover `tab_evi` reference in code; passes once cleanup done |

**Coverage target:** new components must reach the project's 80%+ baseline. The `<EVi>` component's existing tests do not need updating — only its container changed.

---

## Risks & mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Sheet open/close unmounts `<EVi>`, losing chat history | High if not handled | Use CSS `hidden` toggle, not conditional render. Asserted in `EViMobileSheet.test.tsx`. |
| FAB collides with FeedbackFAB at certain viewports | Medium | Calculated stacking: `bottom-[calc(55vh+72px)]` vs `bottom-[calc(55vh+8px)]` = 64px gap. Verify visually on 375px and 414px mobile widths during implementation. |
| Default tab change (`evi`→`route`) confuses returning users | Low | The form panel is the visually expected default for a "trip planner." Existing users were always one tap away from form anyway. |
| Keyboard cycle bug from removing `evi` from cycle | Medium | Unit test in `MobileTabBar.test.tsx` covers cycle. |
| EViNudge position collision after FAB lands | Medium | Spec explicitly moves nudge to `bottom-[calc(55vh+132px)]`. Visual QA during implementation. |
| FAB obstructs map interaction (e.g., zoom controls, station markers) | Medium | FAB is `right-4`, map controls already at `left-4`. Verify no station marker tap area conflict during E2E. |

---

## Implementation order (suggested)

1. Create `EViFab.tsx` + test (isolated, no integration risk).
2. Create `EViMobileSheet.tsx` + test (isolated, mock `<EVi>` if needed).
3. Refactor `MobileTabBar.tsx` (remove eVi, change layout) + new test.
4. Update `plan/page.tsx` — state split, 8 call site changes, render new components.
5. Reposition `EViNudge.tsx`.
6. Locale cleanup (`tab_evi` removal, `evi_fab_label` add).
7. Update `e2e/bilingual.spec.ts` if needed.
8. Run full test suite; verify `npm test` and `npx next build` green.
9. Visual QA on mobile widths 375/390/414.

---

## Verification criteria

Implementation is complete when:

- [ ] `npm test` passes (current 813+ tests + new component tests).
- [ ] `npx next build` succeeds with no TypeScript errors.
- [ ] Mobile `/plan` route shows 4 equal-width tabs with no horizontal scroll.
- [ ] Active tab shows underline, not filled pill.
- [ ] eVi FAB visible bottom-right on mobile, hidden on desktop.
- [ ] Tapping FAB opens fullscreen eVi sheet; close button returns to previous state.
- [ ] eVi chat history preserved across one or more close/open cycles.
- [ ] EViNudge does not visually overlap eVi FAB.
- [ ] `setActiveTab('evi')` no longer appears anywhere in the codebase (`grep` returns 0 matches).
- [ ] No `tab_evi` references remain in code or locales.
- [ ] Visual check on 375px, 390px, 414px viewports — no clipping, no overlapping FABs.
