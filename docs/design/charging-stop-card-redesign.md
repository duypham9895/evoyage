# Charging Stop Card Redesign Specification

**Author:** Head of Design
**Date:** 2026-03-19
**Status:** Draft
**Affects:** `TripSummary.tsx`, `StationInfoChips.tsx`

---

## 1. Research Findings

### 1.1 A Better Route Planner (ABRP)

ABRP 7.0 (Jan 2026) is the benchmark for EV trip planning UX.

**Key patterns observed:**
- **Primary display:** Charger name + network badge + power rating (kW) prominently shown
- **Battery visualization:** Arrival SoC and departure SoC shown inline with a mini battery icon, colored by urgency (green >50%, yellow >25%, red <25%)
- **Charge duration:** Displayed as a single prominent number ("12 min") rather than buried in metadata
- **Progressive disclosure:** Summary card shows name, power, charge time, arrival/departure SoC. Tap to expand for amenities, occupancy, ratings
- **Route alternatives:** Up to 9 route alternatives with smart labels ("Fastest", "Fewest stops", "Scenic") -- alternatives are route-level, not per-stop
- **Station insights:** Occupancy indicators, user ratings, amenity icons (food, restrooms, WiFi) shown as small icons rather than text chips

**Takeaway:** ABRP treats charge time as the hero metric. Everything else is secondary. Network badges provide instant brand recognition.

### 1.2 PlugShare

**Key patterns observed:**
- **Community-driven:** Station cards prominently feature user ratings (star system) and photo count
- **Card layout:** Station name at top, then real-time availability indicator (green/yellow/red dot), then connector types as small icons (not text), then distance
- **Trip planning:** Auto-selects optimal stations along route; the trip view shows a vertical timeline with station cards as nodes
- **Amenity display:** Small pictogram icons for nearby amenities (hotel, restaurant, restroom) rather than text labels
- **Filtering first:** Heavy emphasis on pre-filtering by connector, speed, and network before showing results -- reduces per-card information load

**Takeaway:** PlugShare reduces card clutter by moving filtering upstream. Cards show only what survives the filter, plus social proof (ratings/photos).

### 1.3 ChargePoint

**Key patterns observed:**
- **Availability-first hierarchy:** Real-time availability is the most prominent element -- "2 of 4 available" with a green/red indicator
- **Progressive disclosure:** Summary shows name, availability, distance, power. Detail view reveals pricing, popular times chart, driver tips
- **Station card structure:** Compact card with left-aligned content: name, address (truncated), then a single row of key stats (availability | power | distance)
- **Action-oriented:** "Start Charging" or "Get Directions" as primary CTA, always visible
- **Favorite/save pattern:** Heart icon for saving stations, reducing cognitive load for return trips

**Takeaway:** ChargePoint proves that availability status deserves top-level prominence. Their single-row stat layout is clean and scannable.

### 1.4 Google Maps EV Routing

**Key patterns observed:**
- **Inline route integration:** Charging stops appear directly in the turn-by-turn direction list, not as separate cards
- **Battery estimate:** Shows estimated battery level at arrival as a percentage with color coding (red <7%, yellow <20%, green >20%)
- **AI descriptions:** Natural-language descriptions of charger locations ("Enter the underground parking, turn right before the exit")
- **Minimal card:** Station name, network logo, availability ("2 available"), estimated charge time. Nothing else on the summary
- **Live data:** Real-time charger status (in use, offline, available) with last-updated timestamp
- **Amenity integration:** Shows nearby places (restaurants, restrooms) as separate "things to do while charging" section

**Takeaway:** Google Maps proves that less is more. Their cards show 4 data points maximum. Amenities are separated from station info entirely.

### 1.5 Tesla Trip Planner

**Key patterns observed:**
- **Automated confidence:** Trip planner auto-adds all Supercharger stops; user sees a simple ordered list with estimated times
- **Per-stop display:** Supercharger name, recommended charge time ("Charge for 15 min"), arrival battery estimate, stall availability ("6/8 available")
- **Battery visualization:** Color-coded arrival percentage shown prominently in the direction list -- the single most important data point
- **No alternatives:** Tesla does not show alternative stations -- it picks the optimal one. Reduces decision fatigue
- **Availability chart:** Tap-and-hold reveals time-of-day availability prediction ("Most Chargers Available" / "Most in Use")
- **Preconditioning cue:** Battery preconditioning status shown as a subtle indicator when approaching a Supercharger

