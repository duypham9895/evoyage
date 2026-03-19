# Mobile UX Audit — Design Specification & Implementation Plan

**Date:** 2026-03-19
**Audited by:** Head of Product Design
**Devices tested:** iPhone 14 Pro (390x844), iPhone SE (375x667)
**Screens reviewed:** Landing page, Trip Planner (/plan) — Route/Vehicle/Battery tabs, Trip Results, Feedback Modal, Share flow

---

## Team Assignments

| Phase | Team | Owner | Deliverable |
|-------|------|-------|-------------|
| Phase 1 | Senior Design / UIUX | Design Lead | Figma mockups, interaction specs, redlines |
| Phase 2 | Senior SWE | Frontend Lead | Implementation across all tickets |
| Phase 3 | QA | QA Lead | Test execution, regression, sign-off |

---

## Current State Summary

**Overall Mobile Readiness: 6/10**

The app has a strong architectural foundation — bottom sheet + tab bar is the right pattern for mobile EV trip planning. However, several P0/P1 issues block a polished mobile launch. Fixing these would move the score to 8-9/10.

**Screenshots reference:** `/tmp/evoyage-mobile-*.png` (captured during audit)

---

# PHASE 1: Senior Design / UIUX Team

## Design Brief

### Design Principles for This Sprint

1. **Thumb-zone first** — All primary actions must be reachable with one-handed use (bottom 60% of screen)
2. **Progressive disclosure** — Show only what's needed at each step, reveal details on demand
3. **Zero dead-ends** — Every screen must have a clear next action and a way to go back
4. **Native feel** — Match iOS/Android interaction patterns (swipe, haptics, transitions)

---

### TICKET D-001: Share Button Repositioning (P0)

**Problem:**
The floating "Chia sẻ chuyến đi" button overlaps the destination input field and bottom sheet content on all mobile viewports. It blocks text readability and accidental taps conflict with form input.

**Current behavior:**
- Green FAB positioned `fixed bottom-right` with `z-index` above bottom sheet
- Always visible once trip plan loads, even while user is editing inputs

**Design requirement:**

Option A (Recommended): **Inline button inside trip results**
- Place "Chia sẻ chuyến đi" as a full-width secondary button below the trip summary card
- Style: outlined button, `border-[var(--color-accent)]`, icon + text
- Only visible when trip results are showing
- Remove floating FAB entirely on mobile

Option B: **Bottom sheet footer integration**
- Add a fixed footer bar inside the bottom sheet (above safe area)
- Layout: `[Xem lịch trình (primary)]  [Share icon (secondary)]`
- Footer stays visible regardless of scroll position within the sheet

**Specs:**
- Touch target: minimum 48x48px
- Spacing: 16px from edges, 12px between buttons
- Animation: fade-in when trip results load (200ms ease-out)

**Files to reference:** `src/components/ShareButton.tsx` (lines 55-68)

---

### TICKET D-002: Primary CTA Visibility (P0)

**Problem:**
"Xem lịch trình" button is pinned to the very bottom edge, partially hidden by the safe area on notched iPhones. On iPhone SE it's barely tappable.

**Current behavior:**
- Button at absolute bottom of bottom sheet
- No padding accounting for safe area insets
- No visual separation from content above

**Design requirement:**
- Add sticky footer inside bottom sheet with gradient fade-out overlay (20px, from transparent to `--color-surface`)
- Button must clear safe area: `padding-bottom: env(safe-area-inset-bottom) + 16px`
- Minimum button height: 52px (current looks ~44px)
- Full-width button with rounded corners (12px radius)
- Disabled state: reduce opacity to 0.4, show subtle tooltip explaining what's missing ("Chọn xe để tiếp tục")

**Specs:**
```
┌─────────────────────────────────┐
│  ~~~~ gradient fade (20px) ~~~  │
│  ┌───────────────────────────┐  │
│  │    Xem lịch trình         │  │  ← 52px height, 16px horizontal margin
│  └───────────────────────────┘  │
│  ▒▒▒▒ safe area inset ▒▒▒▒▒▒▒  │
└─────────────────────────────────┘
```

