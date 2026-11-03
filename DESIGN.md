# Design System — eVoyage

## Product Context
- **What this is:** EV trip planner for Vietnamese drivers — plan routes, find charging stations, manage battery
- **Who it's for:** Vietnamese EV owners (primarily VinFast), drivers planning road trips
- **Space/industry:** Navigation/trip planning (peers: Google Maps, Waze, Tesla, Grab)
- **Project type:** Mobile-first web app with bottom-sheet architecture

## Aesthetic Direction
- **Direction:** Industrial/Utilitarian — function-first, data-aware, precise
- **Decoration level:** Intentional — subtle surface elevation for depth, no decorative elements
- **Mood:** Trustworthy and precise, like a flight instrument panel. The app's personality comes from data visualization and micro-interactions, not from icons or gradients. Warm enough to feel human, precise enough to feel reliable.
- **Reference sites:** Google Maps (bottom sheets), Grab (clean dark mode), ChatGPT mobile (chat UI)

## Typography
- **Display/Hero:** Space Grotesk 700 — geometric precision, modern without being flashy, good Vietnamese support
- **Body:** Be Vietnam Pro 400 — purpose-built for Vietnamese diacritics, clean and highly legible
- **UI/Labels:** Be Vietnam Pro 500 — same family, weight differentiation for hierarchy
- **Data/Tables:** JetBrains Mono 400 — tabular-nums by default, excellent for km/kWh/% readouts
- **Code:** JetBrains Mono 400
- **Loading:** next/font/google with `display: swap`, subsets: `['latin', 'vietnamese']`
- **Scale:**
  - `xs`: 12px — captions, labels, tab text
  - `sm`: 14px — chat messages, UI text, chip labels
  - `base`: 16px — body text, inputs
  - `lg`: 20px — section headings (h3)
  - `xl`: 24px — page headings (h2)
  - `2xl`: 32px — hero headings (h1) in app surfaces
  - `3xl`: 40px — landing-page section headings (mobile starts at `xl: 24px` and scales up)
  - `display`: 56px — landing-page hero h1 + StatCounter values
  - Line-height: 1.5 body, 1.2 headings, 1.1 display
  - These names are this scale's, not Tailwind classes. Tailwind v4 defaults differ from `lg` up: `text-lg` = 18px, `text-xl` = 20px, `text-2xl` = 24px, `text-3xl` = 30px. The 40px and 56px sizes ship as `text-[40px]` / `text-[56px]`. Semantic names (e.g. `text-heading`) arrive per primitive (2026-11-02, D9).

## Color
- **Approach:** Restrained — accent is rare and meaningful, hierarchy from surface elevation
- **Background:** `#0F0F11` — softer than pure black, reduces eye strain
- **Surface:** `#1A1A1F` — chat bubbles, cards, primary content containers
- **Surface Hover:** `#252530` — second-tier surface; active states, sent messages, static borders that need to read above base surface
- **Surface Elevated:** `#2E2E3A` — top tier; hover state on already-elevated surfaces, dropdowns, the brightest interactive shade
- **Accent:** `#00D4AA` — EV-green, CTAs, active tab indicator, links. Use sparingly.
- **Accent Dim:** `#00A888` — hover/pressed state for accent elements
- **Accent Subtle:** `rgba(0, 212, 170, 0.15)` — filled chip backgrounds, subtle highlights
- **Accent Chip Hover:** `rgba(0, 212, 170, 0.25)` — chip hover state
- **Text:** `#E8E8ED` — primary text, off-white to avoid dark-mode blur
- **Text Secondary:** `#A0A0AB` — supporting text, descriptions
- **Muted:** `#6B6B78` — placeholders, borders, disabled text
- **Border:** `rgba(107, 107, 120, 0.2)` — subtle dividers, card borders
- **Semantic:**
  - Success/Safe: `#00D4AA` — same as accent (EV-green = charged = safe)
  - Warning: `#FFAB40` — warm amber, battery warnings
  - Error/Danger: `#FF4D4F` — clear red, insufficient battery
  - Info: `#5B9BFF` — blue, loading states, informational
- **Dark mode:** This IS the dark mode. No light mode planned.