**Takeaway:** Tesla minimizes user decisions. The card is almost notification-simple: just name, charge time, and battery level. This is the gold standard for reducing anxiety.

### 1.6 Chargeway

**Key patterns observed:**
- **Color + number system:** Each station pin shows a color (plug type: red=Tesla/NACS, green=J1772/CCS, blue=CHAdeMO) and a number (1-7 for power level)
- **Instant recognition:** Drivers learn their car's "color and number" once (e.g., "Green 7" for Kia EV6), then scan the map for matches
- **Station card:** Minimal -- station name, color/number badge, network name, distance. Connector compatibility is communicated entirely through the color system
- **No information overload:** By encoding two dimensions (plug type + power) into a single visual glyph, Chargeway eliminates the need for separate connector and power fields

**Takeaway:** Chargeway's genius is encoding multiple data dimensions into a single visual symbol. The rank badge in evoyage (Best/OK/Slow) serves a similar purpose but could be more visually distinctive.

---

## 2. Design Principles

### P1: Battery Is the Story
The arrival and departure battery percentages, along with charge time, are the only data points that every user needs on every card. Everything else is supporting context. Inspired by Tesla and ABRP.

### P2: Progressive Disclosure Over Density
Show 4-5 data points on the summary card. Everything else lives behind a tap. Inspired by Google Maps and ChargePoint. Current evoyage shows 8+ chips -- cut to 3 max.

### P3: Visual Encoding Over Text Labels
Replace text chips with icons, color codes, and spatial positioning wherever possible. Inspired by Chargeway's color/number system and PlugShare's pictogram amenities.

### P4: One Primary Action
Each card has exactly one primary CTA. Secondary actions are de-emphasized or hidden. Current evoyage has Navigate + Details Expander + Alternatives toggle competing for attention.

### P5: Reduce Decision Fatigue
The "Best" station is the default and should feel complete on its own. Alternatives are available but presented as a deliberate opt-in, not a visual distraction. Inspired by Tesla's zero-alternatives approach.

---

## 3. New Card Layout

### 3.1 Collapsed State (Default)

```
+----------------------------------------------------------+
| [1]  Station Name                        [Best] 142 km   |
|      Nguyen Van Linh, District 7                          |
|                                                           |
|      [=====>        ]  18% --> 72%     ~22 min            |
|       arrival         departure        charge time        |
|                                                           |
|      150 kW  ·  CCS2  ·  Available           [Navigate]  |
+----------------------------------------------------------+
```

### 3.2 Expanded State (tap card body to expand)

```
+----------------------------------------------------------+
| [1]  Station Name                        [Best] 142 km   |
|      Nguyen Van Linh, District 7                          |
|                                                           |
|      [=====>        ]  18% --> 72%     ~22 min            |
|       arrival         departure        charge time        |
|                                                           |
|      150 kW  ·  CCS2  ·  Available           [Navigate]  |
|----------------------------------------------------------|
|  Detour +4 min  ·  Total stop 26 min                     |
|  8 ports  ·  24/7  ·  Free parking                       |
|  [View station details]                                   |
|----------------------------------------------------------|
|  ALTERNATIVES                                             |
|  +------------------------------------------------------+|
|  | Station B        [OK]   +8 min detour   120kW  30min ||
|  +------------------------------------------------------+|
|  | Station C        [Slow] +12 min detour   60kW  45min ||
|  +------------------------------------------------------+|
+----------------------------------------------------------+
```

### 3.3 Component Breakdown

```
ChargingStopCard
  +-- StopHeader          (number badge, name, rank pill, distance)
  +-- StopAddress         (single-line truncated address)
  +-- BatteryGauge        (mini progress bar + arrival% + departure% + charge time)
  +-- QuickStats          (power, connector, status -- max 3 items)
  +-- NavigateButton      (primary CTA, right-aligned)
  +-- ExpandedDetails     (collapsible)
  |     +-- DetailStats   (detour, total stop, ports, hours, parking)
  |     +-- StationDetailExpander (existing SSE detail fetcher)
  +-- AlternativesList    (collapsible, inside expanded)
        +-- AlternativeRow (compact single-line per alternative)
```

