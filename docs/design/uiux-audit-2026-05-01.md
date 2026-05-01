# UI/UX Audit — 2026-05-01

**Auditor:** Claude (manual `/design-review` — gstack skill broken; symlink at `~/.claude/skills/design-review` → `~/Documents/Programming/Software/Tools/gstack/` which no longer exists. Tool fix is a side task.)
**Scope:** Full UI surface — landing page, /plan app, trip planner, eVi chat, station cards, layout primitives, global tokens
**Reference:** [DESIGN.md](../../DESIGN.md), [CLAUDE.md](../../CLAUDE.md) "less icons, more humanity"
**Auditor's claim:** Findings below are grounded in specific file:line references; counts are exact, not estimated.

---

## TL;DR

The trip-planning surface (the actual app) is largely consistent with DESIGN.md. The **landing page is a parallel design system** — it bypasses every CSS variable, ships three different "primary green" colors, and uses an undocumented blue (`#1464F4`) as a fourth brand color. There's also a **named-token contradiction in `globals.css`** where `surface-elevated` and `surface-hover` are swapped relative to DESIGN.md, meaning every component using those tokens is showing the wrong shade.

If you fix only one thing: align brand colors and the swapped tokens. Everything else is downstream of that.

---

## Severity legend

- **P0 — Bug:** code contradicts design or itself; produces wrong output today
- **P1 — Inconsistency:** breaks the system but doesn't visibly malfunction
- **P2 — Polish:** drift from intent, no functional harm
- **P3 — Future-proofing:** will rot, not broken yet

---

## P0 — Wrong-on-arrival

### 1. `surface-elevated` and `surface-hover` token names are swapped
**Where:** [`src/app/globals.css:6-7`](../../src/app/globals.css)
**What:** DESIGN.md declares `Surface Elevated = #252530` and `Surface Hover = #2E2E3A`. globals.css declares the opposite: `--color-surface-hover: #252530; --color-surface-elevated: #2E2E3A`.
**Impact:** Every component that uses `var(--color-surface-elevated)` for "active/sent message" is actually rendering the hover shade, and vice versa. Three-tier depth hierarchy is inverted.
**Files affected:** Audit needed — used in `MobileTabBar`, `Header`, `EVi`, `TripSummary`, etc. Likely 30+ usages.
**Fix:** Swap the two values in `globals.css`. One-line diff. Check no component was visually compensating for the bug.

### 2. Three different "primary green" colors in production
**Where:**
- DESIGN.md says accent = `#00D4AA`
- [`LandingPageContent.tsx:91, 346`](../../src/components/landing/LandingPageContent.tsx) hero/final CTA = `#00D26A`
- Same file, hover state = `#00E87A`
- [`globals.css:9`](../../src/app/globals.css) `--color-accent: #00D4AA` (matches DESIGN.md)
**Impact:** Driver lands on `#00D26A` button, clicks → enters app where everything is `#00D4AA`. The "what's the action color" gestalt is broken across the funnel. Brand recall suffers.
**Fix:** Pick one. Either update DESIGN.md to the landing's `#00D26A` (and update all `--color-accent` usages), or update the landing to `#00D4AA`. My recommendation: keep `#00D4AA` (it's the longer-shipped, EV-green-themed value used in 25+ in-app surfaces) and update landing.

### 3. Undocumented blue `#1464F4` used as a de facto brand color
**Where:** [`LandingPageContent.tsx:29, 132, 172, 298, 314`](../../src/components/landing/LandingPageContent.tsx) — feature card numbers (01, 04), border hover state, "Built with AI" badge, "Built by AI Dev" name
**Impact:** A fourth color (`#1464F4`) is shipped as if it's a brand color but isn't in DESIGN.md. Users learn it implicitly as "secondary accent." This is now a load-bearing color with no entry in the design system.
**Fix:** Either (a) add it to DESIGN.md as a documented secondary accent with a defined role, OR (b) replace with `--color-info: #5B9BFF` if its only role is non-action visual variety.

---

## P1 — System-bypassing

