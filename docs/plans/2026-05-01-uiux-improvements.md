# UI/UX Improvement Plan — 2026-05-01

**Author:** Claude (manual `/plan-design-review` — gstack skill broken; same as audit)
**Source audit:** [docs/design/uiux-audit-2026-05-01.md](../design/uiux-audit-2026-05-01.md)
**Goal:** Address audit findings + ship the highest-value UX wins surfaced in the earlier survey, in dependency order.

---

## Sequencing principle

Foundation before features. The design system has 3 P0 bugs (token swap, mixed greens, undocumented blue). New UI built on top of broken tokens makes the bugs harder to fix later. So:

1. **Foundation fixes** (1 PR, 2-3 hours) — unblocks everything else
2. **System normalization** (2 PRs, ~1 day) — landing migrates into tokens, status colors unify
3. **High-value UX wins** (2 PRs, 2-3 days) — trust signal, cost hero
4. **Activation polish** (2 PRs, 2 days) — empty state, eVi nudge
5. **Drift prevention** (1 PR, ~1 hour) — auto-update model count, fix province claim

Total: ~5-7 working days if shipped serially. Steps 3 and 4 can run in parallel by different work sessions if Duy splits them.

---

## Definition of "done" for this plan

A driver who has never used eVoyage:
- Lands on a homepage where every green is the same green
- Clicks "Plan a trip" and sees sample-trip chips so they don't face a blank input
- Plans a trip and sees savings vs gasoline as a hero number, not paragraph 4
- Sees a trust badge ("verified 2h ago") on every charging stop
- Is gently nudged toward eVi when stuck

The design system has zero token-name contradictions, zero Tailwind palette colors in production, and one canonical accent color.

---

## Phase 1 — Foundation (P0 fixes)

**One PR. ~2-3 hours. Visual diff likely small but cleans up the substrate for everything below.**

### Task 1.1 — Swap `surface-elevated` and `surface-hover` token values
- **File:** `src/app/globals.css:6-7`
- **Change:** Swap the two color values to match DESIGN.md (Elevated = `#252530`, Hover = `#2E2E3A`)
- **Verification:** `npm test` passes (no tests assert specific shades). Manual: open `/plan`, hover over Mobile tab bar buttons — hover should be a notch *brighter* than active state.
- **Risk:** Some component may have visually compensated for the swap. Expected: 1-2 small follow-up tweaks.

### Task 1.2 — Pick one accent green; unify across landing + DESIGN.md
- **Decision needed first:** `#00D4AA` (current DESIGN.md / app) or `#00D26A` (current landing). Recommendation: keep `#00D4AA` because 25+ in-app surfaces already use it; landing CTA is the outlier.
- **Files:**
  - `src/components/landing/LandingPageContent.tsx` — replace every `#00D26A` and `#00E87A` with `var(--color-accent)` and `var(--color-accent-dim)` (or `#00D4AA` / `#00A888` literally if not migrating to vars yet)
  - `src/components/landing/LandingClient.tsx` — likely has `StatCounter`, `LandingNavbar` with similar hardcoded greens; check
- **Verification:** Pixel-grep — `grep -r "#00D26A\|#00E87A" src/` returns zero matches.

### Task 1.3 — Decide on `#1464F4` blue: document or replace
- **Decision needed:** Is the landing-page blue a brand color or visual variety?
- **If brand color:** Add to DESIGN.md as `--color-secondary-accent: #1464F4` with a defined role
- **If just variety:** Replace all 5 instances in `LandingPageContent.tsx` with `var(--color-info: #5B9BFF)`
- **Recommendation:** Replace with `--color-info`. The landing has too many brand-color competitors already.

**Phase 1 complete when:** `globals.css` matches DESIGN.md token-for-token, and a repo-wide grep for `#00D26A`, `#00E87A`, `#1464F4` either returns zero results or is justified by a documented DESIGN.md entry.

---

## Phase 2 — System normalization

**Two PRs (can be sequential or parallel). ~1 working day total.**