---

## 4. Information Hierarchy

### 4.1 Primary (Always Visible)

| Element | Rationale | Visual Treatment |
|---------|-----------|-----------------|
| Stop number | Sequence in trip | Accent-colored circle badge |
| Station name | Identity | Semibold, foreground color |
| Rank badge | Quick quality signal | Color-coded pill (safe/warn/danger) |
| Battery gauge | Core trip planning data | Mini progress bar with color gradient |
| Arrival % | Anxiety indicator | Mono font, danger-colored when low |
| Departure % | Confidence indicator | Mono font, safe-colored |
| Charge time | Time cost | Mono font, prominent size |
| Power (kW) | Speed signal | Accent-colored, with lightning icon |
| Connector type | Compatibility | Muted text, single label |
| Status | Availability | Dot indicator (green/yellow/red) |
| Navigate button | Primary action | Accent background pill |

### 4.2 Secondary (Visible on Expand)

| Element | Rationale |
|---------|-----------|
| Detour time | Route deviation cost |
| Total stop time | Full time commitment |
| Port count | Availability likelihood |
| Operating hours | Accessibility |
| Parking fee | Cost consideration |
| Station detail expander | Deep dive for power users |

### 4.3 Tertiary (Deep Detail via Expander)

| Element | Rationale |
|---------|-----------|
| Full station detail (SSE) | Comprehensive info for edge cases |
| User reviews / photos | Social proof (future feature) |
| Pricing details | Cost optimization (future feature) |

---

## 5. Visual Design Tokens

### 5.1 Colors

Using the existing design system from `globals.css`:

```
Card background:        var(--color-surface)        #1C1C1E
Card border:            var(--color-surface-hover)   #2C2C2E
Card border (hover):    var(--color-accent-dim)      #00A888  (subtle glow on hover)

Number badge bg:        var(--color-accent)          #00D4AA
Number badge text:      var(--color-background)      #0A0A0B

Rank "Best":            var(--color-safe)            #00D4AA  (bg at 10% opacity)
Rank "OK":              var(--color-warn)            #FF9500  (bg at 10% opacity)
Rank "Slow":            var(--color-danger)          #FF3B30  (bg at 10% opacity)

Battery arrival (low):  var(--color-danger)          #FF3B30  (< 20%)
Battery arrival (mid):  var(--color-warn)            #FF9500  (20-40%)
Battery arrival (ok):   var(--color-safe)            #00D4AA  (> 40%)
Battery departure:      var(--color-safe)            #00D4AA  (always safe after charging)

Status dot "Available": var(--color-safe)            #00D4AA
Status dot "Busy":      var(--color-warn)            #FF9500
Status dot "Offline":   var(--color-danger)          #FF3B30
Status dot "Unknown":   var(--color-muted)           #8E8E93

Power text:             var(--color-accent)          #00D4AA
Connector text:         var(--color-muted)           #8E8E93
Address text:           var(--color-muted)           #8E8E93
Distance text:          var(--color-muted)           #8E8E93

Navigate button bg:     var(--color-accent)          #00D4AA
Navigate button text:   var(--color-background)      #0A0A0B
```

### 5.2 Typography

```
Station name:           text-sm (14px), font-semibold, font-sans
Address:                text-xs (12px), font-normal, color-muted, truncate (single-line)
Battery percentages:    text-sm (14px), font-bold, font-mono
Charge time:            text-sm (14px), font-bold, font-mono
Power (kW):             text-xs (12px), font-semibold, font-mono
Connector type:         text-xs (12px), font-normal, color-muted
Rank badge:             text-[10px], font-semibold, uppercase
Distance:               text-xs (12px), font-normal, font-mono, color-muted
Navigate button:        text-xs (12px), font-semibold
Expanded detail labels: text-xs (12px), font-normal, color-muted
Alternative row name:   text-xs (12px), font-medium
```

### 5.3 Spacing