**Files to reference:** `src/components/MobileBottomSheet.tsx`, `src/app/plan/page.tsx`

---

### TICKET D-003: Landing Page Duplicate Render (P0)

**Problem:**
Full-page screenshot shows the entire landing content rendered twice — hero, stats, features, FAQ all appear again at the bottom of the page.

**Investigation needed:**
- Check if `<LandingPageContent />` is mounted both in `page.tsx` and in a layout or wrapper component
- Currently `page.tsx:54` mounts `<LandingPageContent />` — check if `LandingWrapper` also renders children that duplicate content

**Design requirement:**
- Single render of all landing sections
- Verify footer appears only once at the bottom
- Remove any duplicate component mounts

**Files to reference:** `src/app/page.tsx`, `src/components/landing/LandingPageContent.tsx`, `src/components/landing/LandingClient.tsx`

---

### TICKET D-004: Stat Counter Animation Broken (P0)

**Problem:**
The stats section shows `0+ Trạm sạc`, `0 Tỉnh thành`, `0+ Dòng xe` instead of actual numbers (150+, 63, 15+). The IntersectionObserver-based counter animation likely doesn't trigger properly, or fires before the component is visible.

**Current behavior:**
- `StatCounter` component uses IntersectionObserver with `threshold: 0.15`
- Counter animates from 0 to target value using `requestAnimationFrame`
- On the full-page render, the observer may not fire due to duplicate content or SSR hydration timing

**Design requirement:**
- Counters must show final values on mobile within 1 second of becoming visible
- Fallback: if animation hasn't triggered within 2 seconds of page load, snap to final value
- Consider: skip animation entirely on `prefers-reduced-motion`
- The numbers should be visible without scrolling on the first viewport (currently they are)

**Files to reference:** `src/components/landing/LandingClient.tsx` (line 160, `StatCounter`)

---

### TICKET D-005: Tab Label Wrapping on Small Screens (P1)

**Problem:**
On iPhone SE (375px), "Tuyến đường" wraps to 2 lines in the tab bar, making it 2x taller and visually broken. "Xe" and "Pin" are fine since they're short.

**Current behavior:**
- Tab uses `text-sm` with no truncation or overflow handling
- Tab container: `flex-1` per tab, `gap-1`, `p-1`

**Design requirement:**

Option A (Recommended): **Shorter labels**
- Route tab: "Tuyến đường" → "Lộ trình" (shorter, same meaning)
- Or: Use icon-only below 390px width, icon+label above

Option B: **Responsive icon-only mode**
- Below 400px: show only icons (📍 🚗 🔋) with active tab showing label
- Above 400px: show icon + label for all tabs

**Specs:**
- Tab bar height: fixed 44px (never wrap to 2 lines)
- Text: `text-xs` on `<400px`, `text-sm` on `≥400px`
- Active tab: icon + label always visible
- Inactive tabs: icon only on small screens

**Files to reference:** `src/components/MobileTabBar.tsx`

---

### TICKET D-006: Bottom Sheet Peek State Improvement (P1)

**Problem:**
At peek height (72px), users only see the drag handle and tab bar. No useful information is visible — users don't know what to do next.

**Design requirement:**
- Increase peek height from 72px to 120px
- Show a context-aware summary line below the tab bar:
  - Empty state: "Nhập điểm đi & điểm đến để bắt đầu"
  - Route set: "HCM → Vũng Tàu"
  - Vehicle set: "HCM → Vũng Tàu · VF 8 Plus"
  - Results ready: "95.7 km · 1h29m · Đủ pin"
- Summary text: `text-xs text-[var(--color-muted)]`, single line, truncated with ellipsis

**Specs:**
```
┌─────────────────────────────────┐
│         ── handle ──            │  ← 4px × 40px, rounded
│  [📍 Lộ trình] [🚗 Xe] [🔋 Pin]│  ← 44px tab bar
│  HCM → Vũng Tàu · VF 8 Plus   │  ← 20px context summary
└─────────────────────────────────┘
   Total: ~120px peek height
```

**Files to reference:** `src/components/MobileBottomSheet.tsx` (SNAP_HEIGHTS on line 14)

