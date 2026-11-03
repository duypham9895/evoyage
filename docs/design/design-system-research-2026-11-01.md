# eVoyage design-system and end-user UX research — 2026-11-01 (rev 2)

HEAD `bfa3a3b` (`main`). Inputs: 5 code/live audits (tokens, components, a11y, mobile-driver, live site), 4 research memos (competitors, theming, vn-typography, ds-architecture), the only driver test in the repo (`docs/design/ev-driver-feedback-2026-03-19.md`), and three round-1 review lenses (evidence, user value, feasibility). Every `file:line` below was re-read at `bfa3a3b` for this revision. Claims REFUTED by a fact-check are excluded; WEAKENED ones are labelled. This is author-side verification: same vendor, same priors, no external verifier ran. Approval stays with Duy.

Revision 2 reorders the report around what a driver sees. Token and primitive work is now labelled **engineering hygiene** wherever a driver would not notice it.

## 1. TL;DR

- **The planner map is blank for every visitor, and this is not a headless artefact.** The production bundle ships `mapboxAccessToken:"[SENSITIVE]"`, a placeholder string, and Mapbox answers `401 {"message":"Not Authorized - Invalid Token"}`. The fallback to Leaflet never fires, because `plan/page.tsx:70` only checks that the token is non-empty. Details in §2.
- **eVi and the route briefing are down server-side** (curl: `/api/evi/parse` 503 `service_unavailable`; `/api/route/narrative` 500 with a valid body). The briefing sits second on the results screen, so its failure is on the main path.
- **Nine driver-trust bugs need no tokens and no primitives** (§3, Phase 0.5). Examples: the arrival-battery headline is always green (`TripSummary.tsx:554`), every chosen stop says "Tốt nhất" by construction (`station-ranker.ts:147-153`), and the ETA silently includes charging time (`TripSummary.tsx:450,455` vs `vi.json:64`).
- **The results screen leads with cost, then an async briefing, then "will I make it?"** (`TripSummary.tsx:827-846`). The driver test names battery-at-arrival as the core value (`ev-driver-feedback-2026-03-19.md:16,180`). This is a product decision (D4).
- **Muted text fails WCAG AA on every surface** (3.65 / 3.30 / 2.89 / 2.55; 207 text uses). Raising the hex alone fails too: `#8A8A96` measures 4.44 on surface-hover and 3.93 on surface-elevated, and a value that passes everywhere (`#9595A1`) is 1.14:1 from text-secondary, so the two tiers merge (D5).
- **Usage context.** The only driver evidence says people plan at home, often the night before, and switch to Google Maps or the VinFast app to drive (`ev-driver-feedback-2026-03-19.md:18,120,189`). In-car use is UNKNOWN. Round 1's "in-car, in-sunlight" framing is withdrawn.
- **Engineering hygiene, invisible to drivers:** no type, radius, z or motion tokens; 100 hand-styled buttons; 6 modal implementations. Correction to round 1: `@theme inline` does **not** block runtime theming today. All 963 colour sites use `X-[var(--color-Y)]`, which compiles to `var()` and follows `[data-theme]` overrides (re-run of the Tailwind compile in `scratchpad/tw/`). Inlining only matters after a codemod to native utilities, so theme work (D6) no longer depends on token work (D8).

## 2. Step −1: live P0s (do before any design work)

Checks were run on 2026-11-01 with headless Chromium. Chromium was run first with default flags, then with software WebGL (`--use-angle=swiftshader`), and the APIs were called with `curl`. The Playwright MCP browser was locked by another session, so a local `playwright` script was used instead (`scratchpad/p0check.mjs`, `scratchpad/tok.mjs`). Screenshots: `scratchpad/p0-headless-default.png`, `scratchpad/p0-swgl-headless-default.png`.

| P0 | Result of the check | Likely cause | Fix | Effort |
|---|---|---|---|---|
| Blank map | Default headless: `Failed to initialize WebGL`, which is an artefact. With WebGL working, the style request still fails: the browser reports CORS, and the same URL fetched directly returns **401 Invalid Token** with no `Access-Control-Allow-Origin`. The map chunk contains `mapboxAccessToken:"[SENSITIVE]"`. **Not a headless artefact; affects all users.** | `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` in the Vercel production env holds a placeholder. The prod build pulls that env (`deploy.yml:175`). Where the placeholder came from is UNVERIFIED. | Set a real `pk.` token in Vercel prod. In code, make `plan/page.tsx:70` require `startsWith('pk.')` so a bad token falls back to Leaflet (`activeMapMode` already supports `'osm'`, `:71`). Users cannot switch modes themselves (`map-mode.tsx:11-24` forces `mapbox`). | 0.5 day + Duy's go for the env change |
| eVi 503 | `curl` POST returns 503 `{"error":"service_unavailable"}`. Reproduced outside the browser. | `LLMUnavailableError` from the provider chain (`api/route/narrative/route.ts:4`, shared `callLLM`). Keys, quota or provider outage: UNVERIFIED. Check Vercel logs. | Restore provider config. Separately, the UI should say eVi is unavailable rather than look broken. | 0.5 day after logs |
| Narrative 500 | A valid body returns 500 `Failed to generate route narrative` after 8.4s. | The non-`Unavailable` branch (`narrative/route.ts:136-141`): schema error, abort or other. UNVERIFIED. | Same log check. Hide the briefing card on error instead of leaving a skeleton (live shot `m13`). | 0.5 day |
| Station detail 400 | Not re-run (needs a station id). The code returns 400 only for `INVALID_ID` or `NOT_VINFAST` (`stations/[id]/vinfast-detail/route.ts:29-33,56-60`). | The expander renders for `provider === 'VinFast'` (`StationDetailExpander.tsx:339`), but the API requires `isVinFastOnly` (`route.ts:56`). A VinFast-provider station that is not VinFast-only gets 400. This is inferred from code. | Gate the expander on the same field the API checks, and show a message instead of an empty bar. | 0.5 day |

The E2E suite mocks these APIs (`e2e/helpers/app.ts`), so they do not block screenshot baselines (feasibility B2). They block **users**, which is why they come first.

## 3. Phase 0.5: driver-trust fixes (independent of tokens and primitives)