```
Card padding:           p-3 (12px)
Card gap (vertical):    space-y-2 (8px) between cards
Card border-radius:     rounded-xl (12px) -- softer than current rounded-lg
Card border:            border border-[var(--color-surface-hover)]

Header row gap:         gap-2 (8px)
Battery gauge margin:   mt-2 (8px top), mb-1 (4px bottom)
Quick stats margin:     mt-2 (8px)
Quick stats gap:        gap-1.5 (6px) between items, separated by " · "
Navigate button margin: ml-auto (right-aligned in quick stats row)

Number badge size:      w-6 h-6 (24x24)
Rank badge padding:     px-2 py-0.5
Status dot size:        w-2 h-2 (8x8) inline before status text

Expanded section:       border-t border-[var(--color-surface-hover)], p-3
Alternative row:        px-3 py-2.5
```

---

## 6. Component Specifications

### 6.1 BatteryGauge (New Component)

The battery gauge is the centerpiece of the redesign. It replaces the current inline `arrival% -> departure%` text with a visual progress bar.

```
ASCII:
[=====>           ]  18% --> 72%     ~22 min
 ^                    ^       ^         ^
 filled portion     arrival  depart   charge time
 (colored by        (red)    (green)
  arrival level)
```

**Implementation:**

```
Container:    flex items-center gap-3 mt-2
Bar wrapper:  flex-1 h-2 rounded-full bg-[var(--color-surface-hover)] overflow-hidden relative
Filled bar:   absolute left-0 top-0 h-full rounded-full
              width = (departureBattery / 100)%
              background: gradient from arrival-color to safe-color
Arrival mark: absolute top-0 h-full w-px bg-[var(--color-foreground)]/30
              left = (arrivalBattery / 100)%
```

**Tailwind classes:**

```tsx
// Bar container
<div className="flex items-center gap-3 mt-2">
  {/* Progress bar */}
  <div className="flex-1 h-2 rounded-full bg-[var(--color-surface-hover)] overflow-hidden relative">
    {/* Filled portion (departure level) */}
    <div
      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[var(--color-warn)] to-[var(--color-safe)]"
      style={{ width: `${departureBattery}%` }}
    />
    {/* Arrival marker line */}
    <div
      className="absolute inset-y-0 w-0.5 bg-[var(--color-foreground)]/40"
      style={{ left: `${arrivalBattery}%` }}
    />
  </div>
  {/* Text labels */}
  <div className="flex items-center gap-1.5 text-sm font-bold font-[family-name:var(--font-mono)] shrink-0">
    <span className="text-[var(--color-danger)]">{arrivalBattery}%</span>
    <span className="text-[var(--color-muted)] text-xs font-normal">&rarr;</span>
    <span className="text-[var(--color-safe)]">{departureBattery}%</span>
  </div>
  {/* Charge time */}
  <span className="text-sm font-bold font-[family-name:var(--font-mono)] text-[var(--color-foreground)] shrink-0">
    ~{chargeTime}m
  </span>
</div>
```

### 6.2 QuickStats Row (Replaces StationInfoChips)

Replaces the current 6-chip `StationInfoChips` with a compact single-line row showing max 3 data points.

```
ASCII:
  150 kW  ·  CCS2  ·  Available                [Navigate]
  ^           ^        ^                          ^
  power      connector  status dot+text           CTA button
```

**Tailwind classes:**

```tsx
<div className="flex items-center justify-between mt-2">
  <div className="flex items-center gap-1.5 text-xs">
    {/* Power */}
    <span className="font-semibold font-[family-name:var(--font-mono)] text-[var(--color-accent)]">
      {maxPowerKw} kW
    </span>
    <span className="text-[var(--color-muted)]">&middot;</span>
    {/* Connector */}
    <span className="text-[var(--color-muted)]">
      {connectorTypes[0]}
    </span>
    <span className="text-[var(--color-muted)]">&middot;</span>
    {/* Status with dot */}
    <span className="inline-flex items-center gap-1">
      <span className={`w-2 h-2 rounded-full ${statusDotColor}`} />
      <span className={statusTextColor}>{statusText}</span>
    </span>
  </div>
  {/* Navigate CTA */}
  <a
    href={navigationUrl}
    target="_blank"
    rel="noopener noreferrer"
    className="text-xs px-3 py-1 rounded-full bg-[var(--color-accent)] text-[var(--color-background)] font-semibold hover:opacity-90 transition-opacity"
  >
    {t('navigate')}
  </a>
</div>
```

### 6.3 StopHeader (Refined)