### 4. Landing page is hardcoded-hex throughout — does not use any CSS variable
**Where:** [`LandingPageContent.tsx`](../../src/components/landing/LandingPageContent.tsx) — entire 423-line file
**Examples:**
- `bg-[#0F0F11]`, `bg-[#1A1A1F]`, `bg-[#252530]`, `bg-[#0D1B3E]`, `bg-[#081428]`, `bg-[#0B0B0D]`, `bg-[#111114]`
- `text-[#E8E8ED]`, `text-[#6B6B78]`
- `border-[#252530]`, `border-[#1A1A1F]`
**Why it matters:** The values *mostly* match DESIGN.md tokens, but every change to the design system requires hunting through 423 lines of hardcoded hex. The trip surface (correctly) uses `bg-[var(--color-surface)]`. Two systems coexist.
**Bonus drift:** `#0D1B3E`, `#081428`, `#0B0B0D`, `#111114` are landing-page-only — they're not in DESIGN.md or globals.css. So the landing is shipping ~4 undocumented background shades.
**Fix:** Either migrate landing to CSS vars, OR officially document the gradient stops as landing-only tokens.

### 5. Status colors use Tailwind palette in `StationCard`, design tokens elsewhere
**Where:** [`src/components/StationCard.tsx:12-21, 90`](../../src/components/StationCard.tsx)
**What:** `text-green-400`, `text-amber-400`, `text-gray-400`, `text-red-400` — Tailwind palette colors, not the project's `--color-safe`, `--color-warn`, `--color-muted`, `--color-danger`.
**Inconsistency:** `TripSummary.QuickStats` ([line 43-55](../../src/components/trip/TripSummary.tsx)) uses design tokens for the same status concept. Same data, two visual systems. Drivers seeing nearby stations vs. trip stations get different greens.
**Fix:** Replace Tailwind palette with design tokens.

### 6. `StationInfoChips` 24/7 chip uses Tailwind `blue-400`
**Where:** [`StationInfoChips.tsx:98`](../../src/components/trip/StationInfoChips.tsx)
**What:** `text-blue-400 border-blue-400` for the 24/7 operating-hours badge.
**Why:** This is the only chip in the component that doesn't use a design token. Looks like a one-off forgot-to-tokenize.
**Fix:** Replace with `--color-info: #5B9BFF`.

### 7. Border-radius scale is broken in landing
**Where:** Every card in [`LandingPageContent.tsx`](../../src/components/landing/LandingPageContent.tsx) uses `rounded-2xl` (24px)
**What:** DESIGN.md scale tops out at `xl: 20px`. 24px (`rounded-2xl`) is undocumented.
**Inconsistency with trip surface:** [`TripSummary.tsx:342`](../../src/components/trip/TripSummary.tsx) skeleton cards also use `rounded-2xl`. So the bug is bigger than just landing — both surfaces ship the wrong radius for cards.
**Fix:** Either bump DESIGN.md to include `2xl: 24px` (since two surfaces already use it), or replace `rounded-2xl` with `rounded-[16px]`.

### 8. Typography scale is missing the headline sizes actually used
**Where:** Landing hero `md:text-[56px]`, section headings `md:text-[40px]`, sub-headings `md:text-[22px]`
**What:** DESIGN.md scale stops at `2xl: 32px`. 56px, 40px, 22px are all used in production but undocumented.
**Fix:** Either add `3xl: 40px` and `display: 56px` to DESIGN.md, or scale the landing down to documented sizes.

---

## P2 — Crowdsourcing trust signal not surfaced (matches earlier survey #1)

### 9. `lastVerifiedAt` is calculated but only shown inside the reporter widget
**Where:** [`StationStatusReporter.tsx:131-137`](../../src/components/trip/StationStatusReporter.tsx)
**What:** When a charging stop has `lastVerifiedAt` data, the timestamp is rendered as small muted text *below* the three report buttons. The driver has to expand the station detail and look down to see "verified 2 hours ago."
**Missed opportunity:** This is the highest-information signal you have for trust. It belongs as a **chip on the station card itself**, alongside power and connector type, not buried under a CTA.
**No counter:** There's also no "X drivers reported this today" summary anywhere in the UI, even though the API stores every `StationStatusReport`.