| # | Driver sees | Evidence | Fix | Effort |
|---|---|---|---|---|
| T1 | Arrival battery in reassuring green even at 12% | `TripSummary.tsx:554` hard-codes `text-[var(--color-accent)]`. `getBatteryColor` (`:63-67`) is used only in the gauge (`:145`). RouteTimeline uses `<30` (`RouteTimeline.tsx:44,50`). | One shared threshold function (set by D3) used by the hero, gauge and timeline. Unit test on the boundaries. | 0.5 day |
| T2 | "Tốt nhất" (best) on every stop | The chosen station is the top of the sorted list, so it is always `best` (`station-ranker.ts:147-153`). Label at `TripSummary.tsx:900`. | Show rank only on alternatives, or replace the label with the reason (for example "ít đường vòng nhất", the shortest detour). | 0.5 day |
| T3 | An out-of-service status shows nothing | The planner already excludes `OUTOFSERVICE` (`api/route/route.ts:80,364`), and the crawl writes it (`scripts/crawl-vinfast-stations.ts:21,329`). But the stop card's status map has no `OUTOFSERVICE` key (`TripSummary.tsx:93-98`), so the status is blank. The gap is a station that breaks after the daily crawl (`crawl-stations.yml:6`, 01:00 UTC) or after the plan was made. | Add the key with plain text ("Đang bảo trì", under maintenance). Where live detail reports it, say so on the stop card. | 0.5 day |
| T4 | Raw coordinates as the trip title (intermittent, live `m13`) | Title is `extractCityName(startAddress)` (`TripSummary.tsx:447-448,551`). The `lat,lng` source is UNVERIFIED (GPS or eVi start are likely). | Fall back to a reverse-geocoded name or a localised "Vị trí của bạn" (your location). | 0.5 day |
| T5 | "<chiều đi>" / "<chiều về>" (outbound / return) inside station names (live `m19`) | Comes from feed data. Not found in `src`. | Strip it in the display formatter. Whether the backup is on the opposite carriageway is UNVERIFIED; if it is, it becomes a routing issue. | 0.25 day |
| T6 | FABs cover the primary button after planning | The FAB offsets are pinned to the half snap (`FeedbackFAB.tsx:261`, `EViFab.tsx:21`, `EViNudge.tsx:65`, all `55vh`), while planning snaps the sheet to full (`plan/page.tsx:530,613`). | Hide the FABs when the sheet is full. A structural fix comes in Phase 4. | 0.25 day |
| T7 | The place dropdown opens under the tab bar | `PlaceAutocomplete.tsx:234` uses `bottom-full` below `sm`. | Open downward and scroll the input into view. | 0.25 day |
| T8 | The same tab is called "Tuyến đường" (route) on mobile and "Chuyến đi" (trip) on desktop | `vi.json:137` vs `:390` | Pick one name. | 0.1 day |
| T9 | It is unclear whether the ETA includes charging | `totalTimeMin = drive + charging` (`TripSummary.tsx:450`), but the copy says only "~{{time}} · đến lúc {{eta}} nếu đi ngay" (arriving at {{eta}} if you leave now; `vi.json:64`) | Add "gồm {{charge}} sạc" (including {{charge}} charging), in both locales. | 0.25 day |

Total about 3–3.5 days. Each fix is one PR with a regression test (CLAUDE.md testing rules).

## 4. Current state

### 4.1 Usage context

The only driver evidence is the 2026-03-19 test. The tester plans before leaving, often the night before, and checks again in the morning (`:18,120`). He uses Google Maps or the VinFast app to drive (`:18,189`), and mainly uses the app on a phone (`:30`). **Provenance caveat:** the file was added in commit `97fed90` together with a design audit, a QA report and the fixes for its own bugs. Whether the tester was a real driver or a simulated persona is UNVERIFIED. Treat it as a hypothesis, not as user research. **Do drivers keep the app open while driving?** UNKNOWN. Wake lock, landscape and in-car sizing are therefore out of scope until that is measured.

### 4.2 Tokens (engineering hygiene unless noted)

| Issue | Evidence |
|---|---|
| `globals.css:3-30` declares 19 colours (15 app + 4 `--color-landing-*`) and 3 font families. There are no size, radius, z, shadow or motion tokens, so Tailwind defaults apply. | `globals.css:3-30` |
| The spec and the code disagree. `rounded-lg` renders 8px (74 uses), but DESIGN.md:74 says lg = 16px. `text-2xl` renders 24px, but DESIGN.md:28 says 32px. DESIGN.md:139-140 assume `rounded-2xl` = 24px; it is 16px. | `node_modules/tailwindcss/theme.css:347-365,397-404` |
| 963 `X-[var(--color-Y)]` class sites in 47 files. 0 native utilities. These sites are already runtime-themeable. About 37 more `var(--color-*)` references sit outside class strings: JS arrays, SVG `fill`/`stroke`, `[color:…]`. | grep; `LandingPageContent.tsx:47-52`; feasibility N3 |
| Undefined `--color-text` (6 uses) and `--color-bg` (2 uses). | `MapLocateButton.tsx:209,227`, `admin/layout.tsx:15`, `StatusActions.tsx:58`, `PlaceAutocomplete.tsx:243` |
| There is no role layer. `text-[var(--color-background)]` stands in for "on accent" 36 times. `safe` = `accent`. | `globals.css:9,13` |
| Raw palette classes. | `NearbyStations.tsx:76-78`, `StationDetailExpander.tsx:199,204` |
| **User-visible:** status colours differ between map and list. The map pins use iOS `#34C759`/`#FF3B30`. Separately, `map-utils.ts:8` `VinFast: '#34C759'` is a **provider brand colour, not a status colour**. Merging the two would make every VinFast pin look "available". | `smart-marker.ts:38-39,90`, `mini-card.ts:57,122` |
| Out of reach of CSS variables: the Mapbox basemap (`MapboxMap.tsx:535`), Carto tiles (`Map.tsx:48`), the WebGL route paint (`MapboxMap.tsx:48`), email HTML (`lib/feedback/email.ts`) and vendor popup chrome. `smart-marker`/`mini-card` HTML strings and the `html-to-image` share render *can* read `var()`. | feasibility N4 |
| `glowPulse` uses a third green, `rgba(0,210,106)`. | `globals.css:236-237` |
| The landing page shares the app tokens, plus its own art (`VietnamMap.tsx`, `vietnam-map-helpers.tsx`). No phase owned it in round 1; it now has an owner (Phase 1 note, D6). | feasibility N5 |

### 4.3 Components (engineering hygiene unless noted)