```tsx
<div className="flex items-center justify-between">
  <div className="flex items-center gap-2 min-w-0">
    {/* Number badge */}
    <span className="w-6 h-6 rounded-full bg-[var(--color-accent)] text-[var(--color-background)] text-xs font-bold flex items-center justify-center shrink-0">
      {index + 1}
    </span>
    {/* Station name - truncated */}
    <span className="text-sm font-semibold truncate">{station.name}</span>
  </div>
  <div className="flex items-center gap-2 shrink-0">
    {/* Rank badge */}
    {rankLabel && (
      <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${rankColor}`}>
        {rankLabel}
      </span>
    )}
    {/* Distance */}
    <span className="text-xs font-[family-name:var(--font-mono)] text-[var(--color-muted)]">
      {Math.round(distanceKm)} km
    </span>
  </div>
</div>
```

---

## 7. Alternative Stations Redesign

### 7.1 Current Problems

1. Alternatives are shown as full-width buttons with 4+ data points each -- visually noisy
2. Each alternative shows detour, connectors, power, and total time all in one line -- hard to scan
3. No visual comparison between selected and alternatives
4. The "View alternatives" toggle competes with other CTAs

### 7.2 New Design: Compact Comparison Rows

Alternatives appear inside the expanded card section as compact rows. Each row highlights only what differs from the selected station, making comparison easy.

```
ASCII:
|  ALTERNATIVES                                             |
|  +------------------------------------------------------+|
|  | Station B              [OK]     +8m    120kW   30min ||
|  +------------------------------------------------------+|
|  | Station C              [Slow]  +12m     60kW   45min ||
|  +------------------------------------------------------+|
```

### 7.3 Alternative Row Specification

```tsx
<button
  onClick={() => onSelectAlternative(stopIndex, alt)}
  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-[var(--color-surface-hover)] transition-colors group"
>
  {/* Left: name */}
  <span className="text-xs font-medium truncate min-w-0 flex-1">
    {alt.station.name}
  </span>
  {/* Right: key differentiators */}
  <div className="flex items-center gap-3 shrink-0 text-xs">
    {/* Rank badge */}
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${altRankColor}`}>
      {altRankLabel}
    </span>
    {/* Detour delta */}
    <span className="text-[var(--color-warn)] font-[family-name:var(--font-mono)] w-10 text-right">
      +{detourMin}m
    </span>
    {/* Power */}
    <span className="text-[var(--color-muted)] font-[family-name:var(--font-mono)] w-12 text-right">
      {alt.station.maxPowerKw}kW
    </span>
    {/* Charge time */}
    <span className="text-[var(--color-muted)] font-[family-name:var(--font-mono)] w-10 text-right">
      {Math.round(alt.estimatedChargeTimeMin)}m
    </span>
  </div>
</button>
```

### 7.4 Key Changes from Current Design

1. **Moved into expanded section:** Alternatives no longer have their own separate toggle. They appear as part of the card expansion, reducing UI controls from 3 to 1 (just tap the card).
2. **Fixed-width columns:** Detour, power, and charge time use fixed widths for tabular alignment across rows, making comparison effortless.
3. **Detour as delta:** Shows "+8m" instead of "Detour: 8 min" -- more scannable.
4. **No connector display:** Connector type is removed from alternatives (users have already filtered for compatible connectors at the trip level).
5. **Swap interaction:** Tapping an alternative row swaps it with the selected station. A subtle animation (slide up) confirms the swap. The previously selected station moves to the alternatives list.

---

## 8. Mobile-First Considerations

### 8.1 Touch Targets

| Element | Minimum Size | Implementation |
|---------|-------------|----------------|
| Card tap area (expand) | 48px height | `min-h-[48px]` on card body |
| Navigate button | 44x32px | `px-3 py-1` with text-xs yields ~44x28, add `min-h-[32px]` |
| Alternative row | 48px height | `py-2.5` on each row, full-width tap |
| Number badge | 24x24px | `w-6 h-6` (decorative, not interactive) |
| Expand/collapse area | Full card width | Entire card body is tappable, not just a small button |

### 8.2 Information Density

**Current card:** ~6 vertical "rows" of info visible at once (header, address, battery, detour, 6 chips, actions).