### Task 2.1 — Migrate landing page from hardcoded hex to CSS variables
- **File:** `src/components/landing/LandingPageContent.tsx` (423 lines)
- **Change:** Replace every `bg-[#XXXXXX]`, `text-[#XXXXXX]`, `border-[#XXXXXX]` with `bg-[var(--color-XXX)]` etc. Keep gradient stops (`#0D1B3E`, `#081428`, `#0B0B0D`, `#111114`) as the four landing-only background shades — these are intentional gradient art, but document them in DESIGN.md as `--landing-gradient-1..4` so they exist in one place.
- **Verification:** Visual diff — landing should be pixel-identical post-migration. Run `npm test`. `npx playwright test e2e/` for landing E2E coverage.
- **Effort:** ~3 hours (mechanical but tedious; mostly find-and-replace with a few judgment calls).

### Task 2.2 — Unify status colors across `StationCard`, `StationInfoChips`, `TripSummary`
- **Files:**
  - `src/components/StationCard.tsx:12-21, 90` — replace `text-green-400`, `text-amber-400`, `text-gray-400`, `text-red-400` with `text-[var(--color-safe)]`, `text-[var(--color-warn)]`, `text-[var(--color-muted)]`, `text-[var(--color-danger)]`
  - `src/components/trip/StationInfoChips.tsx:98` — replace `text-blue-400 border-blue-400` with `text-[var(--color-info)] border-[var(--color-info)]`
- **Verification:** Visual diff — `text-green-400` (Tailwind) ≠ `#00D4AA` (DESIGN.md) so colors will shift slightly. Confirm acceptable. Tests should pass without changes.
- **Effort:** 30 minutes.

### Task 2.3 — Reconcile border-radius and typography scale with reality
- **Files:** `DESIGN.md`, possibly tweaks to landing/trip components
- **Decision:** Add the actually-shipped sizes to DESIGN.md (`2xl: 24px` for cards, `3xl: 40px` and `display: 56px` for headings) OR downsize the components to match the existing scale. Recommendation: add to DESIGN.md — the sizes are intentional and the scale was just incomplete.
- **Effort:** 30 minutes (DESIGN.md edit + log entry).

---

## Phase 3 — High-value UX wins

**Two PRs. 2-3 days total. These are the visible improvements drivers will feel.**

### Task 3.1 — Surface station trust signal on station cards
- **What:** A small chip, visible WITHOUT expanding the station detail, that shows the most recent verification status. Three states:
  1. `Đã xác minh 2h trước` (green-tinted) — `lastVerifiedAt` within 24h
  2. `Đã xác minh 3 ngày trước` (muted) — `lastVerifiedAt` within 7 days
  3. `Chưa có xác minh gần đây` (muted, smaller) — older or null
- **Bonus:** A counter chip when there are recent reports: `3 tài xế báo lỗi hôm nay` (warn-tinted) — pulls from a count query on `StationStatusReport`
- **Files affected:**
  - `src/components/trip/TripSummary.tsx` — add chip to `QuickStats` or above the station name
  - `src/components/StationCard.tsx` — same chip for nearby-station list
  - Possibly a new `<StationTrustChip>` component if reused across both
  - API: extend `/api/stations/[id]/details` (or wherever station data is fetched) to include `lastVerifiedAt` + `recentReportCount` (last 24h, by status)
  - Locale keys: `station_verified_recent`, `station_verified_days_ago`, `station_no_recent_verification`, `station_recent_broken_reports`
- **Why this first:** Closes the loop on the 0.6.0 crowdsourcing investment. Drivers don't tap "Báo trạm hoạt động" if they don't see the value. Once they see "verified 2h ago by another driver," the social proof becomes self-reinforcing.
- **Effort:** ~1 day (API + 1-2 components + tests + locale keys).

### Task 3.2 — Promote cost transparency to a hero pill in `TripSummary`
- **What:** Replace the current 3-line text block with one prominent green pill at the top of the trip summary card:
  ```
  ┌──────────────────────────────────────┐
  │  Tiết kiệm 295,000 ₫ vs xăng         │
  │  (small) ~12% rẻ hơn · Xem cách tính │
  └──────────────────────────────────────┘
  ```
- **Files:** `src/components/trip/TripSummary.tsx:262-307` (refactor `TripCostSection`)
- **Detail:** Tap "Xem cách tính" expands a small disclosure with the assumptions (EVN 3,500 ₫/kWh, RON95 23,000 ₫/L). This keeps the hero claim honest.
- **Edge case:** When EV is *not* cheaper (rare but possible with stale fuel pricing), use neutral muted color, not red. We're not shaming the driver.
- **Effort:** ~3-4 hours (component + locale + visual polish + tests).