| Pattern | Count / divergence | Evidence |
|---|---|---|
| Buttons | 100 `<button>`. About 20 primary buttons with 5 heights, 4 radii and 3 hovers. About 25 ghost links with 15–20px targets (**user-visible**: hard to tap). | `plan/page.tsx:838-848`, `NearbyStations.tsx:485` |
| Modals | 6 implementations. No `createPortal` in `src`. `BatteryStatusPanel` and `AddCustomVehicle` have no role, no Escape and no focus trap. Rendered inside the `z-40` sheet, so the FABs can paint above the backdrop (render UNVERIFIED). | `BatteryStatusPanel.tsx:316`, `AddCustomVehicle.tsx:50`, `MobileBottomSheet.tsx:161` |
| Inputs | 20 inputs, all `text-sm`. Zoom is allowed (`layout.tsx:41`), so iOS zooms on focus (not tested on a device). | `PlaceAutocomplete.tsx:187`, `EVi.tsx:450,641` |
| Cards | Skeletons use 16px corners and loaded cards use 8 or 12px, so the corners jump when results arrive (**user-visible**, minor). | `TripSummary.tsx:216-228` vs `:548` |
| Status feedback | 8 spinners, 6 error boxes with no `role="alert"`. | `plan/page.tsx:856-860` |
| Segmented controls | 8 sites, 4 designs, 32–36px tall. | `BatteryStatusPanel.tsx:161,227,283` |

### 4.4 Accessibility (WCAG 2.2 AA; WCAG 2.x contrast formula)

| Text \ bg | bg `#0F0F11` | surface `#1A1A1F` | surface-hover `#252530` | surface-elevated `#2E2E3A` |
|---|---|---|---|---|
| foreground `#E8E8ED` | 15.68 | 14.19 | 12.41 | 10.97 |
| text-secondary `#A0A0AB` | 7.40 | 6.70 | 5.85 | 5.17 |
| **muted `#6B6B78`** | **3.65** | **3.30** | **2.89** | **2.55** |
| candidate `#8A8A96` | 5.61 | 5.08 | **4.44** | **3.93** |
| candidate `#9595A1` | 6.47 | 5.85 | 5.12 | 4.52 (1.14:1 vs secondary) |
| accent `#00D4AA` | 10.03 | 9.08 | 7.94 | 7.01 |
| danger `#FF4D4F` | 5.86 | 5.30 | 4.64 | **4.10** |

| Finding | Criterion | Evidence |
|---|---|---|
| Muted carries information: the reason Plan is disabled, battery labels, inactive tabs, "Unavailable" | 1.4.3 (`prd-feedback-system.md:204` says "already met", which is false) | `plan/page.tsx:851`, `BatteryStatusPanel.tsx:118`, `MobileTabBar.tsx:54`, `StationCard.tsx:82` |
| White on `#3b82f6` 3.68; white on green-600 ≈3.2–3.3; `danger/80` 3.80 | 1.4.3 | `WaypointInput.tsx:73`, `ShareButton.tsx:484`, `StationStatusReporter.tsx:126` |
| Borders 1.22–1.26; eVi focus ring `accent/30` 1.92 | 1.4.11 | `globals.css:18`, `EVi.tsx:450,641` |
| The sheet handle is a bare div with drag only | 2.5.7, 4.1.2 | `MobileBottomSheet.tsx:169-178` |
| The planning error, slow banner and timeout banner are not announced | 4.1.3 | `plan/page.tsx:856,862,870` |
| Map status is shown by colour only (`#34C759` vs `#FF3B30` = 1.60:1) | 1.4.1 | `smart-marker.ts:37-98` |
| No modal restores focus. The eVi sheet declares `aria-modal` but does not trap focus. | 2.4.3 | `EViMobileSheet.tsx:28-42` |

### 4.5 Mobile interaction ([O] observed in code, [I] inferred)

- [O] A horizontal drag anywhere in the sheet switches tabs, including on the battery sliders. The handler does not check the touch target (`MobileBottomSheet.tsx:143-155`). Device behaviour is UNVERIFIED.
- [O] The locate button and nearby bar sit inside `<main className="… isolate z-0">` (`plan/page.tsx:960`), so the sheet covers them. A z-index change cannot fix this, because removing `isolate` lets Leaflet panes (z 400–1000) escape. The button has to move out of `<main>` or be portalled.
- [O] Route fit uses a padding of 50 on every side (`Map.tsx:177`, `MapboxMap.tsx:444`), while the sheet snaps to full after planning (`plan/page.tsx:530`). The driver does not see the route (driver test BUG-D05).
- [O] The sheet animates `height` (`MobileBottomSheet.tsx:163-165`), against DESIGN.md:84. Switching to `transform` breaks the in-sheet `fixed` modals and the eVi `flex-1` layout (`:180`) unless Phase 3 portals ship first (feasibility B3).
- [O] Only `.pb-safe` exists (`globals.css:97-101`). There is no top inset.
- [I] At 320px the 5-tab bar overflows. At 360px QuickStats overflows (`TripSummary.tsx:159-214`). The savings amount truncation was seen live.

## 5. Scorecard (ecc:design-system Mode 3; scores are author judgement, 0–10)

| Dimension | Score | Example | Fix |
|---|---|---|---|
| Colour consistency | 4 | `smart-marker.ts:38-39` iOS green/red vs `--color-safe` in the list; `NearbyStations.tsx:76` `text-green-500` | Status `{fg,bg,border}` tokens and a TS export for the map. Keep VinFast brand separate. |
| Typography hierarchy | 4 | The most important number is 16px (`TripSummary.tsx:554`). 79 arbitrary px sizes, 47 of them at 10px. | Arrival ≥24px, tabular. 12px floor. Type tokens. |
| Spacing rhythm | 7 | 0 arbitrary spacing values; 127 half-steps such as `py-3.5` (`plan/page.tsx:842`) | Keep. Fix half-steps inside primitives only. |
| Component consistency | 3 | Duplicated overlay markup (`BatteryStatusPanel.tsx:316`, `AddCustomVehicle.tsx:50`) | Primitives plus Dialog (D7). |
| Responsive | 5 | FABs pinned to `55vh` (`FeedbackFAB.tsx:261`) | T6 now. Anchor to the sheet in Phase 4. |
| Dark-mode completeness | 6 | Dark-only by design, but no `color-scheme` or `themeColor` (`layout.tsx:36-41`). Light vendor popup (`MapboxMap.tsx:172-226`). `bg-white` locate button (`MapLocateButton.tsx:159`). | Declare `color-scheme: dark` and `themeColor`. Override `.mapboxgl-popup-*`. |
| Animation | 5 | Sheet animates `height` (`MobileBottomSheet.tsx:164`). The reduced-motion rule has no iteration count (`globals.css:270-272`). 2 `motion-reduce` uses. | `animation-iteration-count:1`. Transform after portals. |
| Accessibility | 3 | Muted 3.65 on bg. Errors not announced (`plan/page.tsx:856`). | D5. `role="alert"` in the Alert primitive. |
| Information density | 4 | Cost and an async briefing come before "will I make it?" (`TripSummary.tsx:827-846`). Three "no data" lines on every card (live `m19`). | D4. Hide empty fields. |
| Polish | 4 | Undefined `--color-text` (`MapLocateButton.tsx:209`). FAB hover icon 1.26:1 (`FeedbackFAB.tsx:259-268`). "Tốt nhất" everywhere. | Phase 1 and T2. |