---

### TICKET D-007: Vehicle Selection Feedback (P1)

**Problem:**
After selecting a vehicle, the detail card (price, battery, range, charging power) appears below the list but is partially off-screen. No scroll or animation draws attention to it.

**Design requirement:**
- After vehicle selection: auto-scroll the vehicle list so the selected item + detail card are fully visible
- Add a brief success toast/snackbar (1.5s auto-dismiss):
  - Text: "VF 8 Plus — 447 km range"
  - Position: top of bottom sheet content
  - Style: `bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/30`
- Selected vehicle should have a checkmark icon (✓) in addition to the border highlight

---

### TICKET D-008: Logo as Home Link (P1)

**Problem:**
The "⚡ EVoyage" logo in the header is not tappable. Users on `/plan` have no way to navigate back to the landing page.

**Design requirement:**
- Wrap logo in `<Link href="/">`
- Add `cursor-pointer` and subtle hover/active state
- On `/plan` page: consider adding a small `←` back arrow before the logo on mobile

**Files to reference:** `src/components/Header.tsx` (lines 22-26)

---

### TICKET D-009: Map vs Content Balance (P2)

**Problem:**
On initial load, the map takes ~55% of the viewport. The user's actual task (filling route info) is below the fold. First-time users may not realize there's a bottom sheet to interact with.

**Design requirement:**
- Start bottom sheet at `half` snap (55% viewport) instead of `peek` on first visit
- After route is planned and results are showing: auto-snap to `half` to show results
- When user taps on the map: snap to `peek` to maximize map visibility
- Add a subtle bounce animation on the drag handle on first visit (3 bounces, then stop)

**Files to reference:** `src/components/MobileBottomSheet.tsx` (line 30, `initialSnap`)

---

### TICKET D-010: Route Calculation Loading State (P2)

**Problem:**
After tapping "Xem lịch trình," there's no visual feedback for 2-4 seconds while the route calculates.

**Design requirement:**
- Button loading state: replace text with spinner + "Đang tính..."
- Disable button during calculation (prevent double-tap)
- Trip summary area: show skeleton loading (3 rows of pulsing bars)
- If calculation takes >5 seconds: show a subtle message "Đang tính tuyến đường dài..."

---

### TICKET D-011: Autocomplete Full-Screen Overlay (P2)

**Problem:**
Autocomplete dropdown overlaps other form elements on mobile. Results are hard to see and tap accurately on small screens.

**Design requirement:**
- On mobile: tapping either input opens a **full-screen search overlay**
  - Fixed position overlay (z-50), dark background
  - Large search input at top (auto-focused, keyboard opens)
  - Full-height scrollable results list
  - Each result: 56px row height, full-width touch target
  - Back button (×) to dismiss without selection
- On desktop: keep current dropdown behavior

**Reference:** Google Maps, Grab, Apple Maps all use this pattern

---

### TICKET D-012: Landing Page Visual Polish (P2)

**Problem areas:**
1. "Miễn phí & mã nguồn mở" badge has low contrast, small text
2. Vehicle cards show generic car silhouettes instead of real images
3. Large empty gap (~200px) between features and vehicle sections

**Design requirements:**
1. Badge: increase to `text-sm`, use filled style `bg-[var(--color-accent)]/10 text-[var(--color-accent)]`
2. Vehicle cards: use actual vehicle photos or remove image placeholder and use a compact list card
3. Audit section spacing — reduce `py-20` to `py-12` on mobile for tighter flow

---

### TICKET D-013: Swipe Between Tabs (P3)

**Problem:**
Users expect horizontal swipe gestures to switch tabs. Currently only tap works.

**Design requirement:**
- Add touch swipe gesture detection on the bottom sheet content area
- Swipe left → next tab, swipe right → previous tab
- Minimum swipe distance: 50px
- Animation: content slides in direction of swipe (150ms ease-out)
- Do not interfere with vertical scrolling within the sheet

---

### TICKET D-014: Haptic Feedback (P3)

**Problem:**
No haptic feedback on any interaction. App feels less native.

