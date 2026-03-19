# QA & Design Review Report — Mobile UX Sprint

**Date:** 2026-03-19
**QA Team:** Senior QA Engineers (code-level + visual)
**Design Team:** Head of Product Design + Senior UIUX

---

## Part 1: QA Functional Test Results

### Devices Tested (Visual)
| Device | Viewport | Status |
|--------|----------|--------|
| iPhone 14 Pro | 390x844 | PASS |
| iPhone SE | 375x667 | PASS |
| Pixel 7 | 412x915 | PASS |
| Galaxy S23 | 360x780 | PASS |

### Test Cases Executed

| TC | Screen | Test | Result |
|----|--------|------|--------|
| TC-001 | Landing | Hero renders, badge readable, stats show 150+/63/15+ | PASS |
| TC-002 | Landing | Section spacing tighter on mobile (py-12) | PASS |
| TC-003 | Landing | Vehicle cards compact (no car silhouettes) | PASS |
| TC-004 | Landing | Footer renders once, no duplication | PASS |
| TC-005 | /plan | Logo links to "/" | PASS |
| TC-006 | /plan | Language toggle VI↔EN, all text updates | PASS |
| TC-007 | /plan | Tab labels single-line on all devices (360px-430px) | PASS |
| TC-008 | /plan | Disabled CTA shows "Nhập điểm đi..." hint | PASS |
| TC-009 | /plan | After route set: hint changes to "Chọn xe để tiếp tục" | PASS |
| TC-010 | /plan | Vehicle selected: CTA enabled, hint disappears | PASS |
| TC-011 | /plan | Vehicle detail card auto-scrolls into view | PASS |
| TC-012 | /plan | Route calculation shows spinner + "Đang tính..." | PASS |
| TC-013 | /plan | Trip results: no floating share button overlapping | PASS |
| TC-014 | /plan | Inline share button appears in trip results | PASS |
| TC-015 | /plan | Feedback modal opens/closes correctly | PASS |
| TC-016 | /plan | Battery tab: slider, presets, safety factor all work | PASS |

### Bugs Found & Fixed During QA

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| BUG-001 | **CRITICAL** | Duplicate ShareButton on mobile — two inline share buttons visible | Removed duplicate `<ShareButton>` outside bottom sheet in mobile layout |
| BUG-002 | HIGH | `handlePlanTrip` had stale closures — `waypoints` and `isLoopTrip` missing from deps | Added to useCallback dependency array |
| BUG-003 | MEDIUM | Swipe callbacks created new functions every render | Extracted to `useCallback` handlers |
| BUG-004 | MEDIUM | Auto-scroll setTimeout not cleaned up on unmount | Added cleanup return in useEffect |
| BUG-005 | MEDIUM | PlaceAutocomplete debounce timer not cleared on unmount | Added cleanup useEffect |
| BUG-006 | LOW | Battery slider floating label stuck if pointer cancelled | Added `onPointerCancel` handler |

### Remaining Warnings (Non-blocking)

| # | File | Issue | Risk |
|---|------|-------|------|
| W-01 | MobileBottomSheet | SSR hydration mismatch from `window.innerHeight` in style | Low — cosmetic, recovers on client |
| W-02 | ShareButton | No focus trap in modal | Low — a11y improvement for keyboard users |
| W-03 | MobileTabBar | Missing ARIA tab pattern (`role="tablist"`) | Low — a11y improvement |
| W-04 | PlaceAutocomplete | Missing ARIA combobox pattern | Low — a11y improvement |
| W-05 | BatteryStatusPanel | `vehicleForCalc` recreated every render (should useMemo) | Low — performance micro-optimization |
| W-06 | LandingClient | requestAnimationFrame chain not cancellable | Low — React 18 handles silently |
| W-07 | ShareButton | URL param polling runs on every render (no dep array) | Low — intentional pattern |

---

## Part 2: Head of Product Design Review

### What's Working Excellently