Average 4.5 / 10.

## 6. AI-slop check (ecc:design-system)

- **Generic hero: yes, partly.** The landing page uses a badge pill, a big H1, a muted subtitle and one CTA (`LandingPageContent.tsx:102-125`), followed by 3 step cards (`:167`) and a 6-card feature grid (`:206`). This is the template SaaS shape. It is mitigated by the numbered eyebrows ("01"–"06") used instead of icons and by the Vietnam map art.
- **Gradients: 2 decorative sites.** `TripSummary.tsx:218,245` (`from-accent/5` tint on the briefing cards). The landing navy gradients (`LandingPageContent.tsx:102,371`) are brand art. The gauge (`TripSummary.tsx:135`), slider fill (`BatteryStatusPanel.tsx:37`) and shimmer (`StationDetailSkeleton.tsx:28`) are functional.
- **Glassmorphism: none decorative.** There are 5 `backdrop-blur` sites, all scrims or a sticky header (`LandingClient.tsx:63`, `FeedbackModal.tsx:245`, `ShareButton.tsx:454`, `MapLocateButton.tsx:208`, `VietnamMap.tsx:79`).
- **Icon grids and emoji: none found.** The only pictographic glyph in components is a "✕" close mark (`WaypointInput.tsx:96`), which is functional.
- **Off-brand palette: yes.** The share image is in GitHub-dark (`ShareButton.tsx:370`, `api/share-card/route.tsx:115`), which is the only asset seen outside the app.

## 7. What research says

| # | Claim | Source | Status |
|---|---|---|---|
| R1 | Light text on dark is least legible in dark surroundings. All polarities improve in daylight. | Dobres, Chahine, Reimer 2017, https://pubmed.ncbi.nlm.nih.gov/28166901/ | CONFIRMED (abstract). The daylight point comes from NN/g. |
| R2 | Light is better for normal vision and at night. NN/g says to let users switch. | https://www.nngroup.com/articles/dark-mode/ | CONFIRMED. "Follow the OS by default" is WEAKENED. Cataract benefit n=7. |
| R3 | Light-polarity advantage grows as text size shrinks. | Piepenbrock et al. 2014, *Human Factors* 56(5) | WEAKENED. Not cited for or against any option. |
| R4 | Google Maps "Automatic" follows the system. Waze has 4 options. | https://support.google.com/maps/answer/10189433, https://support.google.com/waze/answer/13772684 | Google WEAKENED, Waze CONFIRMED |
| R5 | Dark-mode share 81.9 / 9.9 / 8.2%. | https://www.androidauthority.com/dark-mode-survey-results-1090716/ | CONFIRMED, self-selected sample |
| R6 | Bottom sheets: visible Close, Back dismisses, nonmodal when minimised. | https://www.nngroup.com/articles/bottom-sheet/ | CONFIRMED |
| R7 | Stops shown as map pills. Plugs and live availability at the top of station detail. | https://abetterrouteplanner.com/resources/article/2026-05-12_abrp-7-1 | CONFIRMED (page does not say "kW"/"minutes") |
| R8 | No single trust score. Show working count, uptime and rating separately. | https://cleantechnica.com/2023/01/19/what-a-plugshare-score-really-means-how-it-could-be-better/ | CONFIRMED |
| R9 | In-app out-of-service banner (Electrify America, 2024). | https://insideevs.com/news/706634/electrify-america-app-broken-chargers/ | CONFIRMED. eVoyage status: T3. |
| R10 | User-set arrival SoC. | notateslaapp 2392; insideevs 791556 | WEAKENED |
| R11 | V-GREEN idle fee: minutes 1–10 free; 11–60 at 1,000 VND/min; 61–120 at 2,000; 121+ at 4,000; capped at 1,000,000 VND; effective 2025-11-01. Not for AC 11 kW or scooters. | https://vgreen.net/en/cau-hoi-thuong-gap | CONFIRMED by the review session's fetch. Not re-fetched for rev 2. |
| R12 | Never show "available" without "updated x ago". | Forum, Trustpilot and App Store posts | UNVERIFIED, not fetched. No phase depends on it. The existing `station_trust_recent_minutes` / `station_detail_stale` keys were not audited. |
| R13 | Vietnamese line-height: BVP stacked caps ≥1.42, lowercase ≥1.24; Space Grotesk ≥1.25. | fontTools; https://googlefonts.github.io/gf-guide/metrics.html | CONFIRMED arithmetic, not checked visually |
| R14 | `truncate` clips about 0.06em of stacked caps (24 sites). | same | WEAKENED: predicted, not seen |
| R15 | Platform minimum text about 11pt/sp. | Apple HIG / M3 | UNVERIFIED: pages did not render, no primary source. The 12px floor rests on DESIGN.md:23 only. |
| R16 | Uppercase plus tracking crowds Vietnamese marks (27 uses). | gf-guide metrics | WEAKENED |
| R17 | Be Vietnam Pro has no `tnum`. The repo has 0 `tabular-nums`. | fontTools GSUB | CONFIRMED |
| R18 | `formatVnd` uses a plain space before ₫. "M VND" is hard-coded. | `lib/trip/cost.ts:93-101` | CONFIRMED |
| R19 | vaul is unmaintained (v1.1.2, 2024-12-14). The shadcn Drawer moved to Base UI. | https://github.com/emilkowalski/vaul | CONFIRMED |
| R20 | Base UI can do a non-dismissible sheet. | https://base-ui.com/react/components/drawer | WEAKENED, untested. Behaviour under jsdom is UNVERIFIED (may need a `getAnimations` polyfill). |
| R21 | Licences: cva Apache-2.0; shadcn, Base UI, tailwind-merge MIT; vercel/chatbot NOASSERTION. | `gh api` | CONFIRMED |
| R22 | Be Vietnam Pro and Space Grotesk ship a Vietnamese subset. | Next 16.4.3 (`package.json:41`) `font-data.json` | CONFIRMED in an earlier Next read. Not re-checked on 16.4.3. |

**Gap (user-value 9):** only R7–R11 are about EVs, and only R11 is about Vietnam. The cheapest real user evidence is to re-run the 5 scenarios in the driver test on the current build with one or more real VinFast drivers. That costs about one afternoon and also settles the provenance caveat in §4.1.