**Design requirement:**
- Light haptic on: tab switch, vehicle selection, slider snap to preset
- Medium haptic on: "Xem lịch trình" tap, trip plan loaded
- Use `navigator.vibrate()` API with graceful fallback
- Respect `prefers-reduced-motion` — disable haptics if set

---

### TICKET D-015: Battery Slider Floating Label (P3)

**Problem:**
Percentage values next to sliders are small and obscured by the user's thumb during drag.

**Design requirement:**
- Show floating label above slider thumb during drag interaction
- Label: rounded pill with current percentage, `bg-[var(--color-accent)] text-background`
- Position: centered above thumb, 8px gap
- Visible only during active drag, fade out 200ms after release

---

# PHASE 2: Senior SWE Implementation Order

## Sprint Plan

### Sprint 1 — Critical Fixes (P0)

| Ticket | Task | Files | Estimate | Dependencies |
|--------|------|-------|----------|--------------|
| SWE-001 | Fix landing page duplicate render | `page.tsx`, `LandingPageContent.tsx` | 1h | None |
| SWE-002 | Fix StatCounter animation trigger | `LandingClient.tsx` | 2h | SWE-001 |
| SWE-003 | Reposition ShareButton (inline in results) | `ShareButton.tsx`, `TripSummary.tsx` | 3h | Design D-001 |
| SWE-004 | Fix CTA button safe area + sticky footer | `MobileBottomSheet.tsx`, `plan/page.tsx` | 3h | Design D-002 |

### Sprint 2 — High Priority (P1)

| Ticket | Task | Files | Estimate | Dependencies |
|--------|------|-------|----------|--------------|
| SWE-005 | Fix tab label wrapping / responsive labels | `MobileTabBar.tsx`, `vi.json`, `en.json` | 2h | Design D-005 |
| SWE-006 | Increase peek height + context summary | `MobileBottomSheet.tsx`, `plan/page.tsx` | 3h | Design D-006 |
| SWE-007 | Auto-scroll on vehicle selection + toast | `BrandModelSelector.tsx` | 2h | Design D-007 |
| SWE-008 | Make logo a home link | `Header.tsx` | 0.5h | Design D-008 |

### Sprint 3 — Polish (P2)

| Ticket | Task | Files | Estimate | Dependencies |
|--------|------|-------|----------|--------------|
| SWE-009 | Bottom sheet initial snap + map tap behavior | `MobileBottomSheet.tsx` | 2h | Design D-009 |
| SWE-010 | Route calc loading state (spinner + skeleton) | `plan/page.tsx`, `TripSummary.tsx` | 3h | Design D-010 |
| SWE-011 | Full-screen autocomplete overlay (mobile) | `PlaceAutocomplete.tsx` | 5h | Design D-011 |
| SWE-012 | Landing page visual polish | `LandingPageContent.tsx`, `globals.css` | 2h | Design D-012 |

### Sprint 4 — Delight (P3)

| Ticket | Task | Files | Estimate | Dependencies |
|--------|------|-------|----------|--------------|
| SWE-013 | Tab swipe gestures | `MobileBottomSheet.tsx`, `MobileTabBar.tsx` | 4h | Design D-013 |
| SWE-014 | Haptic feedback integration | Multiple components | 2h | Design D-014 |
| SWE-015 | Battery slider floating label | `BatteryStatusPanel.tsx` | 3h | Design D-015 |

---

# PHASE 3: QA Test Plan

## Test Environment

- **Devices:** iPhone SE (375px), iPhone 14 (390px), iPhone 15 Pro Max (430px), Pixel 7 (412px), Samsung Galaxy S23 (360px)
- **Browsers:** Safari (iOS), Chrome (Android), Samsung Internet
- **Orientations:** Portrait (primary), Landscape (secondary)
- **Network:** WiFi, 4G, Slow 3G (throttled)

## Test Cases