### Landing-page gradient tokens (marketing surface only)
- `--color-landing-navy: #0D1B3E` — primary marketing navy, hero/final-CTA gradient anchor + Stats section solid
- `--color-landing-navy-deep: #081428` — deepest gradient transition stop, mid of hero
- `--color-landing-footer: #0B0B0D` — footer one-shade-darker than `background`, signals end-of-page
- `--color-landing-alt: #111114` — features/transparency section, one-shade-lighter than `background` for subtle alternation
- These four tokens are reserved for the landing page only. Do not use them in app surfaces.

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable — chat messages need breathing room
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)
- **Chat-specific:** 12px gap between messages, 16px horizontal padding

## Layout
- **Approach:** Grid-disciplined — map is primary canvas, content in bottom sheets
- **Grid:** Single column on mobile, 2-column (map + sidebar) on desktop
- **Max content width:** 1200px (landing page), 100% (app/map view)
- **Border radius:**
  - `sm`: 6px — small badges, tags
  - `md`: 12px — buttons, inputs, tabs, cards (CTA buttons specifically use `xl: 20px` for landing prominence)
  - `lg`: 16px — chat bubbles, bottom sheet content
  - `xl`: 20px — bottom sheet handle area, prominent landing CTAs
  - `2xl`: 24px — landing-page feature/vehicle/transparency cards, `TripSummary` skeleton cards
  - `full`: 9999px — pills, chips, avatars
  - These names are this scale's, not Tailwind classes. Tailwind v4 defaults: `rounded-md` = 6px, `rounded-lg` = 8px, `rounded-xl` = 12px, `rounded-2xl` = 16px, `rounded-3xl` = 24px. Most shipped surfaces use `rounded-lg` (8px), and the landing / `TripSummary` skeleton cards use `rounded-2xl` (16px), not 24px. Semantic names (e.g. `rounded-card`) arrive per primitive (2026-11-02, D9).

## Motion
- **Approach:** Minimal-functional — only transitions that aid comprehension
- **Easing:** enter(`ease-out`) exit(`ease-in`) move(`ease-in-out`)
- **Duration:** micro(50-100ms) short(150ms) medium(250ms) long(400ms)
- **Rules:**
  - Only animate `transform` and `opacity` (never layout properties)
  - Respect `prefers-reduced-motion`
  - Spring easing for sheet gestures
  - Content entering: fade-in + translate-y with `ease-out`

## Component-Specific Rules

### Tab Bar (MobileTabBar)
- **Text-only labels** — no emoji, no icons. The text IS the navigation.
- `shrink-0` tabs with horizontal scroll on overflow
- Active tab auto-scrolls into center view
- Active: accent background with dark text
- Inactive: muted text, hover shows foreground text
- Status dots (route set, vehicle selected) as small accent circles

### Chat Bubbles (EVi)
- Received: `var(--color-surface)` background, rounded-2xl with bottom-left 4px
- Sent: `var(--color-surface-elevated)` background, rounded-2xl with bottom-right 4px
- Max width: 75% of container

### Suggestion Chips
- **Filled backgrounds** at `var(--color-accent-subtle)` — NOT outlined
- Border: `rgba(0, 212, 170, 0.2)` — subtle reinforcement
- Hover: `var(--color-accent-chip-hover)`
- Secondary chips (find stations): `var(--color-surface)` background, muted border
- Min height: 40px (compact mobile layout; tab bar and other interactive elements use 44px)
- Pill shape (border-radius: full)

### eVi Avatar
- 32px circle with `var(--color-surface-elevated)` background
- 1.5px accent border
- "eVi" text label in accent color, Space Grotesk 600 11px
- No emoji compass icon

### Input Bar
- Mic button: 44px circle, surface background, subtle border. NOT accent-filled.
- No "Beta" badge on mic button
- Text input: surface background, subtle border, accent focus ring
- Send button: 44px square, accent background, rounded-md