## 8. Decisions for Duy

Order: cheapest and most unblocking **for end users** first. The sequencing and "accept the remaining risk" question is last. 11 decisions in total.

### D1. Approve Step −1 now?
- **What must be decided:** whether to change the Vercel production env (Mapbox token) and ship the token guard, eVi/narrative error handling and the station-detail gate before anything else.
- **Why now:** the map is blank for 100% of visitors (§2). Every other fix is invisible behind it.

| Option | Get | Lose | Risk | Effort |
|---|---|---|---|---|
| A. Fix env plus guard plus graceful errors now | A working map. Bad tokens fall back to Leaflet. | — | Low. The env change is a deploy and needs Duy's go. | 1.5–2 days incl. log triage |
| B. Fix the env only | A working map today | The next bad token blanks the map again | Repeat outage | 0.1 day |
| C. Defer to the design roadmap | — | Weeks of blank map | High | 0 |

- **Recommendation: A.** It rests on the bundle string `"[SENSITIVE]"` and the 401 response, measured today.
- **Real tradeoff:** half a day of guard code buys immunity from a whole class of config mistakes.
- **If wrong:** fully reversible. The guard is one line.

### D2. Ship Phase 0.5 (T1–T9) before any system work?
- **What must be decided:** whether the 9 driver-trust fixes go ahead of tokens and primitives, in parallel with Phase 0.
- **Why now:** every T item is visible on the first trip and none depends on tokens.

| Option | Get | Lose | Risk | Effort |
|---|---|---|---|---|
| A. Yes, in parallel with Phase 0 | Driver-visible wins in week 1 | Some classes get touched twice (T1 again in Phase 5) | Low | 3–3.5 days |
| B. Fold them into the phases (round 1) | One touch per file | 2–4 weeks of known trust bugs | Medium | Same |
| C. Fix T1–T3 only | Fastest | T4–T9 stay | Low | 1.5 days |

- **Recommendation: A.** Each T item is a 0.1–0.5 day change with its own test (§3 table).
- **Real tradeoff:** a little rework in exchange for driver trust weeks earlier.
- **If wrong:** reversible per PR.

### D3. Battery thresholds: one set for every surface
- **What must be decided:** which colour boundaries apply to the arrival hero, gauge and timeline.
- **Why now:** T1 needs the function. Today TripSummary uses >40/>20 (`TripSummary.tsx:63-67`) and RouteTimeline uses <30 (`RouteTimeline.tsx:44,50`).