---

## Phase 4 — Activation polish

**Two PRs. Run in parallel with Phase 3 if work allocation allows. Otherwise, do after.**

### Task 4.1 — Sample-trip chips on `/plan` empty state
- **What:** When a user lands on `/plan` with no input, render 3-4 chips above the input field:
  - `HCMC → Đà Lạt`
  - `HCMC → Vũng Tàu`
  - `Hà Nội → Hạ Long`
  - `Đà Nẵng → Huế`
- **Tap behavior:** Pre-fills the input fields with the matching addresses; doesn't auto-submit (driver still needs to confirm vehicle).
- **Files:** Likely `src/app/plan/page.tsx` or wherever the input form lives. Add a `<SampleTripChips />` component.
- **Why:** Lowers the typing barrier for first-time mobile visitors. eVi handles freeform queries but the trip planner is more mechanical.
- **Effort:** ~3 hours.

### Task 4.2 — eVi discoverability nudge
- **What:** A one-time-per-session subtle text link or chip that surfaces after one of these triggers:
  - User submits an empty/invalid trip search
  - User has been on `/plan` for 90 seconds with no input
- **Copy:** `"Hỏi eVi: 'gợi ý cho tôi chuyến đi cuối tuần'"` with an inline link to the eVi tab.
- **Constraint:** Cap at one nudge per session (use sessionStorage). Never block input. Easy to dismiss.
- **Files:** Probably a new `<EViNudge />` component, mounted in the same scope as the trip planner state.
- **Effort:** ~2 hours.

---

## Phase 5 — Drift prevention

**One PR. ~1-2 hours.**

### Task 5.1 — Auto-update vehicle model count on landing
- **What:** Same pattern as the station-count auto-update Duy shipped in 0.7.0 — derive "X+ models" from a single source of truth.
- **Decision:** Either (a) write a `models-stats.json` from `VINFAST_MODELS` const at build time, OR (b) just compute `VINFAST_MODELS.length` directly in `LandingPageContent.tsx` (cheaper, no build step).
- **Recommendation:** Option (b). The const is in the same file. Compute inline.
- **Effort:** 15 minutes.

### Task 5.2 — Verify and update province count
- **What:** Confirm whether "63 provinces" is still accurate as of 2026 (Vietnam's mid-2025 admin reorg consolidated to 34). If wrong, update the number; if the claim is "we serve all administrative regions," reword the label to drop the count.
- **Files:** `LandingPageContent.tsx:107, 266` + locale keys `landing_hero_stat_provinces`, `landing_stats_provinces`
- **Effort:** 30 minutes (lookup + update).

---

## Out of scope for this plan

These came up in the earlier survey but are deprioritized:

- **Loading skeletons for `TripSummary` + elevation chart** — actually already exist (`TripSummary.tsx:328-371` has skeletons). The earlier survey was wrong about this. No work needed.
- **`TripSummary.tsx` (725 lines) and `ShareButton.tsx` (584 lines) refactor** — these are large but functioning. Refactor when next touching them substantively, not as a standalone effort.
- **Accessibility deep audit** — keyboard nav, focus rings, screen-reader VN labels — worth a separate audit pass after this plan ships.
- **Map UI / `MapboxMap.tsx`** — not audited; would need a dedicated review.

---

## Tooling fix (separate, do anytime)

The gstack plugin is broken. The symlink at `~/.claude/skills/design-review` points to `~/Documents/Programming/Software/Tools/gstack/design-review` which doesn't exist on disk. CLAUDE.md's troubleshooting (`cd ~/.claude/skills/gstack && ./setup`) won't work because the directory is gone.

**To fix later:** Reinstall gstack from source (wherever Duy first cloned it from), or remove the dead symlinks. This audit was performed manually as the substitute. The same outcome was reached, just slower.

---

## Recommendation: where to start

**Start with Phase 1 today.** It's a 2-3 hour PR that lands a measurable system-quality improvement and unblocks every later visual change. After that, the remaining phases are self-contained and Duy can scope which one to spawn next based on priority of the week.

The single most valuable user-facing item is **Task 3.1 (station trust signal)** — but it depends on Phase 1 because it'll add new chips that have to use the (now-correct) tokens.