### Icons
- Follow "less icons, more humanity" philosophy from CLAUDE.md
- No decorative icons — functional only (nav arrows, close, status indicators)
- No emoji as UI elements (tabs, section headings, avatars)
- When icons are needed: use simple SVG, 20px standard size

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | Initial design system created | Created by /design-consultation based on competitive research (Google Maps, Grab, ChatGPT, Tesla) and product context |
| 2026-03-21 | Text-only tabs, no emoji | Aligns with "less icons, more humanity" philosophy — feels intentional and mature |
| 2026-03-21 | Filled chips over outlined | 15% accent opacity creates warm glow, instantly readable on dark backgrounds |
| 2026-03-21 | Surface elevation hierarchy | Three-tier depth (#0F0F11 → #1A1A1F → #252530) replaces single flat dark background |
| 2026-03-21 | Keep existing fonts | Be Vietnam Pro, Space Grotesk, JetBrains Mono are excellent choices — no change needed |
| 2026-05-01 | Reconcile Surface Hover / Surface Elevated naming with implementation | Original DESIGN.md had values swapped relative to globals.css. Components were authored against globals.css naming and shipped correctly for months — the doc was the drift, not the code. Updated descriptions to match shipped reality. |
| 2026-05-01 | Add `3xl: 40px` and `display: 56px` to type scale | Landing hero/StatCounter (56px) and section headings (40px) had been shipping outside the documented scale. Doc was drift, not code. Corrected 2026-11-02: these ship as `text-[40px]` / `text-[56px]`; Tailwind v4 `text-3xl` is 30px and `text-2xl` is 24px, not 32px. |
| 2026-05-01 | Add `2xl: 24px` to border-radius scale | Landing cards and `TripSummary` skeleton cards had been shipping `rounded-2xl` outside the documented scale. Doc was drift, not code. Corrected 2026-11-02: Tailwind v4 `rounded-2xl` is 16px, not 24px (`rounded-lg` is 8px, `rounded-xl` 12px), so these cards render at 16px. |
| 2026-05-01 | Add four `--color-landing-*` tokens for marketing-only gradient surfaces | `#0D1B3E`, `#081428`, `#0B0B0D`, `#111114` are intentional dark-navy gradient art on the landing page. Tokenized so future changes happen in one place. Reserved for landing only — do not use in app surfaces. |
| 2026-11-02 | Battery colour thresholds are relative to the user's `minArrival` (D3) | Danger below `minArrival`, warn below `minArrival + 15`, one shared function for hero, gauge and timeline. Fixed 20/40 showed red for arrivals the user had explicitly allowed. Shipped in PR #129. |
| 2026-11-02 | Results screen leads with arrival battery + ETA (D4) | Battery and ETA (including charging time) first, cost second, route briefing last and collapsed. "Will I make it?" is the driver's first question. Shipped in PR #129. |
| 2026-11-02 | Muted is for non-information text only (D5) | Information text moves to `text-secondary`; placeholders, borders and disabled text stay `muted`; token value unchanged. Raising muted either still failed AA or collapsed the hierarchy. PR #108. |
| 2026-11-02 | Dark-only for now; measure `prefers-color-scheme` (D6) | A light theme waits for data: the colour scheme is logged through PostHog (PR #146) before deciding on Follow-OS. |
| 2026-11-02 | Primitives hand-rolled + cva/tailwind-merge, Base UI for Dialog/Drawer (D7) | One dependency instead of owning focus trap, Escape and portals in every modal; Base UI only after a jsdom spike. `MobileBottomSheet` stays hand-rolled. |
| 2026-11-02 | Keep `X-[var()]` tokens and add role tokens (D8) | Role tokens (status fg/bg/border, `on-accent`, `scrim`, z, size, motion) plus a TS export with a parity test. No codemod; primitives hide the long class strings. |
| 2026-11-02 | Semantic radius/type names per primitive (D9) | `rounded-card`, `text-heading` and similar are set as each primitive lands, instead of overriding Tailwind's scale in one big visual shift (74 `rounded-lg` would jump from 8px to 16px). |
| 2026-11-02 | Keep fonts and `#00D4AA`; drop Be Vietnam Pro 300; tabular numerals for live figures (D10) | No rebrand needed. Weight 300 is loaded for a single `font-light` use. |
| 2026-11-02 | Fallback map tiles are darkened OSM | CARTO dark tiles now require an API key; darkened OSM keeps the fallback map on the dark palette. Shipped in PR #140. |
