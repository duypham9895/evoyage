# eVoyage Landing Page Design Document

> **Status:** Design spec (no implementation)
> **Date:** 2026-03-19
> **Route:** `/` (current planner moves to `/plan`)

---

## Table of Contents

1. [Page Structure](#1-page-structure)
2. [Visual Design System](#2-visual-design-system)
3. [Logo & Branding](#3-logo--branding)
4. [Section-by-Section Design](#4-section-by-section-design)
5. [Content & Copy (VI/EN)](#5-content--copy-vien)
6. [Component Breakdown](#6-component-breakdown)
7. [Animation Specifications](#7-animation-specifications)
8. [Technical Notes](#8-technical-notes)

---

## 1. Page Structure

Sections in scroll order:

| # | Section | Height (est.) | Background |
|---|---------|---------------|------------|
| 1 | **Navbar** | 64px fixed | Transparent -> `#0A0A0B` on scroll |
| 2 | **Hero** | 100vh | `#0D1B3E` gradient to `#0A0A0B` |
| 3 | **How It Works** | ~600px | `#0A0A0B` |
| 4 | **Key Features** | ~800px | `#111114` (subtle lift) |
| 5 | **Supported Models** | ~700px | `#0A0A0B` |
| 6 | **Vietnam Coverage** | ~500px | `#0D1B3E` (dark navy repeat) |
| 7 | **FAQ** | ~600px | `#0A0A0B` |
| 8 | **Final CTA** | ~400px | Gradient `#0D1B3E` -> `#0A0A0B` |
| 9 | **Footer** | ~200px | `#08080A` |

---

## 2. Visual Design System

### Color Palette

```
Core (inherited from existing app):
  --color-background:    #0A0A0B    (page base)
  --color-foreground:    #F5F5F7    (primary text)
  --color-surface:       #1C1C1E    (cards, panels)
  --color-surface-hover: #2C2C2E    (interactive states)
  --color-muted:         #8E8E93    (secondary text)

Landing page additions:
  --color-hero-bg:       #0D1B3E    (dark navy for hero/CTA)
  --color-hero-bg-deep:  #081428    (deeper navy for gradient end)
  --color-primary:       #1464F4    (VinFast Blue - links, highlights)
  --color-primary-hover: #1B7AFF    (hover state)
  --color-accent-cta:    #00D26A    (Electric Green - CTA buttons)
  --color-accent-cta-hover: #00E87A (CTA hover)
  --color-accent-glow:   rgba(0, 210, 106, 0.3) (CTA glow effect)
  --color-route-line:    #00D4AA    (existing accent - route animation)
```

### Typography

| Element | Font | Weight | Size (mobile / desktop) | Color |
|---------|------|--------|-------------------------|-------|
| Nav logo | Space Grotesk | 700 | 20px / 24px | `#F5F5F7` |
| H1 (hero) | Space Grotesk | 700 | 32px / 56px | `#F5F5F7` |
| H2 (section) | Space Grotesk | 600 | 24px / 40px | `#F5F5F7` |
| H3 (card title) | Space Grotesk | 600 | 18px / 22px | `#F5F5F7` |
| Body | Be Vietnam Pro | 400 | 14px / 16px | `#F5F5F7` |
| Body muted | Be Vietnam Pro | 300 | 13px / 15px | `#8E8E93` |
| CTA button | Be Vietnam Pro | 600 | 16px / 18px | `#0A0A0B` |
| Badge/label | Be Vietnam Pro | 500 | 12px / 13px | varies |

Line heights: headings 1.2, body 1.6.

### Spacing Scale

Based on 4px grid: `4, 8, 12, 16, 24, 32, 48, 64, 80, 96, 128`.
Section vertical padding: `80px` mobile, `128px` desktop.
Max content width: `1200px`, centered with `auto` margins.

### Border Radius

- Cards: `16px`
- Buttons: `12px`
- Badges: `8px`
- Pill tags: `999px`

---

## 3. Logo & Branding

### Text Logo: "eVoyage"

```
Font:         Space Grotesk
Weight:       700 (Bold)
Tracking:     -0.02em (slight tightening)
Size:         24px (nav), 32px (footer)

Styling:
  "e"       → #00D26A (Electric Green), lowercase, italic
  "Voyage"  → #F5F5F7 (Foreground), normal style

Optional lightning bolt: append a subtle ⚡ icon after "e" using CSS ::after
  width: 14px, height: 14px, color: #00D26A, opacity: 0.8
```

### Tagline

- **Vietnamese:** "Di xa, di xanh -- khong lo het pin"
  - Translation: "Go far, go green -- no battery anxiety"
- **English:** "Go far, go green -- no range anxiety"

Tagline styling: Be Vietnam Pro, weight 300, 14px, color `#8E8E93`, displayed below logo in footer only.

---

## 4. Section-by-Section Design

### 4.1 Navbar (Fixed)

**Layout:** Horizontal bar, `64px` height, full width.

```
[ eVoyage logo ]                    [ VI/EN toggle ] [ Bat dau / Start -> ]
```

- Background: `transparent` initially, transitions to `#0A0A0B/90%` with `backdrop-filter: blur(12px)` after 100px scroll.
- Logo: left-aligned with `24px` padding.
- Right side: language toggle (ghost button), primary CTA (small, `#00D26A` bg with `#0A0A0B` text).
- Mobile: logo left, hamburger right (just CTA button, no menu needed for single-page).
- Z-index: 50.

### 4.2 Hero Section

**Layout:** Full viewport height. Two columns on desktop, stacked on mobile.

```
Desktop (60/40 split):
  LEFT (text):                         RIGHT (visual):
    Badge: "Mien phi - Free"            Animated route visualization
    H1: headline                         SVG map of Vietnam with
    Subtitle                             glowing route + charging dots
    [  Bat dau len ke hoach  ]
    Stats row: 150+ tram | 15 mau xe | 63 tinh
```

**Animated Route Visualization (right column):**
- Simplified SVG outline of Vietnam (approx 400x600px viewBox).
- A glowing route path (stroke: `#00D4AA`, stroke-width: 3) animates from Ho Chi Minh City northward to Ha Noi using `stroke-dashoffset` animation over 4 seconds, infinite loop with 2s pause.
- 5-6 charging station dots along the route pulse (`scale(1) -> scale(1.3) -> scale(1)`) sequentially as the route line passes them.
- Dot colors: `#00D26A` (active/reached), `#1464F4` (upcoming).
- Background glow: radial gradient from `#1464F4` at 10% opacity behind the map.

**Mobile adaptation:**
- Single column, text on top, visualization below (scaled to 60% height).
- H1 font: 32px.
- Stats row wraps to 2x2 grid.

### 4.3 How It Works

**Layout:** 3 cards in a horizontal row (desktop), vertical stack (mobile).

```
  [ 1 ]              [ 2 ]              [ 3 ]
  Chon xe            Nhap hanh trinh     Len duong
  Select vehicle     Enter route         Hit the road

  Icon: car          Icon: map-pin       Icon: zap
  Description        Description         Description
```

Each card:
- Width: 1/3 on desktop, full on mobile.
- Background: `#1C1C1E`.
- Border: `1px solid #2C2C2E`.
- Top accent line: `3px solid #1464F4` (card 1), `#00D4AA` (card 2), `#00D26A` (card 3).
- Step number: large `64px` number in `#1464F4` at 15% opacity, positioned top-right.
- Icon: 40x40px SVG, colored to match accent line.

Connecting line between cards (desktop only): dashed line with animated dots, `#2C2C2E`.

### 4.4 Key Features

**Layout:** 2x3 grid on desktop, 2x2 + 2x1 on tablet, single column on mobile.

6 feature cards:

| # | Icon | Title VI | Title EN | Description |
|---|------|----------|----------|-------------|
| 1 | Route | Tinh toan thong minh | Smart Range Calc | 80% real-world factor |
| 2 | Zap | Tram sac VinFast | VinFast Stations | Live station data |
| 3 | Mountain | Dia hinh & do cao | Terrain Aware | Elevation impact |
| 4 | Battery | Hanh trinh pin | Battery Journey | Visual battery timeline |
| 5 | Share | Chia se chuyen di | Share Trips | URL + image sharing |
| 6 | Globe | Da ngon ngu | Bilingual | VI/EN support |

Card design:
- Background: `#1C1C1E`.
- Border: `1px solid #2C2C2E`.
- Hover: border transitions to `#1464F4` at 40% opacity, subtle translate Y -4px.
- Icon area: 48x48px circle, `#1464F4` at 10% opacity background, icon in `#1464F4`.
- Title: H3 style, `#F5F5F7`.
- Description: body muted, `#8E8E93`, 2-3 lines max.

### 4.5 Supported VinFast Models

**Layout:** Horizontal scroll on mobile, 2-row grid on desktop.

Header: section title + "Va cac dong xe dien khac" / "And other EVs" subtitle.

Model cards (VinFast primary, BYD secondary row):

```
VinFast Row:
  [ VF 3 ] [ VF 5 ] [ VF 6 ] [ VF 7 ] [ VF 8 ] [ VF 9 ]

Other EVs Row:
  [ BYD Dolphin ] [ BYD Atto 3 ] [ BYD Seal ] [ + Them xe / Add yours ]
```

Each model card:
- Width: `180px` fixed.
- Background: `#1C1C1E`.
- Top: silhouette placeholder (CSS gradient shape suggesting SUV/sedan, no images).
- Model name: `Space Grotesk 600`, white.
- Stats grid (2x2):
  - Range: `XXX km`
  - Battery: `XX kWh`
  - DC charge: `XX min`
  - Price: from `XXX tr` (millions VND)
- VinFast badge: small green pill "VinFast" on VinFast cards.
- "+ Add yours" card: dashed border, `#2C2C2E`, plus icon centered, text muted.

### 4.6 Vietnam Coverage / Stats

**Layout:** Dark navy (`#0D1B3E`) background. Stats counters with supporting context.

```
Desktop: 4 large stat counters in a row
Mobile: 2x2 grid

  150+              63               15+              24/7
  Tram sac          Tinh/thanh       Mau xe           Ho tro
  Stations          Provinces        EV Models        Always free
```

Each stat:
- Number: Space Grotesk, 700, `56px` desktop / `40px` mobile, `#00D26A`.
- Label: Be Vietnam Pro, 400, `16px`, `#8E8E93`.
- Counter animation: numbers count up from 0 when section scrolls into view (Intersection Observer, CSS `@property` counter or JS).

Below stats: a single-line quote/testimonial placeholder.

### 4.7 FAQ

**Layout:** Single column, max-width `800px`, centered.

Accordion pattern: click question to expand answer. Only one open at a time.

```
  [ Q1 ]  ——————————————————————  [ + / - ]
  [ Q2 ]  ——————————————————————  [ + / - ]
  ...
```

Design:
- Question row: `padding 20px 0`, `border-bottom: 1px solid #2C2C2E`.
- Question text: Be Vietnam Pro, 500, 16px, `#F5F5F7`.
- Answer text: Be Vietnam Pro, 400, 15px, `#8E8E93`, appears with `max-height` transition.
- Toggle icon: `+` rotates to `x` on open (CSS transform rotate 45deg).

### 4.8 Final CTA

**Layout:** Centered text block with large CTA button.

```
  H2: "San sang len duong?"
  Subtitle: "Mien phi, khong can dang ky"
  [    Bat dau ngay    ]
```

- Background: gradient from `#0D1B3E` to `#0A0A0B`.
- CTA button: `#00D26A` background, `#0A0A0B` text, `padding 16px 48px`, `border-radius 12px`.
- Glow effect: `box-shadow: 0 0 40px rgba(0, 210, 106, 0.25)`.

### 4.9 Footer

**Layout:** 3-column on desktop, stacked on mobile.

```
  [ eVoyage logo + tagline ]    [ Links ]           [ Built with ]
                                 Bat dau              Next.js
                                 GitHub               Mapbox
                                                      VinFast API
```

- Background: `#08080A`.
- Separator: `1px solid #1C1C1E` at top.
- Bottom bar: copyright line, `#8E8E93`, 13px.

---

## 5. Content & Copy (VI/EN)

### 5.1 Hero

**Vietnamese:**
- Badge: `Mien phi & ma nguon mo`
- H1: `Len ke hoach chuyen di dien, khong lo het pin`
- Subtitle: `eVoyage tinh toan quang duong thuc te, tim tram sac VinFast doc duong, va giup ban tu tin di xa voi xe dien tai Viet Nam.`
- CTA: `Bat dau len ke hoach`

**English:**
- Badge: `Free & open source`
- H1: `Plan your EV road trip, no range anxiety`
- Subtitle: `eVoyage calculates real-world range, finds VinFast charging stations along your route, and helps you drive farther with confidence across Vietnam.`
- CTA: `Start planning`

### 5.2 How It Works

**Step 1:**
- VI: **Chon xe cua ban** -- "Chon tu 15+ dong xe dien co san tai Viet Nam, hoac tu nhap thong so xe cua ban."
- EN: **Pick your vehicle** -- "Choose from 15+ EVs available in Vietnam, or enter your own vehicle specs."

**Step 2:**
- VI: **Nhap hanh trinh** -- "Dat diem xuat phat, diem den, va cac diem dung giua duong. Ho tro den 5 diem dung."
- EN: **Enter your route** -- "Set origin, destination, and waypoints along the way. Supports up to 5 stops."

**Step 3:**
- VI: **Len duong tu tin** -- "eVoyage tinh toan pin, goi y tram sac tot nhat, va hien thi hanh trinh pin chi tiet."
- EN: **Drive with confidence** -- "eVoyage calculates battery usage, suggests optimal charging stops, and shows your detailed battery journey."

### 5.3 Key Features

| # | Title VI | Desc VI | Title EN | Desc EN |
|---|----------|---------|----------|---------|
| 1 | Tinh toan quang duong thuc te | Su dung he so an toan 80% -- phu hop thuc te lai xe tai Viet Nam voi dieu hoa, giao thong, va dia hinh. | Real-world range calculation | Uses an 80% safety factor -- realistic for Vietnam driving with AC, traffic, and terrain. |
| 2 | 150+ tram sac VinFast | Du lieu tram sac cap nhat lien tuc. Hien thi so cong, cong suat, va trang thai hoat dong. | 150+ VinFast stations | Continuously updated station data. Shows port count, power output, and live availability. |
| 3 | Phan tich dia hinh | Tu dong tinh toan do cao tuyen duong. Canh bao doan duong deo, doc anh huong den quang duong. | Terrain analysis | Auto-calculates route elevation. Warns about mountain passes and steep sections affecting range. |
| 4 | Hanh trinh pin truc quan | Bieu do pin tu luc xuat phat den khi ve. Biet chinh xac pin con bao nhieu tai moi diem dung. | Visual battery journey | Battery chart from departure to arrival. Know exactly how much charge you will have at every stop. |
| 5 | Chia se chuyen di | Tao link chia se hoac tai anh PNG hanh trinh. Gui cho ban be hoac luu lai de tham khao. | Share your trips | Generate a shareable link or download a trip PNG. Send to friends or save for reference. |
| 6 | Tieng Viet & English | Ho tro day du hai ngon ngu. Chuyen doi nhanh bang mot nut bam. | Vietnamese & English | Full bilingual support. Switch languages with a single tap. |

### 5.4 FAQ

**Q1:**
- VI: **eVoyage tinh quang duong nhu the nao?**
- VI Answer: eVoyage su dung 80% quang duong cong bo cua nha san xuat lam mac dinh. Day la he so an toan phu hop voi dieu kien thuc te tai Viet Nam -- nong, bat dieu hoa, giao thong dong duc, va dia hinh doi nui. Ban co the dieu chinh he so nay trong phan cai dat pin.
- EN: **How does eVoyage calculate range?**
- EN Answer: eVoyage uses 80% of the manufacturer's published range as the default. This safety factor accounts for real-world conditions in Vietnam -- heat, AC usage, heavy traffic, and hilly terrain. You can adjust this factor in battery settings.

**Q2:**
- VI: **Ung dung co mien phi khong?**
- VI Answer: Hoan toan mien phi, khong can dang ky tai khoan, khong co quang cao. eVoyage la du an ma nguon mo, bat ky ai cung co the dong gop.
- EN: **Is the app free?**
- EN Answer: Completely free, no account required, no ads. eVoyage is open source and anyone can contribute.

**Q3:**
- VI: **Toi co the su dung cho xe khong phai VinFast khong?**
- VI Answer: Co! eVoyage ho tro cac dong xe BYD (Dolphin, Atto 3, Seal) va bat ky xe dien nao khac. Ban chi can nhap dung luong pin va quang duong cong bo. Luu y: tram sac VinFast chi danh rieng cho xe VinFast.
- EN: **Can I use it for non-VinFast vehicles?**
- EN Answer: Yes! eVoyage supports BYD models (Dolphin, Atto 3, Seal) and any other EV. Just enter battery capacity and claimed range. Note: VinFast charging stations are exclusive to VinFast vehicles.

**Q4:**
- VI: **Du lieu tram sac co chinh xac khong?**
- VI Answer: Du lieu tram sac VinFast duoc cap nhat tu dong tu he thong VinFast. Thong tin bao gom so cong sac, cong suat (kW), trang thai hoat dong, va hinh anh tram. Tuy nhien, tinh trang thuc te co the thay doi trong ngay.
- EN: **Is the station data accurate?**
- EN Answer: VinFast station data is auto-refreshed from VinFast's system. Information includes port count, power output (kW), availability status, and station photos. However, real-time conditions may vary throughout the day.

**Q5:**
- VI: **Lam sao de biet co du pin cho chuyen di?**
- VI Answer: Sau khi len ke hoach, eVoyage hien thi bieu do hanh trinh pin chi tiet -- ban se thay muc pin tai moi diem dung va diem sac. Neu khong du pin, ung dung se tu dong goi y tram sac phu hop tren duong di.
- EN: **How do I know if I have enough charge for my trip?**
- EN Answer: After planning, eVoyage shows a detailed battery journey chart -- you will see charge levels at every stop and charging point. If your battery is insufficient, the app automatically suggests optimal charging stations along the route.

**Q6:**
- VI: **eVoyage co hoat dong offline khong?**
- VI Answer: Hien tai eVoyage can ket noi internet de tinh toan tuyen duong va truy van du lieu tram sac. Chung toi dang xem xet tinh nang offline cho cac ban cap nhat tuong lai.
- EN: **Does eVoyage work offline?**
- EN Answer: Currently eVoyage requires an internet connection for route calculation and station data queries. We are exploring offline capabilities for future updates.

### 5.5 Final CTA

- VI: H2: `San sang len duong?` / Subtitle: `Mien phi, khong can dang ky. Bat dau ngay.` / Button: `Len ke hoach ngay`
- EN: H2: `Ready to hit the road?` / Subtitle: `Free, no signup needed. Start now.` / Button: `Plan your trip`

---

## 6. Component Breakdown

### 6.1 Component Tree

```
LandingPage
  +-- LandingNavbar
  +-- HeroSection
  |     +-- HeroBadge
  |     +-- HeroStats
  |     +-- RouteVisualization (SVG)
  +-- HowItWorksSection
  |     +-- StepCard (x3)
  +-- FeaturesSection
  |     +-- FeatureCard (x6)
  +-- ModelsSection
  |     +-- ModelCard (xN)
  |     +-- AddVehicleCard
  +-- CoverageSection
  |     +-- StatCounter (x4)
  +-- FAQSection
  |     +-- FAQItem (xN)
  +-- CTASection
  +-- LandingFooter
```

### 6.2 Component Props

```typescript
// ── LandingNavbar ──
interface LandingNavbarProps {
  locale: 'vi' | 'en';
  onLocaleChange: (locale: 'vi' | 'en') => void;
}

// ── HeroBadge ──
interface HeroBadgeProps {
  text: string;       // e.g. "Free & open source"
}

// ── HeroStats ──
interface HeroStatsProps {
  stats: ReadonlyArray<{
    readonly value: string;   // "150+"
    readonly label: string;   // "Tram sac"
  }>;
}

// ── RouteVisualization ──
// No props -- self-contained SVG animation component.
// Uses CSS keyframe animations only, no JS animation libraries.

// ── StepCard ──
interface StepCardProps {
  readonly stepNumber: 1 | 2 | 3;
  readonly icon: 'car' | 'map-pin' | 'zap';
  readonly title: string;
  readonly description: string;
  readonly accentColor: string;   // tailwind class or hex
}

// ── FeatureCard ──
interface FeatureCardProps {
  readonly icon: 'route' | 'zap' | 'mountain' | 'battery' | 'share' | 'globe';
  readonly title: string;
  readonly description: string;
}

// ── ModelCard ──
interface ModelCardProps {
  readonly brand: string;
  readonly model: string;
  readonly variant: string | null;
  readonly rangeKm: number;
  readonly batteryKwh: number;
  readonly dcChargeMin: number;
  readonly priceMillions: number | null;    // null for non-VN models
  readonly isVinFast: boolean;
}

// ── AddVehicleCard ──
interface AddVehicleCardProps {
  readonly label: string;        // "Them xe cua ban" / "Add your vehicle"
  readonly href: string;         // link to /plan with add-vehicle param
}

// ── StatCounter ──
interface StatCounterProps {
  readonly value: number;
  readonly suffix?: string;      // e.g. "+"
  readonly label: string;
  readonly animateOnView?: boolean;   // default true
}

// ── FAQItem ──
interface FAQItemProps {
  readonly question: string;
  readonly answer: string;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}

// ── CTASection ──
interface CTASectionProps {
  readonly headline: string;
  readonly subtitle: string;
  readonly buttonText: string;
  readonly href: string;          // "/plan"
}

// ── LandingFooter ──
interface LandingFooterProps {
  readonly locale: 'vi' | 'en';
}
```

---

## 7. Animation Specifications

All animations use CSS only. No Framer Motion, GSAP, or other JS animation libraries.

### 7.1 Route Visualization (Hero)

```css
/* SVG route path draws from south to north */
@keyframes drawRoute {
  0%   { stroke-dashoffset: 1200; }
  70%  { stroke-dashoffset: 0; }
  100% { stroke-dashoffset: 0; }   /* pause at end */
}

.route-path {
  stroke-dasharray: 1200;
  animation: drawRoute 6s ease-in-out infinite;
}

/* Charging dots pulse sequentially */
@keyframes chargePulse {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50%      { transform: scale(1.4); opacity: 1; }
}

.charge-dot:nth-child(1) { animation: chargePulse 2s ease-in-out 0.8s infinite; }
.charge-dot:nth-child(2) { animation: chargePulse 2s ease-in-out 1.6s infinite; }
.charge-dot:nth-child(3) { animation: chargePulse 2s ease-in-out 2.4s infinite; }
.charge-dot:nth-child(4) { animation: chargePulse 2s ease-in-out 3.2s infinite; }
.charge-dot:nth-child(5) { animation: chargePulse 2s ease-in-out 4.0s infinite; }
```

### 7.2 Scroll-triggered Fade-in

```css
/* Applied to each section via Intersection Observer adding .is-visible class */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.section-animate {
  opacity: 0;
}

.section-animate.is-visible {
  animation: fadeInUp 0.6s ease-out forwards;
}
```

Intersection Observer config: `{ threshold: 0.15, rootMargin: '0px 0px -50px 0px' }`.

### 7.3 Stat Counter Animation

```css
/* Uses CSS @property for animatable counter (Chrome/Edge/Safari) */
@property --counter {
  syntax: '<integer>';
  initial-value: 0;
  inherits: false;
}

.stat-number {
  transition: --counter 2s ease-out;
  counter-reset: num var(--counter);
  content: counter(num);
}

.stat-number.is-visible {
  --counter: 150;   /* target value set via inline style */
}
```

Fallback for Firefox: use a small `useEffect` with `requestAnimationFrame` to increment displayed number.

### 7.4 Navbar Scroll Effect

```css
.navbar {
  background: transparent;
  backdrop-filter: blur(0px);
  transition: background 0.3s ease, backdrop-filter 0.3s ease;
}

.navbar.scrolled {
  background: rgba(10, 10, 11, 0.9);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid #1C1C1E;
}
```

Triggered by scroll listener: add `.scrolled` when `window.scrollY > 100`.

### 7.5 FAQ Accordion

```css
.faq-answer {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease-out, padding 0.3s ease-out;
  padding: 0 0;
}

.faq-answer.open {
  max-height: 300px;     /* generous max, actual content shorter */
  padding: 12px 0 20px;
}

.faq-toggle {
  transition: transform 0.2s ease;
}

.faq-toggle.open {
  transform: rotate(45deg);
}
```

### 7.6 CTA Button Glow

```css
@keyframes glowPulse {
  0%, 100% { box-shadow: 0 0 20px rgba(0, 210, 106, 0.2); }
  50%      { box-shadow: 0 0 40px rgba(0, 210, 106, 0.35); }
}

.cta-button {
  background: #00D26A;
  color: #0A0A0B;
  animation: glowPulse 3s ease-in-out infinite;
  transition: transform 0.15s ease, background 0.15s ease;
}

.cta-button:hover {
  background: #00E87A;
  transform: translateY(-2px);
}
```

---

## 8. Technical Notes

### 8.1 Routing Change

```
Current:  /        -> TripPlanner (main app)
Proposed: /        -> LandingPage (marketing)
          /plan    -> TripPlanner (main app, moved here)
```

The landing page CTA buttons link to `/plan`. The existing `page.tsx` at `src/app/page.tsx` becomes `src/app/plan/page.tsx`.

### 8.2 SSR & Performance

- The entire landing page is a React Server Component (no `'use client'` at page level).
- Only `FAQSection` and `LandingNavbar` need `'use client'` for interactivity (accordion state, scroll listener).
- `StatCounter` uses `'use client'` for Intersection Observer.
- No dynamic imports (`next/dynamic`) needed -- all components ship in initial bundle.
- SVG route visualization is inline JSX, not an external file.

### 8.3 SEO

```typescript
// src/app/page.tsx (new landing page)
export const metadata: Metadata = {
  title: 'eVoyage -- Len ke hoach chuyen di xe dien tai Viet Nam',
  description:
    'Tinh toan quang duong thuc te, tim tram sac VinFast, len ke hoach hanh trinh xe dien tu tin. Mien phi, khong can dang ky.',
  openGraph: {
    title: 'eVoyage -- EV Trip Planner for Vietnam',
    description:
      'Plan your electric vehicle road trip across Vietnam with real-world range calculations and VinFast charging station data.',
    type: 'website',
    locale: 'vi_VN',
    alternateLocale: 'en_US',
    url: 'https://evoyage.app',
    siteName: 'eVoyage',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'eVoyage -- EV Trip Planner for Vietnam',
    description: 'Plan your EV road trip with real-world range and charging station data.',
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://evoyage.app',
  },
};
```

Add JSON-LD structured data:

```typescript
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'eVoyage',
  description: 'EV trip planner for Vietnam with VinFast charging station data',
  applicationCategory: 'TravelApplication',
  operatingSystem: 'Web',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'VND',
  },
  availableLanguage: ['vi', 'en'],
};
```

### 8.4 Responsive Breakpoints

Follow Tailwind defaults, matching the existing app:

| Breakpoint | Width | Layout changes |
|------------|-------|----------------|
| Default | 0-639px | Single column, stacked sections |
| `sm` | 640px+ | 2-column grids start |
| `md` | 768px+ | Hero side-by-side begins |
| `lg` | 1024px+ | Full desktop layout |
| `xl` | 1280px+ | Max-width container, extra spacing |

### 8.5 File Structure

```
src/app/
  page.tsx                          (NEW: LandingPage server component)
  plan/
    page.tsx                        (MOVED from src/app/page.tsx)

src/components/landing/
  LandingNavbar.tsx                 ('use client')
  HeroSection.tsx                   (server component)
  HeroBadge.tsx                     (server component)
  HeroStats.tsx                     (server component)
  RouteVisualization.tsx            (server component, inline SVG + CSS)
  HowItWorksSection.tsx             (server component)
  StepCard.tsx                      (server component)
  FeaturesSection.tsx               (server component)
  FeatureCard.tsx                   (server component)
  ModelsSection.tsx                 (server component)
  ModelCard.tsx                     (server component)
  AddVehicleCard.tsx                (server component)
  CoverageSection.tsx               (server component)
  StatCounter.tsx                   ('use client' for IntersectionObserver)
  FAQSection.tsx                    ('use client' for accordion)
  FAQItem.tsx                       ('use client')
  CTASection.tsx                    (server component)
  LandingFooter.tsx                 (server component)

src/locales/
  vi.json                          (ADD landing.* keys)
  en.json                          (ADD landing.* keys)
```

### 8.6 Locale Key Structure

All new landing page strings should be nested under a `landing` key in the locale files to avoid conflicts with existing planner strings:

```json
{
  "landing": {
    "nav_cta": "Bat dau",
    "hero_badge": "Mien phi & ma nguon mo",
    "hero_h1": "Len ke hoach chuyen di dien, khong lo het pin",
    "hero_subtitle": "...",
    "hero_cta": "Bat dau len ke hoach",
    "step1_title": "Chon xe cua ban",
    "step1_desc": "...",
    "...": "..."
  }
}
```

### 8.7 Accessibility

- All sections use semantic HTML (`<nav>`, `<main>`, `<section>`, `<footer>`).
- FAQ uses `<details>`/`<summary>` as progressive enhancement base, styled with CSS.
- All interactive elements have `focus-visible` outlines (`outline: 2px solid #1464F4, offset 2px`).
- SVG route animation includes `aria-hidden="true"` and a descriptive `aria-label` on the container.
- Color contrast: all text/background combinations meet WCAG AA (4.5:1 for body, 3:1 for large text).
- CTA buttons have minimum `44x44px` touch target.
- `prefers-reduced-motion: reduce` -- disable all animations, show static states.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```