**Redesigned card:** ~4 vertical "rows" in collapsed state (header, address, battery gauge, quick stats + navigate). This is a 33% reduction in visual height, meaning more cards are visible without scrolling.

**Estimated card height:**
- Collapsed: ~96px (header 20 + address 16 + gauge 24 + stats 20 + padding 16)
- Expanded: ~200px (collapsed + detail stats 32 + detail link 24 + alternatives ~48 each)

### 8.3 Scrolling Behavior

- Cards live inside the bottom sheet's scrollable area (`overscroll-contain`)
- Expanded cards should not push other cards off-screen aggressively. Use `scroll-margin-top: 12px` on the expanded card so it stays visible
- Smooth expand/collapse animation: `transition-all duration-200 ease-out` on the expandable section
- Consider adding `max-h-0 overflow-hidden` -> `max-h-[500px]` transition for expand/collapse rather than conditional rendering, to enable animation

### 8.4 Landscape / Tablet Considerations

- Cards remain single-column up to `lg` breakpoint (1024px)
- On `lg+`, if a side panel layout is used, cards can be slightly wider but the layout does not change to multi-column -- trip stops are inherently sequential

### 8.5 Swipe Gestures (Future Enhancement)

- Swipe left on a card to reveal a "Skip this stop" action (if the trip can be recalculated without it)
- Swipe right to reveal "Add waypoint before this stop"
- Not in initial implementation -- flagged for v2

### 8.6 Accessibility

- Each card should be a `<article>` with `aria-label="Charging stop {n}: {station name}"`
- Battery gauge bar should have `role="meter"` with `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`, and `aria-label="Battery: {arrival}% to {departure}%"`
- Status dot should be paired with `aria-label` text (the dot alone is not accessible)
- Navigate link should include station name in `aria-label`: `"Navigate to {station name}"`
- Alternative rows should have `role="option"` within a `role="listbox"` container
- Focus ring: `focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]`

---

## 9. Transition Plan

### Phase 1: Restructure (Non-breaking)
1. Extract `ChargingStopCard` as a standalone component from `TripSummary.tsx`
2. Extract `BatteryGauge` component
3. Extract `QuickStats` component (replaces `StationInfoChips` in card context)
4. Keep `StationInfoChips` for non-trip contexts (station search results, map popups)

### Phase 2: Visual Redesign
1. Implement new card layout with collapsed/expanded states
2. Replace chip row with QuickStats
3. Add BatteryGauge visualization
4. Move alternatives into expanded section

### Phase 3: Polish
1. Add expand/collapse animation (`max-h` transition)
2. Add card hover/focus states
3. Test on mobile devices (iOS Safari, Android Chrome)
4. Verify accessibility with screen reader

---

## 10. Summary of Changes

| Aspect | Current | Redesigned |
|--------|---------|------------|
| Info chips | 6 chips (status, power, connectors, ports, hours, parking) | 3 inline stats (power, connector, status dot) |
| Battery display | Text only: "18% -> 72% ~22min" | Visual gauge bar + text |
| Card states | 1 state + separate alternatives toggle | Collapsed (default) + expanded (tap) |
| Alternatives trigger | Separate "View alternatives" button | Part of card expansion |
| Alternative rows | 4 data points in prose format | Tabular fixed-width columns |
| Navigate button | Inline with detail expander | Right-aligned in quick stats row |
| Detour/total time | Always visible | Visible only on expand |
| Card height (collapsed) | ~130px | ~96px |
| Touch target compliance | Partial (10px text buttons) | Full (48px minimum on interactive elements) |
| Accessibility | Minimal | ARIA roles, labels, meter, keyboard navigation |

---

## Appendix: Design System Reference

From `src/app/globals.css`:

```css
--color-background:    #0A0A0B
--color-foreground:    #F5F5F7
--color-surface:       #1C1C1E
--color-surface-hover: #2C2C2E
--color-accent:        #00D4AA
--color-accent-dim:    #00A888
--color-warn:          #FF9500
--color-danger:        #FF3B30
--color-safe:          #00D4AA
--color-muted:         #8E8E93
--font-sans:           system-ui, sans-serif
--font-mono:           (monospace)
--font-heading:        (heading font)
```

Existing animations: `fadeIn` (150ms ease-out), `shimmer` (for loading states).