1. **Bottom sheet + 3-tab architecture** — Intuitive, native-feeling, clean information hierarchy
2. **Inline share button** — No more floating FAB blocking content. Clean placement after trip results
3. **Contextual disabled hints** — Users always know why they can't proceed
4. **Cross-device consistency** — Tested on 360px-430px range, zero layout breaks
5. **Vehicle detail auto-scroll** — Selection feels responsive and complete
6. **Tab swipe gestures** — Natural iOS/Android pattern, correct threshold prevents conflicts with scrolling
7. **Battery slider floating label** — Nice touch that shows value during drag
8. **StatCounter** — Reliable animation with reduced-motion respect

### Design Feedback for Future Iterations

#### Priority: Should Do (Next Sprint)

| # | Feedback | Impact |
|---|----------|--------|
| DF-01 | **Add ARIA tab pattern** — `role="tablist"` on container, `role="tab"` on buttons, `aria-selected` on active tab. Critical for VoiceOver/TalkBack users | Accessibility |
| DF-02 | **Add focus trap to modals** — Share modal and Feedback modal both allow keyboard tabbing outside. Use `focus-trap-react` or manual implementation | Accessibility |
| DF-03 | **Autocomplete ARIA combobox** — Add `role="combobox"`, `aria-expanded`, `aria-controls` to follow WAI-ARIA pattern | Accessibility |
| DF-04 | **Haptic on swipe tab change** — Currently swipe switches tabs silently. Add `hapticLight()` in the swipe callback for tactile confirmation | Delight |
| DF-05 | **Skeleton loading for trip results** — When route is calculating, show pulsing skeleton cards in the results area instead of nothing | Polish |

#### Priority: Nice to Have (Future)

| # | Feedback | Impact |
|---|----------|--------|
| DF-06 | **Map tap → minimize sheet** — Tapping the map should collapse the bottom sheet to peek state so users can see the full route | UX |
| DF-07 | **Swipe animation** — Add a subtle slide animation when tab content switches via swipe (currently instant) | Delight |
| DF-08 | **Pull-to-refresh** — On the trip results, pull down to recalculate with same parameters | UX |
| DF-09 | **Bottom sheet auto-expand on results** — When trip plan loads, auto-snap to half if currently at peek | UX |
| DF-10 | **Onboarding tooltip** — First-time users: show a brief "Swipe to switch tabs" tooltip that auto-dismisses | Discoverability |

### Senior UIUX Visual Notes

| # | Observation | Suggestion |
|---|-------------|------------|
| UI-01 | Disabled CTA hint text is `text-xs text-muted` — might be too subtle | Consider `text-sm` and slightly brighter color |
| UI-02 | Inline share button uses outlined style — lower visual weight than "Xem lịch trình" | Good hierarchy — primary CTA stays dominant |
| UI-03 | Battery quick-select buttons look cramped on 360px | Consider showing 4 buttons instead of 6 on narrow screens |
| UI-04 | Vehicle search input could benefit from a search icon prefix | Small polish for visual clarity |
| UI-05 | The peek state (120px) now shows tab bar but content is hidden — could show a one-line summary | "HCM → Vũng Tàu · VF 8 Plus" in muted text below tabs |

---

## Summary Scorecard (Post-QA)

| Category | Before | After | Notes |
|----------|--------|-------|-------|
| Information Architecture | 8/10 | 9/10 | Contextual hints + swipe |
| Touch Targets | 7/10 | 9/10 | Larger autocomplete, proper slider |
| Visual Hierarchy | 6/10 | 9/10 | No overlap, clean inline share |
| Navigation | 5/10 | 8.5/10 | Logo link + swipe gestures |
| Loading States | 4/10 | 7.5/10 | Spinner + disabled hints |
| Mobile Polish | 6/10 | 9/10 | Haptics, floating label, safe area |
| Accessibility | - | 7/10 | Missing ARIA patterns (DF-01 to DF-03) |
| **Overall Mobile Readiness** | **6/10** | **9/10** | **Ship-ready for mobile launch** |

---

## QA Sign-Off

- [x] All P0 test cases pass on 4 devices
- [x] All P1 test cases pass on 4 devices
- [x] No visual regressions on desktop (1024px+)
- [x] Build passes cleanly (no TypeScript errors)
- [x] 1 critical bug found and fixed (duplicate ShareButton)
- [x] 5 additional bugs found and fixed
- [ ] Accessibility audit pending (DF-01 to DF-03)

**Verdict: APPROVED for mobile launch** with accessibility improvements recommended for next sprint.