### TC-001: Landing Page Rendering
| # | Step | Expected | Priority |
|---|------|----------|----------|
| 1 | Open `/` on iPhone 14 | Landing page renders once (no duplicate sections) | P0 |
| 2 | Scroll to stat counters | Numbers animate from 0 to final value (150+, 63, 15+) | P0 |
| 3 | Wait 2 seconds without scrolling | If counters visible in viewport, they animate automatically | P0 |
| 4 | Check "Miễn phí & mã nguồn mở" badge | Text readable, sufficient contrast | P2 |
| 5 | Check vehicle cards section | No excessive empty space above section | P2 |
| 6 | Tap "Bắt đầu ngay" | Navigates to `/plan` | P0 |
| 7 | Check footer | Renders once, links work | P1 |

### TC-002: Header & Navigation
| # | Step | Expected | Priority |
|---|------|----------|----------|
| 1 | Tap logo on `/plan` | Navigates to `/` | P1 |
| 2 | Tap language toggle | Switches VI ↔ EN, all text updates | P1 |
| 3 | Tap map mode toggle | Map switches between OSM/Mapbox | P1 |
| 4 | Check header on iPhone SE (375px) | No overflow, all buttons visible and tappable | P1 |

### TC-003: Bottom Sheet Behavior
| # | Step | Expected | Priority |
|---|------|----------|----------|
| 1 | Load `/plan` | Bottom sheet starts at half-snap (55% viewport) | P2 |
| 2 | Check peek state | Shows tab bar + context summary (120px total) | P1 |
| 3 | Drag sheet up | Snaps to full (92% viewport) smoothly | P1 |
| 4 | Drag sheet down | Snaps to peek, then cannot go below 120px | P1 |
| 5 | Tap on map area | Sheet snaps to peek to reveal map | P2 |
| 6 | Context summary — empty state | Shows "Nhập điểm đi & điểm đến để bắt đầu" | P1 |
| 7 | Context summary — route set | Shows "HCM → Vũng Tàu" | P1 |
| 8 | Context summary — vehicle set | Shows "HCM → Vũng Tàu · VF 8 Plus" | P1 |

### TC-004: Route Input (Tuyến đường tab)
| # | Step | Expected | Priority |
|---|------|----------|----------|
| 1 | Tap "Điểm đi" input | Full-screen search overlay opens, keyboard appears | P2 |
| 2 | Type "Ho Chi Minh" | Autocomplete results show within 500ms | P1 |
| 3 | Tap a result | Overlay closes, input populated, map centers | P1 |
| 4 | Tap × to dismiss overlay | Returns to form without selecting | P2 |
| 5 | Fill both inputs | "Xem lịch trình" remains disabled (no vehicle yet) | P0 |
| 6 | Check "Xem lịch trình" disabled state | Button shows 0.4 opacity, clear why it's disabled | P0 |

### TC-005: Vehicle Selection (Xe tab)
| # | Step | Expected | Priority |
|---|------|----------|----------|
| 1 | Switch to Vehicle tab | Vehicle list loads, VinFast first | P0 |
| 2 | Tab label on iPhone SE | No line wrapping, fits in single line | P1 |
| 3 | Tap "VF 8 Plus" | Vehicle highlighted with checkmark + border | P1 |
| 4 | Check detail card | Auto-scrolls so detail card is fully visible | P1 |
| 5 | Check toast notification | Shows "VF 8 Plus — 447 km range" for 1.5s | P1 |
| 6 | Search "BYD" | Filters to BYD vehicles only | P1 |
| 7 | Tap "+ Thêm xe khác" | Custom vehicle modal opens correctly on mobile | P1 |

### TC-006: Battery Settings (Pin tab)
| # | Step | Expected | Priority |
|---|------|----------|----------|
| 1 | Switch to Battery tab | Slider shows 80% default | P0 |
| 2 | Drag battery slider | Floating label shows current % above thumb | P3 |
| 3 | Tap preset button (e.g., 60%) | Slider snaps to 60%, haptic feedback | P3 |
| 4 | Check thumb size on touch device | Minimum 28px touch target | P1 |