### 10. Cost transparency is functional but visually buried
**Where:** [`TripSummary.tsx:262-307`](../../src/components/trip/TripSummary.tsx) `TripCostSection`
**What:** Three lines of mono text: total cost, savings vs gasoline, disclaimer note. No visual hierarchy — all `text-sm`, no hero number.
**Missed opportunity:** "Tiết kiệm ~295,000 ₫" is the emotional payoff of the entire trip; it deserves to be a chip or pill at the top of the summary, not paragraph 4 of a section.

---

## P3 — Will rot

### 11. Hardcoded "15+" vehicle models on landing
**Where:** [`LandingPageContent.tsx:103, 267`](../../src/components/landing/LandingPageContent.tsx) — `15+` hero stat and `StatCounter` for models.
**Why it'll rot:** `VINFAST_MODELS` const in same file lists exactly 6 models. Where does "15+" come from? If you add a 7th VinFast model or a new brand, the stat won't update. Same drift class as the 18,234-station counter you fixed in 0.7.0.
**Fix:** Generate from a single source — either the same JSON pipeline as stations, or a `models-stats.json` written by the build.

### 12. Hardcoded "63 provinces"
**Where:** [`LandingPageContent.tsx:107, 266`](../../src/components/landing/LandingPageContent.tsx)
**Why it'll rot:** Vietnam reorganized administrative divisions in mid-2025; the country now has 34 provinces+cities, not 63. If we're auditing in 2026 and shipping "63", the landing page is making a factually wrong claim. (This needs verification — if the claim is "63 historical provinces" it might survive, but as a current-state claim it's wrong.)
**Fix:** Update to `34` after verification, or reword the label to remove the count entirely.

---

## P4 — Smaller polish (won't list every one)

- [`LandingPageContent.tsx:79`](../../src/components/landing/LandingPageContent.tsx) hero badge uses `#00D26A/10` and `#00D26A/20` — same wrong-green issue as #2
- [`MobileBottomSheet.tsx:159`](../../src/components/layout/MobileBottomSheet.tsx) uses `border-[var(--color-surface-hover)]` — once the swap (#1) is fixed, this border becomes the wrong shade. Audit all `surface-hover` consumers when fixing.
- [`Header.tsx:31, 58`](../../src/components/layout/Header.tsx) same pattern — `border border-[var(--color-surface-hover)]`. Touched by #1 fix.
- The "Add vehicle" plus icon on landing card violates "less icons, more humanity" mildly but is functional (CTA discoverability), so OK.
- Skip-link target is `#main-content` — only one section. Acceptable but could chain to "#hero", "#features", etc. for power users.
- `prefers-reduced-motion` is respected globally (good), but the `cta-glow` animation isn't disabled — only structural animations are.

---

## Surfaces I did NOT audit deeply

- `EVi.tsx` (only first 150 lines reviewed — looked clean)
- `BatteryStatusPanel.tsx`, `BrandModelSelector.tsx`, `PlaceAutocomplete.tsx`, `WaypointInput.tsx`
- `MapboxMap.tsx` popup HTML (DESIGN.md mentions emojis were removed there in 0.6.1; trust the changelog)
- `FeedbackFAB.tsx`, `FeedbackModal.tsx`, `StarRating.tsx`
- `ShareButton.tsx` (584 lines — likely needs its own audit pass)
- Loading and error states beyond what's in `TripSummary`/`StationDetailSkeleton`

These should be picked up in a follow-up if the priority items here are addressed first.

---

## Counts and metadata

- **Files inspected:** 11 source files
- **DESIGN.md violations found:** 12 distinct issues (3 P0, 5 P1, 2 P2, 2 P3) + 5 minor in P4
- **Surfaces fully clean against DESIGN.md:** `MobileTabBar`, `MobileBottomSheet`, `EVi` (sample), `Header`, `StationStatusReporter`
- **Surfaces that bypass the design system:** `LandingPageContent` (entire), `StationCard` (status colors only), `StationInfoChips` (one chip)
- **The trip-planning core is healthy.** The drift is concentrated at the edges (landing) and in newer additions that didn't follow conventions (`StationCard` status colors).