| Option | Get | Lose | Risk | Effort |
|---|---|---|---|---|
| A. Fixed 20/40 (TripSummary's current values) | Least change | 15–20% arrivals show red although the user set 15% (`DEFAULT_MIN_ARRIVAL = 15`, `types/index.ts:10`) | Alarm fatigue | 0.25 day |
| B. Fixed 15/30 | Matches the default floor | Wrong for users who set another floor | Low | 0.25 day |
| C. Relative: danger below the user's `minArrival`, warn below `minArrival + 15` | The colour means "how close to *your* floor" | Harder to explain in one sentence | Low | 0.5 day |

- **Recommendation: C.** The planner already targets the user's own `minArrival` (`plan/page.tsx:115`), so fixed boundaries contradict a setting the user chose.
- **Real tradeoff:** correctness per user versus one memorable rule.
- **If wrong:** a one-function change.

### D4. What is the first thing on the results screen?
- **What must be decided:** the order of the cost hero, the async route briefing and the arrival-battery and ETA card.
- **Why now:** today the order is cost, then the briefing (which shifts layout and currently fails), then "will I make it?" (`TripSummary.tsx:827-846`).

| Option | Get | Lose | Risk | Effort |
|---|---|---|---|---|
| A. Arrival battery and ETA (with charging time) first, cost second, briefing last and collapsed | Answers the driver's first question (`ev-driver-feedback:16,180`). No layout shift. | Cost loses its "first thing" slot (comment at `TripSummary.tsx:827`) | Low | 0.5–1 day |
| B. Keep cost first | No change | The anxiety question comes third | Medium | 0 |
| C. One combined hero line ("Còn 32% khi tới · 5h40 · ~180k ₫", 32% left on arrival · 5h40 · about 180k VND) | Both in one glance | Dense at 360px | Overflow | 1 day |

- **Recommendation: A.** The driver test ranks battery visualisation and station status above cost as reasons to return (`:177-183`). Cost is a must-have (FR-02) but comes second.
- **Real tradeoff:** the "EV saves money" message moves from first to second.
- **If wrong:** a reorder of JSX blocks. Cheap.

### D5. Muted contrast
- **What must be decided:** how to make information text pass AA.
- **Why now:** 207 text uses fail on every surface (§4.4).

| Option | Get | Lose | Risk | Effort |
|---|---|---|---|---|
| A. Raise muted to `#8A8A96` | One line | Still fails on hover (4.44) and elevated (3.93) | Partial fix | 0.5 day |
| B. Raise muted to `#9595A1` | Passes on all 4 surfaces | Muted and secondary merge (1.14:1), so the hierarchy collapses | Flat UI | 0.5 day |
| C. Move information labels to `text-secondary`. Keep muted for disabled text only (WCAG 1.4.3 exempts inactive components). Give placeholders a passing value. | Correct semantics, and the hierarchy survives | Per-site triage of 207 uses in ~47 files | Missed sites. The Phase 0 ratchet catches them. | 1.5–2.5 days |

- **Recommendation: C.** DESIGN.md:45 already limits muted to non-information use, and the measured A and B numbers above rule out a one-line fix.
- **Real tradeoff:** two days of triage versus a flat or still-failing palette.
- **If wrong:** token values can be reverted. The per-site moves are mechanical to undo.
- Note: muted is also used as `border-` (8) and `bg-` (7), for example the sheet handle (`MobileBottomSheet.tsx:177`) and the scrollbar. The landing hero paragraph also changes (`LandingPageContent.tsx:116`).

### D6. Theme strategy (reframed for night-time planning at home)
- **What must be decided:** dark-only, or follow the OS with a manual override.
- **Why now:** the usage evidence is planning at home at night (§4.1), and R1/R2 say light-on-dark is least legible in dark surroundings for some users. It is no longer blocked by tokens (TL;DR correction).

| Option | Get | Lose | Risk | Effort |
|---|---|---|---|---|
| A. Dark-only, with the D5 fix and a 12px floor | Brand kept ("flight instrument panel", DESIGN.md:12) | Users who prefer light at night | Low | in D5 |
| B. Follow OS plus manual Auto/Sáng/Tối (light/dark) | Legibility for light-preferring users | Two themes to QA. Light accent needed (`#007A63` = 5.30 on white). Nonce'd head script (`middleware.ts:91`). Two basemaps, vendor popup CSS, landing art, manifest test. | Flash of the wrong theme | 3–5 days, any time |
| C. Sunset or ambient switching | Imitates nav apps | — | Misfires. Google defers to the OS (R4). | B + 1–2 days |

- **Recommendation: A now.** Log `prefers-color-scheme` through existing telemetry for 2–4 weeks, then decide on B with data. This rests on R5 being the only share data (unrepresentative) and on R1/R2 not settling comfort versus legibility at night.
- **Real tradeoff:** a few weeks of possibly worse night legibility for some users, in exchange for not committing to permanent double QA on no data.
- **If wrong:** B can start at any time. 963 sites already resolve through `var()`.

### D7. Primitive library (engineering hygiene; user-visible only through modal a11y and the FAB-over-backdrop bug)

| Option | Get | Lose | Risk | Effort |
|---|---|---|---|---|
| A. Hand-rolled plus cva + tailwind-merge | Control, small footprint | We maintain focus trap, Escape and portals | a11y regressions | build 3–4 + migrate 5–8 days |
| B. A plus Base UI for Dialog/Drawer only | Maintained portals and focus. Fixes stacking. | One dependency. jsdom behaviour UNVERIFIED (R20). | A spike may need a polyfill | build 4–5 + migrate 5–8 days |
| C. `shadcn init` | Fast scaffold | Icon-heavy default style that conflicts with "Less Icons, More Humanity" | Brand dilution | 8+ days |

- **Recommendation: B**, with a half-day jsdom spike first. It rests on 2 modals with no a11y (`BatteryStatusPanel.tsx:316`, `AddCustomVehicle.tsx:50`), no `createPortal` anywhere, and vaul being unmaintained (R19). Keep `MobileBottomSheet` hand-rolled.
- **Real tradeoff:** one dependency in exchange for not owning focus management in 6 places.
- **If wrong:** reversible per component. The spike fails cheaply.

### D8. Token architecture (engineering hygiene)

| Option | Get | Lose | Risk | Effort |
|---|---|---|---|---|
| A. Keep the `X-[var()]` form and add role tokens (status `{fg,bg,border}`, `on-accent`, `scrim`, z, size, motion) plus a TS export with a CSS-to-TS parity test | One status green across map and list. No codemod. Theme-ready already. | Long class strings stay; primitives hide most of them | Low | 1–1.5 days |
| B. A plus a codemod to native utilities, moving colours off `@theme inline` | Shorter classes | 22 class assertions in 7 test files break. ~37 non-class refs need hand edits. Whether `@theme` keeps JS-only variables is UNVERIFIED. | Codemod errors | 3–4 days |
| C. B plus component aliases | Fine control | ~8 more names | Over-engineering | +1 day |

- **Recommendation: A.** F1 removed the theming reason for the codemod, and primitives (D7) encapsulate the class strings anyway.
- **Real tradeoff:** readable class names versus 2–3 days and a test-churn PR.
- **If wrong:** B can follow later. A's names are the same targets.

### D9. Radius and type scale (engineering hygiene; one visible effect is the skeleton-to-card corner jump)

| Option | Get | Lose | Risk | Effort |
|---|---|---|---|---|
| A. Override the scales to the DESIGN.md values | The spec becomes real | 74 `rounded-lg` go from 8 to 16px. Headings grow. | Vietnamese overflow | 1 day + baseline re-bless |
| B. Rewrite DESIGN.md to match the code | No visual change | Gives up the 32/40px heading intent | Low | 0.5 day |
| C. Semantic names (`rounded-card`, `text-heading`), set per primitive | No big-bang | Two naming systems during migration | Drift if migration stalls | spread across phases |

- **Recommendation: C**, and correct DESIGN.md:139-140 now. It rests on the measured 8px majority.
- **Real tradeoff:** a temporary dual vocabulary versus one large visual shift.
- **If wrong:** cheap, because names map to values.

### D10. Fonts and accent (engineering hygiene)

| Option | Get | Lose | Risk | Effort |
|---|---|---|---|---|
| A. Keep the fonts and `#00D4AA`. Drop BVP weight 300 (one `font-light`). Tabular numbers for live figures. | No rebrand | — | None | 0.5 day |
| B. Body font to Inter | `tnum` in body text | BVP's Vietnamese design | Diacritics UNVERIFIED | 1–2 days |
| C. New identity | — | Brand equity | High | Large |

- **Recommendation: A.** It rests on R17, R22 and accent = 10.03:1 on bg.
- **Real tradeoff:** none material.
- **If wrong:** font swaps are reversible.

### D11. Sequencing, and accepting the remaining risk (the sum of D1–D10, so it is last)
- **What must be decided:** whether to accept §9 as ordered, with the unknowns in §10 unresolved.

| Option | Get | Lose | Risk | Effort |
|---|---|---|---|---|
| A. Big-bang branch | One coherent change | Weeks off `main`. Dependabot conflicts. | High | ~5–7 weeks |
| B. §9 as ordered: user fixes first, then a safety net, then hygiene, one surface per PR | Driver value in week 1. Stop at any phase. | Mixed old and new styles for weeks. Baselines re-blessed for each visual phase. | Low–medium | ~5–7 weeks, more than A because of re-blessing |
| C. Step −1 and Phase 0.5 only | Most of the user value | Drift continues | Medium | ~1 week |

- **Recommendation: B.** It rests on 0 `toHaveScreenshot` today and on every user-visible fix being front-loaded, so stopping after any phase still leaves drivers better off.
- **Real tradeoff:** a longer total in exchange for being able to stop.
- **If wrong:** cut to C at any phase boundary.

## 9. Roadmap

Every phase: `npm test` green and `npx next build` clean. The test count must be ≥ the count at the start of the phase. Today that is 154 test files; 1738 tests were measured by the review session. The suite flaked once in 2 runs, so re-run before calling a failure real. Each phase adds a row to the DESIGN.md Decisions Log. Effort figures are author estimates (UNVERIFIED).

| Phase | Scope | Depends on | Verification | Effort |
|---|---|---|---|---|
| −1. Live P0s | §2 | Duy's go (env) | Map renders with a real token. The `pk.` guard has a unit test. eVi/narrative return 200, or the UI hides them gracefully. | 1.5–2 d |
| 0.5. Driver trust | T1–T9 (§3), threshold per D3, order per D4 | D2–D4 | One regression test per item | 3–3.5 d |
| 0. Safety net | **Guard as a shrinking ratchet:** a Vitest guard over `.ts` and `.tsx` (hex, raw palette classes, `text-[9-10px]`, undefined `var(--color-*)`) plus a contrast test, each with a frozen allowlist of today's violations that may only shrink. **It ships green.** **Screenshots:** a separate `playwright.visual.config.ts` with one Linux Chromium project, run against `next build && next start`. Map canvas masked (`.mapboxgl-canvas, .leaflet-tile-pane`). Widths 360 and 393. Baselines generated in CI on `ubuntu-latest` (or the Playwright Docker image), never on a Mac. Non-required for 2 weeks to measure flake. | — | Guard green, allowlist committed. Two identical CI runs with 0 diff. | 2–3 d |
| 1. Token bugs | Define `--color-text`/`--color-bg`. Add `accent-chip-hover`. Fix the `glowPulse` rgba. Palette classes → tokens. D5. `color-scheme: dark` and `themeColor`. DESIGN.md:139-140. **Landing restyles here as well;** review its baseline explicitly. | 0 | Allowlist entries removed. Contrast test passes for information text. Expected diffs: muted text, muted borders and backgrounds, landing hero paragraph. | 2–3 d |
| 2. Role tokens (D8-A) | Status, `on-accent`, `scrim`, z, size and motion tokens. `src/lib/design-tokens.ts` with a parity test. Map pins use the status tokens; the VinFast brand colour stays separate. | 1 | One "available" green across map and list (unit test) | 1–1.5 d |
| 3. Primitives (D7) | `src/components/ui/`: Button, IconButton, Field (16px), Chip, Badge, Card, SegmentedControl (44px), Alert (`role="alert"`), Spinner, Skeleton, SectionLabel. Base UI Dialog **with portals** for all 6 modals. One surface per PR, FeedbackModal first. Update the 22 class assertions as surfaces migrate. | 2 | Component tests. Input font-size ≥16 (E2E). Primary targets ≥44px. Modal E2E: Escape, focus trap and restore, FAB not clickable behind the backdrop. | 9–13 d |
| 4. Sheet | The handle becomes `<button aria-expanded>`. Swipe-to-switch ignores range inputs and horizontal scrollers. **Transform animation only after Phase 3 portals, plus a sheet-content layout redesign** (eVi `flex-1`, `MobileBottomSheet.tsx:180`). **The locate button moves out of `<main isolate>`** (`plan/page.tsx:960`) or is portalled. FABs anchored to the sheet. Route fit padded by sheet height. Safe-area insets. Plan errors announced. | 3 | E2E: drag a slider, tab unchanged. Keyboard snap change. axe on `/plan`. Assert the eVi input is in the viewport at each snap (the existing `box.height > 100` check does not catch it). | 4–6 d |
| 5a. Data presentation | Arrival/ETA numerals ≥24px, tabular. 10/11px → ≥12px. `formatVnd` NBSP and a locale key for "triệu ₫". Line-height tokens. | 3 | `formatVnd` contains U+00A0. 360px screenshots: savings amount and QuickStats not truncated. | 2–3 d |
| 5b. Product copy (needs Duy, not design work) | V-GREEN idle-fee note for DC with the full tiers (R11). Freshness "updated x ago" (R12, unsourced). "Hệ số an toàn" (safety factor) wording (BUG-D11). Mapbox named in `plan_disabled_select_locations`. | product decisions | Copy reviewed in both locales | TBD |
| 6. Theming (if D6 = B) | `[data-theme]` values, nonce'd head script, light basemaps for both providers, `.mapboxgl-popup-*` overrides, landing art plan, manifest test | D6 | `emulateMedia` E2E in both schemes. Contrast test for both palettes. | 3–5 d |

Total for −1 to 5a: about 25–36 days. This replaces round 1's 8–11 days, which left out migration, Phase 0, Phase 4 and re-blessing baselines.

## 10. Conflicts and unknowns

- **Theme:** the memos split. The research does not settle comfort versus legibility at night. This is D6.
- **Driver-test provenance:** real driver or simulated persona? UNVERIFIED (§4.1).
- **In-car use:** UNKNOWN. It gates wake lock, landscape and in-car sizing.
- **Live causes:** where the `"[SENSITIVE]"` token value came from; eVi 503 and narrative 500 root causes (needs Vercel logs); the station-detail 400 branch (inferred from code); the coordinate-title source; whether the "<chiều về>" backup is on the opposite carriageway.
- **Rendering not verified:** iOS input zoom, FABs above the modal backdrop, swipe-on-slider, Vietnamese overflow at 320/360px, diacritic clipping, `var()` in SVG `fill` and Leaflet options, notch overlap in the installed PWA.
- **Tooling:** whether `@theme` (not inline) keeps JS-only variables (only relevant for D8-B); Base UI under jsdom; `tailwindcss: ^4` minor bumps causing screenshot churn on Dependabot PRs (`package.json:69`).
- **Not fetched:** ISO 15008, NHTSA Phase 2, Apple HIG and M3 type minimums, AmbientLightSensor status, and the 19% / 26% / 4% styling shares from components audit §10 (no method recorded, dropped from rev 2).

## Appendix: Review response (round 1)

Each finding was re-checked at `bfa3a3b`.

| Finding | Verdict | Evidence / change |
|---|---|---|
| Evidence F1 `@theme inline` | ACCEPTED | Re-ran the reviewer's compile (`scratchpad/tw/run2.mjs`). `.bg-[var(--color-accent)]` → `var(--color-accent)`, and the `[data-theme=light]` override is emitted. TL;DR, D6 and D8 restated; the D6 dependency is removed. |
| F2 DESIGN.md:73 | ACCEPTED | lg is `:74` = 16px |
| F3 `#8A8A96` | ACCEPTED | Recomputed: 5.61/5.08/4.44/3.93. `#9595A1` 1.14:1 vs secondary. Drives D5. |
| F4 line drift | ACCEPTED | All `plan/page.tsx`, `EVi.tsx` and `StatusActions.tsx` lines re-read. Sheet handle bg is `:177`, not `:184`. |
| F5 V-GREEN tiers | ACCEPTED | R11 rewritten. Not re-fetched; relies on the review session's fetch. |
| F6 token count | ACCEPTED | 19 colours + 3 fonts |
| F7 uncited claims | ACCEPTED | R15 → UNVERIFIED. R12 removed from the phases. Styling-share row dropped. |
| User-value B1 orphaned trust bugs | ACCEPTED | Phase 0.5 and D2 |
| User-value B2 out-of-service never shown | PARTLY REJECTED | The planner already excludes `OUTOFSERVICE` (`api/route/route.ts:80,364`), and `partitionOutOfService` is consumed by `scripts/crawl-vinfast-stations.ts:21,329`. The reviewer's grep covered `src/` only. The residual gap (blank status, `TripSummary.tsx:93-98`; daily-crawl window) is T3. |
| B3 usage context | ACCEPTED, with corrections | The file is `docs/design/ev-driver-feedback-2026-03-19.md`, not `docs/`. A provenance caveat was added (§4.1). |
| B4 arrival colour, hierarchy | ACCEPTED | T1, D3, D4. The `97fed90` commit message claims "bold warning when <25%", but the hero at `:554` has no such logic at HEAD. |
| B5 live P0s | ACCEPTED | Step −1. The headless check was run: the blank map is real, caused by the token, not WebGL (§2). |
| Feasibility B1–B4 | ACCEPTED | Ratchet guard; visual config on a prod build, Linux Chromium only, masked; Phase 4 depends on Phase 3 portals plus a layout redesign; locate button is a structural move. |
| N1 Phase 1 risk | ACCEPTED | Expected diffs and landing restyle named |
| N2 baseline | ACCEPTED | 154 test files counted. 1738 tests and the flake are from the review run, not re-run. |
| N3 assertions | ACCEPTED | 22 across 7 files counted (`toContain`/`toHaveClass`/`className` `toMatch`) |
| N4 map surfaces, VinFast brand | ACCEPTED | §4.2 |
| N5 landing | ACCEPTED | Phase 1 and Phase 6 |
| N6 effort | ACCEPTED | Re-estimated in §9 |
| N7 Base UI jsdom | ACCEPTED | D7 spike |
| N8 Phase 5 split | ACCEPTED | 5a / 5b; threshold moved to D3 |
| N9 P0 phase | ACCEPTED | Step −1 |
| N10 Next version | ACCEPTED | 16.4.3 |
| User-value 6 hygiene labels | ACCEPTED | Labels on D7–D10 and §4.2–4.3 |
| User-value 7 missing driver pain | PARTLY ACCEPTED | Copy items in 5b. Station-name truncation (BUG-D06) was addressed in `97fed90` (`line-clamp-2`); the current state was not re-checked. Freshness and offline are not assessed and are listed as gaps, not phased. |
| User-value 8 ordering | ACCEPTED | §8 order |
| User-value 9 research gap | ACCEPTED | Re-run the driver test (§7) |
| User-value 10 ETA | ACCEPTED | T9. The ETA does include charging (`TripSummary.tsx:450`). |

## Review round 2 (open NONBLOCKING notes)

Reviewed by a fresh Claude session — same vendor, same priors; no external verifier ran. Round 2: 0 BLOCKERs across evidence, user-value and feasibility lenses. Full text: session scratchpad `review-round2.md`. Notes that change how a decision should be read:

- **D1 cause may be the CI build, not the dashboard value.** Production is built in GitHub Actions (`deploy.yml:175` `vercel pull --environment=production`, `:179` `vercel build --prod`). Vercel now defaults new env vars to Sensitive; a Sensitive value may arrive in `vercel pull` as a placeholder, which the build inlines (UNVERIFIED hypothesis). If so, D1 option B (re-enter the token) does nothing. Cheapest check: is `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` marked Sensitive in the Vercel dashboard. Fix candidates: mark it non-sensitive (it is a public `pk.` token by design) or inject it from a GitHub secret at build.
- **D1 guard scope.** `startsWith('pk.')` does not catch revoked, URL-restricted or expired `pk.` tokens, nor `pk.dummy_token_for_ci_build` (`deploy.yml:110`). Option A should include a runtime fallback to Leaflet on Mapbox style/auth `error`.
- **T3 is mostly cosmetic.** The route API already excludes out-of-service stations (`api/route/route.ts:363-366`), so the stop card rarely receives that status. The real gap is staleness: crawl runs daily at 01:00 UTC (`crawl-stations.yml:6`) and drivers plan the night before. Re-scope T3 to "show status age per stop / re-check stops when a plan is reopened", and note it depends on the station-detail fix in Step −1.
- **Dependencies to correct in §9:** Phase 4 depends on Phase 3 only for portals; Phase 5a does not depend on Phase 3. T3, T6 and the D5-C mitigation are underestimated.

## Decision record (2026-11-02)

Decided by Duy, one question at a time. From D7 onward Duy said "cứ chọn mọi options mà bạn nghĩ là tốt nhất", so D7–D11 take the report's recommendation.

| # | Decision | Choice | Note |
|---|---|---|---|
| D1 | Step −1 live P0s | A | Fix work is owned by PRs #106 (map), #102 (station detail), #101 (eVi/LLM); plan-review findings posted on each. CI/env change (mark `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` non-sensitive or inject at Build) still needs Duy's separate go. |
| — | Post plan-review findings on #101/#102/#106 | A | Posted 2026-11-02. |
| D2 | Phase 0.5 driver-trust fixes first | A | One PR per fix with a regression test. T4 dropped here: covered by #106. |
| D3 | Battery colour thresholds | C | Relative to the user's `minArrival`: danger below it, warn below `minArrival + 15`. One shared function for hero, gauge and timeline. |
| D4 | First thing on the results screen | A | Arrival battery + ETA (incl. charging) first, cost second, briefing last and collapsed. Also justified by #107 (cost ~11% low). |
| D5 | Muted contrast | C | Information text → `text-secondary` across all ~207 sites, building on PR #108's branch; placeholders, borders and disabled text stay `muted`; token value unchanged. Before/after sign-off by Duy before merge (#108 gate). |
| D6 | Theme | A | Dark-only for now. Measuring `prefers-color-scheme` needs PostHog live; `NEXT_PUBLIC_POSTHOG_KEY` was absent from the 2026-09-30 prod env pull (UNVERIFIED today). OPEN: Duy to decide whether to enable PostHog. |
| D7 | Primitives | B | Hand-rolled + cva/tailwind-merge; Base UI (`@base-ui/react` 1.9.0, MIT) for Dialog/Drawer after a half-day jsdom spike. `MobileBottomSheet` stays hand-rolled. |
| D8 | Token architecture | A | Keep `X-[var()]`; add role tokens + TS export with parity test; no codemod. |
| D9 | Radius/type scale | C | Semantic names per primitive; correct DESIGN.md:139-140 now. |
| D10 | Fonts/accent | A | Keep; drop BVP 300; tabular numerals for live figures. |
| D11 | Sequencing | B | Phased per §9, user fixes first. |