### TC-007: Trip Planning & Results
| # | Step | Expected | Priority |
|---|------|----------|----------|
| 1 | Fill route + vehicle + tap "Xem lịch trình" | Button shows spinner + "Đang tính..." | P2 |
| 2 | Wait for route calculation | Trip summary appears with distance, time, battery % | P0 |
| 3 | Check share button position | Inline below trip summary, NOT floating over content | P0 |
| 4 | Tap "Chia sẻ chuyến đi" | Share modal opens correctly | P1 |
| 5 | Check "Xem lịch trình" visibility | Button visible above safe area, fully tappable | P0 |
| 6 | Check battery gauge | Gradient colors, clear start/end percentages | P1 |
| 7 | Bottom sheet auto-snaps to half | After results load, sheet shows results at half-snap | P2 |

### TC-008: Feedback Modal
| # | Step | Expected | Priority |
|---|------|----------|----------|
| 1 | Tap "Gửi góp ý" FAB | Modal slides up with category grid | P1 |
| 2 | Check category grid | 2x3 grid, all 6 categories visible without scrolling | P1 |
| 3 | Tap a category | Transitions to form with correct fields | P1 |
| 4 | Tap × or "Huỷ" | Modal closes smoothly | P1 |
| 5 | Submit feedback | Success state shows, modal auto-dismisses | P1 |

### TC-009: Tab Swipe Gestures
| # | Step | Expected | Priority |
|---|------|----------|----------|
| 1 | Swipe left on Route tab content | Switches to Vehicle tab with slide animation | P3 |
| 2 | Swipe right on Vehicle tab | Returns to Route tab | P3 |
| 3 | Swipe up within content | Scrolls content normally (no tab switch conflict) | P3 |
| 4 | Short swipe (<50px) | No tab switch (threshold not met) | P3 |

### TC-010: Cross-Device Regression
| # | Step | Expected | Priority |
|---|------|----------|----------|
| 1 | All TC-001 to TC-008 on iPhone SE (375px) | No layout breaks, all text fits, all buttons tappable | P0 |
| 2 | All TC-001 to TC-008 on Pixel 7 (412px) | No layout breaks | P1 |
| 3 | All TC-001 to TC-008 on Galaxy S23 (360px) | No layout breaks | P1 |
| 4 | Landscape mode on any device | App remains usable (no critical breaks) | P2 |
| 5 | Slow 3G throttled | Loading states appear, no blank screens | P2 |

### TC-011: Accessibility
| # | Step | Expected | Priority |
|---|------|----------|----------|
| 1 | Enable VoiceOver/TalkBack | All interactive elements have labels | P1 |
| 2 | Enable `prefers-reduced-motion` | No counter animations, no haptics, no bounce | P2 |
| 3 | Test with system font size (largest) | Text doesn't overflow containers | P2 |

---

## Sign-off Criteria

- [ ] All P0 test cases pass on iPhone SE + iPhone 14 + one Android device
- [ ] All P1 test cases pass on at least 2 devices
- [ ] No visual regressions on desktop (1024px+ viewport)
- [ ] Performance: Landing page LCP < 2.5s on Fast 3G
- [ ] Performance: /plan page TTI < 3s on Fast 3G
- [ ] Accessibility: no critical a11y violations (axe-core scan)

---

## Appendix: Screenshot Evidence

| Screenshot | Description |
|------------|-------------|
| `evoyage-mobile-landing-viewport.png` | Landing hero — first viewport |
| `evoyage-mobile-landing-full.png` | Landing full page — shows duplicate render bug |
| `evoyage-mobile-plan-default.png` | Plan page — initial state |
| `evoyage-mobile-vehicle-tab.png` | Vehicle selection tab |
| `evoyage-mobile-battery-tab.png` | Battery settings tab |
| `evoyage-mobile-vehicle-selected.png` | Vehicle selected state |
| `evoyage-mobile-trip-result.png` | Trip results with route on map |
| `evoyage-mobile-trip-scrolled.png` | Trip summary scrolled into view |
| `evoyage-mobile-trip-route-tab.png` | Share button overlapping content |
| `evoyage-mobile-feedback-modal.png` | Feedback modal on mobile |
| `evoyage-mobile-se-plan.png` | iPhone SE — tab wrapping issue |
| `evoyage-mobile-landing-mid.png` | Landing features section |
| `evoyage-mobile-landing-stats.png` | Landing vehicle cards |
| `evoyage-mobile-landing-bottom.png` | Landing footer + FAQ |
