# EVoyage — Project Blueprint

> Generated: 2026-03-17 | Status: Sprint-1 Ready
> Team Simulation: PM → Designer → Leadership Debate → Engineer + QA + DevOps + Security

---

# PHASE 1: REQUIREMENTS & DESIGN

---

## [1/2] PM — PRD v1

### Product Overview

**Product Name:** EVoyage
**Vision:** The go-to trip planning tool for EV drivers in Vietnam — brand-agnostic, safety-first, Vietnamese-native.
**One-liner:** Plan your EV road trip across Vietnam with accurate range calculations, brand-aware charging stops, and the 80% real-world range rule built in.

### User Personas

**Primary: Minh — VinFast VF 8 Owner (30, HCMC)**
- Bought his first EV 6 months ago. Range anxiety is real — he once nearly ran out on the way to Vung Tau because he trusted the dashboard range. He wants an app that tells him *honestly* where he'll run out and where to charge. He reads Vietnamese, uses English for tech terms. He's not a power user — he wants to type "HCM to Nha Trang" and get a plan.

**Secondary: Linh — BYD Seal Owner (38, Hanoi)**
- Early adopter, imported her BYD before official dealer launch. She's frustrated that every charging app shows VinFast stations she can't use. She needs the app to ONLY show compatible stations. She's tech-comfortable and would use advanced settings like Range Safety Factor.

**Tertiary: Traveler Tuan — Custom EV (45, Da Nang)**
- Drives an imported Tesla Model 3 (grey market). No app in Vietnam supports his car. He wants to manually enter his specs and plan trips. He'll tolerate a slightly rougher UX if the core calculation works.

### Problem Statement

Vietnam's EV infrastructure is growing fast (VinFast has 3,000+ chargers, BYD/universal stations emerging), but **no existing tool combines**:
1. Accurate real-world range calculation (not manufacturer fantasy numbers)
2. Brand-aware station filtering (VinFast-only vs. universal)
3. Route-integrated charging stop planning on Google Maps
4. Support for ANY EV brand (not just VinFast)

**Competitors:**
- **Tram EV app**: VinFast-only, no route planning, just station map
- **EVCS.VN**: Station directory, no trip planning, no range calculation
- **Google Maps EV**: No Vietnam charging data, no Vietnamese EV models
- **ABRP (A Better Route Planner)**: Excellent globally but poor Vietnam station data, no VinFast integration

**Our differentiator:** The 80% range safety factor as default + brand-aware filtering + Vietnam-focused station data.

### Success Metrics (KPIs)

| Metric | Target (3 months post-launch) | Measurement |
|---|---|---|
| Monthly Active Users | 500 | Vercel Analytics |
| Trip Plans Generated | 2,000/month | API endpoint counter |
| Avg. Trip Planning Time | < 60 seconds | Client-side timing |
| Range Calculation Accuracy | Within 15% of actual | User feedback form |
| Station Data Freshness | Updated weekly | Cron job monitoring |

### Feature Prioritization (MoSCoW)

#### Must Have (MVP v1)
- M1: Route visualization on Google Maps (start → end with polyline)
- M2: EV model selector with Vietnam models pre-loaded (~15 VinFast + BYD variants)
- M3: "Add custom car" manual entry for unlisted models
- M4: Battery input panel (current %, min arrival %, Range Safety Factor slider)
- M5: Range Safety Factor warning system (4 tiers with bilingual warnings)
- M6: Auto-calculate charging stops along route (km-by-km walk algorithm)
- M7: Brand-aware station filtering (VinFast-only vs. universal)
- M8: Charging station data from Open Charge Map API (universal) + seeded VinFast data
- M9: Trip summary with battery % at each stop
- M10: Bilingual UI (Vietnamese primary / English secondary)
- M11: Mobile-responsive layout (stacked) + desktop split-pane
- M12: Station detail info windows on map (name, address, charger types, navigate button)

#### Should Have (v1 stretch goals)
- S1: Battery Journey Graph (visual chart of battery level across trip)
- S2: Searchable/filterable vehicle database UI (search bar, filter chips)
- S3: Station color-coding on map by provider

#### Could Have (v2)
- C1: Global EV database (400+ models via API Ninjas + Hugging Face crawl)
- C2: VinFast station scraping via Playwright (live data instead of seeded)
- C3: Export trip plan as PDF
- C4: Export trip plan as spreadsheet (.xlsx)
- C5: Share trip plan via URL
- C6: Email trip plan via Gmail MCP connector
- C7: Calendar event creation for trip via Google Calendar MCP

#### Won't Have (v1)
- W1: User accounts / authentication
- W2: Real-time station availability (requires operator APIs)
- W3: Elevation-aware range calculation
- W4: Multi-stop trip planning (waypoints beyond start/end)
- W5: Native mobile app

### Acceptance Criteria (Key Features)

**M6 — Auto-Calculate Charging Stops:**
- GIVEN a VF 8 Eco at 80% battery with default 80% Range Safety Factor
- WHEN planning HCM → Phan Thiet (200km)
- THEN the app shows 0 charging stops needed (usable range = 245km > 200km)

- GIVEN a BYD Seal at 60% battery with default 80% Range Safety Factor
- WHEN planning HCM → Nha Trang (430km)
- THEN the app shows 2-3 charging stops, ALL using universal CCS2 stations, ZERO VinFast stations

**M5 — Range Safety Factor Warnings:**
- GIVEN user adjusts Range Safety Factor slider to 95%
- WHEN the slider crosses 90%
- THEN a red warning appears in Vietnamese + English: "Gần như không ai đạt được quãng đường nhà sản xuất công bố..."
- AND at 95%+ a confirmation dialog appears requiring explicit acknowledgment

**M7 — Brand-Aware Filtering:**
- GIVEN a BYD Atto 3 is selected
- WHEN displaying charging stations on the route
- THEN VinFast-exclusive stations are NEVER shown (filtered out where isVinFastOnly = true)
- AND only stations with compatible connector types (CCS2) are displayed

### Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Open Charge Map has sparse Vietnam data | Medium | High | Seed VinFast stations manually; add "Report missing station" feature in v2 |
| Google Maps API costs spike with users | Medium | Medium | Cache route results (same start/end = cached), set API budget alerts |
| Range calculation inaccuracy frustrates users | Low | High | Default to conservative 80% factor; clearly label as estimate |
| VinFast changes website structure (scraping breaks) | High | Low | Defer scraping to v2; use seeded data for v1 |
| Vietnamese diacritics break in search/display | Low | Medium | Use UTF-8 everywhere; test with Hồ Chí Minh, Đà Nẵng, Phú Quốc |

### Dependencies

- Google Maps Platform APIs (billing account required, ~$200 free credit/month)
- Open Charge Map API (free, rate-limited, API key required)
- Supabase free tier (500MB storage, 50K MAU)
- Vercel free tier (100GB bandwidth, serverless functions)

---

## [2/2] Writer & Designer — UX & Content Spec

### Design Philosophy

**"Automotive Instrument Cluster Meets Vietnamese Clarity"**

This is NOT a generic SaaS dashboard. This is a tool for drivers planning real journeys on real roads. The design should feel like a premium car's trip computer — dark, focused, with high-contrast data readouts that you could glance at like a speedometer.

**Typography Direction** (per `frontend-design` skill — NO Inter/Roboto/Arial):
- **Primary**: **JetBrains Mono** for all numerical readouts (battery %, km, charging times) — monospaced for alignment, techy feel
- **Secondary**: **Be Vietnam Pro** for body text and UI labels — designed specifically for Vietnamese diacritics, beautiful rendering of ắ, ồ, ữ, ạ
- **Accent**: **Space Grotesk** for headings — geometric, bold, automotive feel

**Color System:**
- Background: `#0A0A0B` (near-black, not pure black — easier on eyes)
- Surface: `#1C1C1E` (card backgrounds, sidebar)
- Primary accent: `#00D4AA` (electric teal — distinctive, not the tired blue)
- Warning orange: `#FF9500`
- Danger red: `#FF3B30`
- Safe green: `#34C759`
- Text primary: `#F5F5F7`
- Text secondary: `#8E8E93`

**Why NOT `#007AFF` (Apple blue)?** Every app uses it. EV Road Planner should feel like its own brand. Electric teal `#00D4AA` evokes EV charging indicators and is distinctive in the Vietnam app landscape.

### Information Architecture

```
Home (/)
├── [Left Sidebar / Top Panel on Mobile]
│   ├── Trip Input
│   │   ├── Start Location (autocomplete)
│   │   └── End Location (autocomplete)
│   ├── Vehicle Selector
│   │   ├── Tab: 🇻🇳 Vietnam (default)
│   │   ├── Tab: 🌍 All EVs (v2, greyed out)
│   │   └── "My car not listed" → Manual Entry
│   ├── Battery Status Panel
│   │   ├── Current Battery % (slider + input)
│   │   ├── Min Arrival % (slider)
│   │   ├── Live Range Readout
│   │   └── Advanced: Range Safety Factor
│   │       ├── Slider (50-100%)
│   │       └── Warning tier display
│   └── [PLAN MY TRIP] Button
│
├── [Right Pane / Main Area on Mobile]
│   ├── Google Map
│   │   ├── Route polyline
│   │   ├── Charging station markers (color-coded)
│   │   └── Station info windows (on click)
│   └── Trip Summary (bottom sheet on mobile)
│       ├── Total distance & time
│       ├── Number of charging stops
│       ├── Battery Journey: visual bar showing % at each point
│       └── Charging Stop List (expandable cards)
│           ├── Station name & address
│           ├── Arrive at X% → Charge to 80%
│           ├── Charger type & power
│           └── [Navigate] button
```

### Key User Flows

**Flow 1: Plan a Trip (Happy Path)**
1. User lands on page → sees empty map centered on Vietnam, sidebar with inputs
2. Types "Hồ Chí Minh" in Start → Google Places autocomplete suggests options → selects
3. Types "Nha Trang" in End → selects from autocomplete
4. Vehicle selector shows Vietnam tab by default → user sees VinFast/BYD cards → taps "VF 8 Eco"
5. Battery panel auto-populates: 80% current, 15% min arrival, 80% Range Safety Factor
6. Live readout updates: "Quãng đường khả dụng: 245 km" / "Usable range: 245 km"
7. User taps [LÊN KẾ HOẠCH / PLAN MY TRIP]
8. Map renders route polyline (1-2 seconds loading state)
9. Charging stop markers appear on route → Trip Summary slides up showing "2 stops needed"
10. User taps a charging stop card → map pans to station, info window opens
11. User taps [Chỉ đường / Navigate] → opens Google Maps app with directions to station

**Flow 2: Custom Car Entry**
1. User doesn't see their car → taps "Xe của tôi không có trong danh sách" / "My car not listed"
2. Modal opens with form: Brand (text), Model (text), Battery Capacity (kWh, number), Official Range (km, number)
3. User fills in Tesla Model 3: Brand="Tesla", Model="Model 3", Battery=60kWh, Range=491km
4. Taps [Lưu / Save] → car saved to localStorage, selected as active vehicle
5. Battery panel updates with Tesla Model 3 specs → user continues to plan trip

**Flow 3: Adjusting Range Safety Factor**
1. User expands "Cài đặt nâng cao / Advanced Settings" in Battery Panel
2. Sees Range Safety Factor slider at 80% with green "✅ Recommended" badge
3. Drags slider to 90% → badge changes to orange "⚠️ Optimistic" with animated warning text
4. Warning reads: "Chỉ an toàn khi lái nhẹ nhàng, đường bằng, tắt điều hòa. Bạn có thể không đến được trạm tiếp theo." / "Only safe with gentle driving, flat roads, AC off. You may not reach the next station."
5. If user drags to 95% → red "🚨 Very risky" + confirmation dialog appears
6. Dialog: "Gần như không ai đạt được quãng đường nhà sản xuất công bố. Bạn có nguy cơ hết pin giữa đường. Tiếp tục?" / "Almost nobody achieves manufacturer range. You risk running out mid-trip. Continue?"
7. [Tôi hiểu rủi ro / I understand the risk] or [Quay về 80% / Reset to 80%]

### Screen Layouts

#### Desktop Split-Pane (1440px reference)

```
┌─────────────────────────────────────────────────────────────┐
│ EVoyage                          [🇻🇳/🇬🇧]       │
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│  📍 Start    │                                              │
│  ┌────────┐  │                                              │
│  │HCM     │  │              GOOGLE MAP                      │
│  └────────┘  │                                              │
│  📍 End      │         ╭──── Route Polyline ────╮           │
│  ┌────────┐  │         │                        │           │
│  │Nha Trang│ │         ⚡ Station 1              │           │
│  └────────┘  │         │                        │           │
│              │         ⚡ Station 2              │           │
│  🚗 VF 8 Eco │         │                        │           │
│  ┌─────────┐ │         ╰────────────────────────╯           │
│  │ [img]   │ │                                              │
│  │ 471km   │ │                                              │
│  └─────────┘ │                                              │
│              │──────────────────────────────────────────────│
│  🔋 Battery  │  TRIP SUMMARY                                │
│  ████████░░  │  HCM → Nha Trang | 430km | 6h20m            │
│  80%    │    │  2 charging stops needed                     │
│  Range: 245km│  ┌─────────────────────────────────────────┐ │
│              │  │ 80% ──▶ 18% ──▶ 80% ──▶ 22% ──▶ 80%   │ │
│  ⚙️ Advanced │  │ Start   Stop1   Charge   Stop2   Arrive │ │
│  RSF: 80% ✅ │  └─────────────────────────────────────────┘ │
│              │                                              │
│ [LÊN KẾ HOẠCH]│  ┌ Stop 1: EverCharge Phan Rang ─────────┐│
│              │  │ Arrive: 18% → Charge to 80% (35min)     ││
│              │  │ DC 60kW | CCS2 | 24/7 | [Chỉ đường]    ││
│              │  └──────────────────────────────────────────┘│
└──────────────┴──────────────────────────────────────────────┘
```

#### Mobile Stacked (375px reference)

```
┌──────────────────────┐
│ EVoyage 🇻🇳│
├──────────────────────┤
│ 📍 HCM → Nha Trang  │
│ 🚗 VF 8 Eco | 🔋 80% │
│ [Thay đổi ▼]        │
├──────────────────────┤
│                      │
│    GOOGLE MAP        │
│    (full width)      │
│                      │
│    ⚡──⚡──🏁        │
│                      │
│                      │
├──────────────────────┤
│ ▲ Trip Summary       │ ← bottom sheet, draggable
│ 430km | 2 stops | 6h │
│ 80%→18%→80%→22%→80% │
│ ┌ Stop 1 ──────────┐ │
│ │ EverCharge 18%→80%│ │
│ │ [Chỉ đường]      │ │
│ └──────────────────┘ │
└──────────────────────┘
```

### Microcopy & Tone of Voice

**Tone:** Confident, reassuring, safety-conscious. Like a knowledgeable co-pilot, not a robotic GPS.

**Key UI Labels (Vietnamese / English):**

| Context | Vietnamese | English |
|---|---|---|
| Main CTA | LÊN KẾ HOẠCH | PLAN MY TRIP |
| Start input placeholder | Điểm xuất phát (VD: Hồ Chí Minh) | Starting point (e.g., Ho Chi Minh) |
| End input placeholder | Điểm đến (VD: Nha Trang) | Destination (e.g., Nha Trang) |
| Battery label | Pin hiện tại | Current battery |
| Usable range readout | Quãng đường khả dụng: {X} km | Usable range: {X} km |
| No stops needed | Không cần sạc! Bạn đủ pin cho chuyến đi. | No charging needed! You have enough range. |
| Stops needed | Cần {N} điểm sạc trên đường đi | {N} charging stops needed along the route |
| Navigate button | Chỉ đường | Navigate |
| Custom car button | Xe của tôi không có trong danh sách | My car is not listed |
| Range Safety Factor | Hệ số an toàn quãng đường | Range Safety Factor |
| Low battery warning | Pin thấp! Chỉ còn {X} km quãng đường sử dụng được. | Low battery! Only {X} km usable range remaining. |

### Range Safety Factor Warning Tiers — Full Copy

**Tier 1 (≤70%): 🛡️ Rất an toàn / Very Conservative**
- VI: "Phù hợp cho đường đèo, bật điều hòa tối đa, chở nặng"
- EN: "Good for mountain roads, full AC, heavy loads"
- Style: Green badge, no animation

**Tier 2 (71-80%): ✅ Khuyến nghị / Recommended**
- VI: "Phù hợp cho hầu hết chuyến đi đường dài tại Việt Nam"
- EN: "Suitable for most long-distance trips in Vietnam"
- Style: Green badge, default state

**Tier 3 (81-90%): ⚠️ Lạc quan / Optimistic**
- VI: "Chỉ an toàn khi lái nhẹ nhàng, đường bằng, tắt điều hòa. Bạn có thể không đến được trạm tiếp theo."
- EN: "Only safe with gentle driving, flat roads, AC off. You may not reach the next station."
- Style: Orange badge, text animates in with slide-up, subtle pulse on warning icon

**Tier 4 (91-100%): 🚨 Rất rủi ro / Very Risky**
- VI: "Gần như không ai đạt được quãng đường nhà sản xuất công bố. Bạn có nguy cơ hết pin giữa đường."
- EN: "Almost nobody achieves manufacturer range. You risk running out mid-trip."
- Style: Red badge, text always visible, at 95%+ triggers confirmation dialog

**Confirmation Dialog (95%+):**
- Title: "⚠️ Xác nhận mức rủi ro cao / Confirm high risk level"
- Body (VI): "Với hệ số {X}%, quãng đường tính toán gần bằng quãng đường nhà sản xuất. Điều này cực kỳ không thực tế trong điều kiện lái thực tế tại Việt Nam (nóng, bật A/C, giao thông đông)."
- Body (EN): "At {X}% factor, the calculated range nearly equals the manufacturer's figure. This is extremely unrealistic under real Vietnamese driving conditions (heat, AC usage, traffic)."
- Buttons: [Tôi hiểu rủi ro / I understand the risk] [Quay về 80% / Reset to 80%]

### Accessibility Requirements

- **WCAG 2.1 AA** compliance
- Color contrast ratio: minimum 4.5:1 for body text, 3:1 for large text
- All interactive elements keyboard-accessible
- Range Safety Factor warnings: NOT color-only (include text + icon)
- Vietnamese diacritics: test rendering with full Unicode coverage — Hồ Chí Minh, Đà Nẵng, Huế, Phú Quốc, Bà Rịa-Vũng Tàu
- Touch targets: minimum 44x44px on mobile
- Screen reader: meaningful alt text for map markers, ARIA labels for sliders

### Content & Design Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Battery slider precision on mobile (fat finger problem) | Medium | Add +/- buttons alongside slider; show numeric input |
| Information overload on Trip Summary (too many numbers) | Medium | Progressive disclosure — show headline stats, expand for details |
| Vietnamese diacritics in Google Places autocomplete | Low | Google handles this natively, but test edge cases |
| Range Safety Factor concept unfamiliar to non-technical users | High | Add "?" tooltip with simple explanation; default to 80% so most users never touch it |
| Brand-aware filtering invisible to user (they don't know WHY some stations are hidden) | Medium | Add subtle label on station list: "Hiển thị trạm tương thích với [car brand]" / "Showing stations compatible with [car brand]" |

---

# PHASE 2: LEADERSHIP DEBATE

---

## Round 1 — Initial Positions

### 👔 Head of Product (HoP)

I've reviewed the PRD and UX Spec. Strong foundation. Here's my product lens:

**What I like:**
- The 80% Range Safety Factor as a default differentiator — this IS the product's soul. Non-negotiable for v1.
- Brand-aware station filtering — real-world constraint that competitors ignore.
- The "My car not listed" escape hatch — prevents us from gatekeeping users.
- Be Vietnam Pro typography choice — finally someone who cares about Vietnamese rendering.

**My Top 3 Concerns:**

**Disagreement 1: The 400+ EV Global Database is scope creep for v1.**
The PRD lists it under Must-Have (M2 mentions "pre-loaded ~15 models" but the detailed spec talks about crawling 400+ models, API Ninjas, Hugging Face datasets, CLI crawl commands). We're building a Vietnam trip planner. 99% of Vietnam EV owners drive VinFast or BYD. Let's ship with 15 hardcoded Vietnam models + manual entry for everyone else. The global database crawler is a v2 feature. Adding it to v1 delays launch by 1-2 sprints for a feature that serves <1% of users.

**Disagreement 2: VinFast station scraping is risky and unnecessary for v1.**
The spec says scrape VinFast's website via Playwright. VinFast could change their DOM tomorrow. Their legal team could send a cease-and-desist. And Open Charge Map already has VinFast stations listed under the V-Green operator. Let's use Open Charge Map for ALL stations in v1 (marking V-Green/VinFast as VinFast-only), and explore scraping or an official VinFast API partnership in v2.

**Disagreement 3: The Battery Journey Graph (S1) should be a Must-Have, not a Should-Have.**
The graph that shows battery % declining along the route is THE key visualization that makes this tool trustworthy. Without it, users just see numbers. The graph makes the 80% rule *tangible*. I want this in v1.

### 🏗️ Head of Engineering (HoE)

PRD and UX Spec reviewed. My technical assessment:

**What's solid:**
- The core range formula is simple and correct — easy to unit test.
- Next.js + Supabase + Vercel is the right stack for a solo dev, good DX.
- The project structure is clean and well-organized.

**My Top 3 Concerns:**

**Disagreement 1: The route-walking algorithm ("walk km-by-km") is underspecified and could be expensive.**
Walking a polyline km-by-km means decoding the Google Directions API polyline into points, measuring cumulative distance, and checking station proximity at each kilometer. For a 780km Hanoi→Da Nang trip, that's 780 iterations with geospatial proximity queries. This needs proper algorithmic design — should we use the actual polyline points (which are already spaced at road geometry intervals), or should we interpolate at fixed km intervals? And "find nearest station within 5km corridor" means a geospatial query (PostGIS or Haversine) at each check point. This must be server-side, not client-side.

**Disagreement 2: The Vehicle Selector UI is over-designed for v1.**
The spec describes a searchable database with tabs (Vietnam / All EVs), filter chips (body type, seats, brand, min range), and result cards. For 15 vehicles? That's like building a search engine for a restaurant with 15 items on the menu. A simple grouped dropdown (VinFast section, BYD section, "Add custom" at bottom) is sufficient for v1. Save the fancy selector for when we have 400+ vehicles in v2.

**Disagreement 3: Supabase free tier limits concern me.**
500MB storage, 50K monthly active users, and connection pooling limits. If we're storing 15 vehicles + a few hundred stations, storage is fine. But Prisma + Supabase connection pooling is famously tricky — we need to use the `?pgbouncer=true&connection_limit=1` connection string in serverless environments. And if station data grows (historical data, user-added stations), we'll hit 500MB sooner than expected. We should design the schema to be storage-efficient from day 1 and plan for the $25/month Pro tier.

---

## Round 2 — Challenge & Counter

### 👔 HoP Responds to HoE

**On the route-walking algorithm (HoE Disagreement 1):** You're right that it's underspecified. I agree it must be server-side. But I don't think it's as expensive as you're implying — Google Directions API returns `overview_polyline` with maybe 100-300 points for a typical Vietnam route. We decode those, compute cumulative distances, and check for stations when remaining range drops below the buffer. We don't need true geospatial queries — a simple Haversine distance calculation against our station list (a few hundred stations) is fine for v1. No PostGIS needed. Optimize later if it's slow.

**On the Vehicle Selector (HoE Disagreement 2):** I agree with you. A grouped dropdown for 15 cars is the right call. My PRD already listed the fancy searchable database as a Should-Have (S2). Let's lock it: v1 = grouped dropdown. v2 = searchable database when we have 400+ models.

**On Supabase limits (HoE Disagreement 3):** Fair concern. But 15 vehicle records + 500 station records is maybe 1MB. We're nowhere near 500MB. Let's start free and upgrade when we need to. I don't want to pre-pay for infrastructure we might not need. However, I accept your point about Prisma + pgbouncer — that's a DX issue, not a cost issue. Let's document the connection string requirement.

**My compromise on Disagreement 3:** I'll accept planning for the Supabase Pro tier ($25/month) in the infrastructure budget, but we deploy on free tier first and upgrade based on actual metrics.

### 🏗️ HoE Responds to HoP

**On the Global EV Database (HoP Disagreement 1):** Completely agree. 400+ model crawling is a v2 feature. For v1, we hardcode 15 Vietnam models in a seed script (`npm run seed`) that writes to the Supabase `EVVehicle` table. The schema should be designed for the full database (all fields from the spec), but we only populate 15 rows. This way, the database is future-ready without any extra engineering effort now.

**On VinFast scraping (HoP Disagreement 2):** Agree — defer scraping to v2. But I want to push back slightly: Open Charge Map's Vietnam data might be incomplete for VinFast stations. We should do a one-time manual verification: query Open Charge Map for VinFast/V-Green stations in Vietnam and compare against VinFast's public station list. If coverage is >80%, we go with Open Charge Map only. If it's <80%, we manually seed the missing stations from VinFast's website (a one-time data entry task, NOT automated scraping). This is a 2-hour task, not a sprint.

**On Battery Journey Graph (HoP Disagreement 3):** This is where I push back. The Battery Journey Graph is a nice visualization but it's not *functionally* necessary for v1. The trip summary already shows battery % at each stop in text: "Depart 80% → Station 1 at 18% → charge to 80% → arrive at 42%." A proper chart component (Recharts or similar) adds a dependency, requires responsive design work, and needs careful UX for the mobile bottom sheet. I'd estimate it at 3-5 days of work. That time is better spent making the core route calculation bulletproof.

**My compromise on Battery Journey Graph:** Instead of a full Recharts graph, let's build a simple **battery progress bar** — a horizontal bar segmented by trip legs, colored by battery level (green/yellow/red). Same information, 1/3 the effort, works great on mobile. We can upgrade to a full interactive chart in v2.

---

## Round 3 — Convergence

### Unified Decision Log

| # | Decision | Rationale | Status |
|---|---|---|---|
| D1 | v1 ships with 15 hardcoded Vietnam EV models (10 VinFast + 5 BYD). No global crawling. | 99% of Vietnam EV owners covered. Crawling is a v2 feature. | **LOCKED** |
| D2 | Vehicle selector = grouped dropdown, not searchable database. | 15 items don't need search. Fancy selector ships with global database in v2. | **LOCKED** |
| D3 | "Add custom car" saves to localStorage (not Supabase). | No user accounts in v1. Server storage of user data adds complexity. | **LOCKED** |
| D4 | No VinFast scraping in v1. Use Open Charge Map API for all stations. Manually seed any missing VinFast stations if OCM coverage < 80%. | Scraping is fragile and legally risky. One-time manual seed is safer. | **LOCKED** |
| D5 | Range Safety Factor 4-tier warning system IS in v1. | Safety-critical feature. The whole product premise is honest range calculation. | **LOCKED** |
| D6 | Battery Journey = simple segmented progress bar, not full chart. | 1/3 the effort, same information, mobile-friendly. Full chart in v2. | **LOCKED** |
| D7 | Route calculation algorithm uses decoded polyline points with Haversine distance. Server-side API route. No PostGIS for v1. | Polyline gives 100-300 points per route. Haversine against ~500 stations is fast enough. | **LOCKED** |
| D8 | Supabase free tier for launch. Plan for Pro ($25/mo) upgrade. Prisma connection string must use pgbouncer mode. | Don't pre-pay. But document the pgbouncer requirement in .env.example. | **LOCKED** |
| D9 | Station data refresh = weekly via Vercel Cron calling Open Charge Map API. | Stations don't move. Weekly is sufficient. Daily would waste API quota. | **LOCKED** |
| D10 | Export features (PDF, XLSX, email, calendar) are ALL v2. | Nice-to-have. Core trip planning must work perfectly first. | **LOCKED** |
| D11 | Station color-coding on map (S3) is IN for v1. | Low effort (3 marker colors), high visual value. VinFast=green, EverCharge=blue, Other=gray. | **LOCKED** |
| D12 | Typography: JetBrains Mono (numbers), Be Vietnam Pro (body), Space Grotesk (headings). | Distinctive, readable, Vietnamese-optimized. Follows frontend-design skill guidelines. | **LOCKED** |
| D13 | Color palette uses electric teal #00D4AA as primary accent, NOT generic blue. | Brand differentiation. | **LOCKED** |

### Unresolved Tensions

| Tension | HoP Position | HoE Position | Recommendation |
|---|---|---|---|
| Open Charge Map Vietnam data quality | "It's probably fine" | "We should verify before committing" | **Action: Engineer spends 2 hours in Sprint 0 querying OCM API for Vietnam EV stations. If <200 stations with geolocation, supplement with manual VinFast data from public sources.** |
| Google Maps API budget | "Use free $200 credit, worry later" | "Set hard budget alerts at $50, $100, $150" | **Action: Set billing alerts. Also cache route results by (start, end) pair in Supabase to reduce repeat API calls.** |

### Locked Scope for v1

**IN (Must Ship):**
- Route visualization on Google Maps (start → end)
- Grouped dropdown vehicle selector (15 Vietnam models)
- "Add custom car" with localStorage storage
- Battery input panel (current %, min arrival %, Range Safety Factor)
- Range Safety Factor 4-tier warning system with bilingual copy
- Auto-calculate charging stops (server-side polyline walking algorithm)
- Brand-aware station filtering (VinFast-only vs. universal)
- Open Charge Map API integration for all stations
- Manual VinFast station seed data (if OCM coverage insufficient)
- Trip summary with battery % at each stop
- Segmented battery progress bar (simple visualization)
- Station color-coding on map (green/blue/gray by provider)
- Station info windows (name, address, charger type, navigate button)
- Bilingual UI (Vietnamese / English toggle)
- Mobile-responsive stacked layout + desktop split-pane
- Weekly station data refresh via Vercel Cron

**DEFERRED to v2:**
- Global EV database (400+ models via API crawling)
- Searchable/filterable vehicle selector with tabs and filter chips
- VinFast station scraping via Playwright
- Full Battery Journey Graph (interactive chart)
- Export as PDF / XLSX
- Share trip via URL
- Email trip plan (Gmail MCP)
- Calendar event creation (Google Calendar MCP)
- "Report missing station" feature
- User accounts / authentication
- Elevation-aware range calculation
- Multi-stop trip planning

---

# PHASE 3: IMPLEMENTATION PLANS

---

## [1/4] Full-Stack Engineer — Technical Architecture & Implementation Plan

### Architecture Overview

Per **D7** and **D8**, this is a Next.js 14 App Router application with:

```
┌─────────────────────────────────────────────────┐
│                    VERCEL                         │
│  ┌──────────────────────────────────────────┐    │
│  │            Next.js 14 App Router          │    │
│  │  ┌─────────┐  ┌──────────┐  ┌─────────┐ │    │
│  │  │ Page.tsx │  │ API Routes│  │  Cron   │ │    │
│  │  │ (SSR)   │  │/api/route │  │ /api/   │ │    │
│  │  │         │  │/api/stations│ │refresh  │ │    │
│  │  └─────────┘  └──────────┘  └─────────┘ │    │
│  └──────────────────────────────────────────┘    │
│                      │                            │
│         ┌────────────┼───────────┐                │
│         ▼            ▼           ▼                │
│  ┌───────────┐ ┌──────────┐ ┌─────────────┐     │
│  │ Google    │ │ Supabase │ │ Open Charge │     │
│  │ Maps APIs │ │ Postgres │ │ Map API     │     │
│  │ (client)  │ │ (Prisma) │ │ (server)    │     │
│  └───────────┘ └──────────┘ └─────────────┘     │
└─────────────────────────────────────────────────┘
```

### Tech Stack (Validated Against Debate Decisions)

| Layer | Technology | Justification |
|---|---|---|
| Framework | Next.js 14 App Router, TypeScript | Best DX for solo dev, Vercel-optimized, SSR for SEO |
| Styling | Tailwind CSS 3.4 | Utility-first, fast iteration, good dark mode support |
| Maps | Google Maps JavaScript API v3 | Best Vietnam coverage, Places autocomplete, Directions polyline |
| Database | Supabase Postgres (free tier, per D8) | Managed Postgres, good free tier, Prisma-compatible |
| ORM | Prisma 5.x | Type-safe queries, migration management, schema-first |
| State | React hooks + URL search params | Per spec: keep it simple, no Redux/Zustand needed |
| Deployment | Vercel (free tier) | Native Next.js support, preview branches, edge functions |
| Cron | Vercel Cron | Per D9: weekly station refresh |
| Fonts | Google Fonts: JetBrains Mono, Be Vietnam Pro, Space Grotesk | Per D12 |

### Database Schema (Prisma)

Per **D1** (15 hardcoded models) and **D3** (custom cars in localStorage):

```prisma
model EVVehicle {
  id                    String   @id @default(cuid())
  brand                 String
  model                 String
  variant               String?
  modelYear             Int?
  bodyType              String?  // SUV, Sedan, Hatchback
  batteryCapacityKwh    Float
  usableBatteryKwh      Float?
  officialRangeKm       Float
  rangeStandard         String?  // WLTP, NEDC, EPA
  chargingPortType      String?  // CCS2, CHAdeMO, GBT
  availableInVietnam    Boolean  @default(false)
  priceVndMillions      Float?
  source                String   @default("seed")
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@unique([brand, model, variant])
  @@index([availableInVietnam])
}

model ChargingStation {
  id                String   @id @default(cuid())
  ocmId             String?  @unique  // Open Charge Map ID
  name              String
  address           String
  latitude          Float
  longitude         Float
  operatorName      String?  // VinFast, EverCharge, EVONE, etc.
  isVinFastOnly     Boolean  @default(false)
  connectorTypes    String[] // CCS2, CHAdeMO, Type2, etc.
  maxPowerKw        Float?
  numberOfPoints    Int?
  isOperational     Boolean  @default(true)
  operatingHours    String?
  source            String   @default("ocm") // ocm, manual_seed
  lastVerified      DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([latitude, longitude])
  @@index([isVinFastOnly])
  @@index([operatorName])
}
```

### API Routes

**POST `/api/route`** — Core route planning endpoint
- Input: `{ start: string, end: string, vehicleId: string | CustomVehicle, currentBattery: number, minArrival: number, rangeSafetyFactor: number }`
- Process:
  1. Call Google Directions API (server-side) → get polyline + distance + duration
  2. Decode polyline into lat/lng points
  3. Load vehicle specs from DB (or accept custom vehicle from request)
  4. Calculate usable range using core formula
  5. Walk polyline points, accumulate distance, detect when charging needed
  6. Query ChargingStation table for compatible stations near needed point (Haversine, per D7)
  7. Build charging stop plan with battery % at each segment
- Output: `{ route: PolylinePath, totalDistanceKm: number, totalDurationMin: number, chargingStops: ChargingStop[], batterySegments: BatterySegment[] }`
- Caching: Cache by `(start_place_id, end_place_id)` pair in a `RouteCache` table (per unresolved tension decision)

**GET `/api/stations`** — Get all charging stations
- Optional filters: `?vinfast_only=bool&connector_type=CCS2&bounds=lat1,lng1,lat2,lng2`
- Returns station list for map markers

**GET `/api/vehicles`** — Get vehicle list
- Returns all EVVehicle records where `availableInVietnam = true`
- Per D1: returns 15 records

**POST `/api/cron/refresh-stations`** — Vercel Cron endpoint (per D9)
- Runs weekly
- Calls Open Charge Map API for Vietnam stations
- Upserts into ChargingStation table
- Configured in `vercel.json`: `{ "crons": [{ "path": "/api/cron/refresh-stations", "schedule": "0 3 * * 1" }] }`

### Route Calculation Algorithm (Per D7)

```typescript
// Simplified pseudocode — actual implementation in lib/route-planner.ts

function planChargingStops(
  polylinePoints: LatLng[],
  totalDistanceKm: number,
  vehicle: EVVehicle,
  currentBattery: number,
  minArrival: number,
  rangeSafetyFactor: number,
  stations: ChargingStation[],
  isVinFast: boolean
): ChargingPlan {
  const effectiveRange = vehicle.officialRangeKm * rangeSafetyFactor;
  let remainingRange = effectiveRange * (currentBattery / 100);
  const minRange = effectiveRange * (minArrival / 100);
  const safetyBuffer = 30; // km

  // Filter stations by brand compatibility (per D5/M7)
  const compatibleStations = isVinFast
    ? stations // VinFast can use all stations
    : stations.filter(s => !s.isVinFastOnly);

  const chargingStops: ChargingStop[] = [];
  let cumulativeDistance = 0;

  for (let i = 1; i < polylinePoints.length; i++) {
    const segmentDistance = haversine(polylinePoints[i-1], polylinePoints[i]);
    cumulativeDistance += segmentDistance;
    remainingRange -= segmentDistance;

    if (remainingRange < safetyBuffer + minRange) {
      // Need to charge — find nearest compatible station
      const nearest = findNearestStation(
        polylinePoints[i],
        compatibleStations,
        [5, 10, 15] // expanding search radii in km
      );

      if (nearest) {
        chargingStops.push({
          station: nearest,
          arrivalBattery: /* calculate */,
          departureBattery: 80, // per spec: charge to 80%
          distanceFromStart: cumulativeDistance
        });
        remainingRange = effectiveRange * 0.80; // Reset to 80% charge
      } else {
        // No station found — add warning
        chargingStops.push({ warning: 'NO_COMPATIBLE_STATION', ... });
      }
    }
  }

  return { chargingStops, arrivalBattery: /* final % */ };
}
```

### Implementation Plan — Sprint Breakdown

#### Sprint 0: Foundation (3 days)

| # | Task | Size | Skill(s) | Details |
|---|---|---|---|---|
| 0.1 | Project setup | S | — | `npx create-next-app@latest evoyage --typescript --tailwind --app` |
| 0.2 | Supabase project + Prisma setup | S | — | Create project, configure connection string with pgbouncer (per D8), init Prisma |
| 0.3 | Database schema + migration | S | — | Create EVVehicle + ChargingStation models, run `prisma migrate dev` |
| 0.4 | Seed Vietnam EV models | S | — | `npm run seed` script with 15 hardcoded models (per D1) |
| 0.5 | Open Charge Map API evaluation | S | — | Query OCM for Vietnam stations, evaluate coverage (per unresolved tension) |
| 0.6 | Seed station data | S | — | Fetch OCM Vietnam data + manually seed missing VinFast stations if needed (per D4) |
| 0.7 | Google Maps API setup | S | — | Enable 4 APIs, get API key, set referrer restrictions |
| 0.8 | Font + Tailwind theme setup | S | `frontend-design` | Configure JetBrains Mono, Be Vietnam Pro, Space Grotesk. Set dark theme colors per D12/D13 |
| 0.9 | Environment variables + `.env.example` | S | — | Document all required keys |

#### Sprint 1: Core Engine (5 days)

| # | Task | Size | Skill(s) | Details |
|---|---|---|---|---|
| 1.1 | Range calculator (`lib/range-calculator.ts`) | S | — | Implement `calculateUsableRange()` with unit tests. Core formula per spec. TDD. |
| 1.2 | Route planner (`lib/route-planner.ts`) | L | — | Polyline decoder, distance accumulator, charging stop algorithm per D7. TDD. |
| 1.3 | Station finder (`lib/station-finder.ts`) | M | — | Haversine distance function, nearest station search with expanding radius. Brand-aware filtering per M7. TDD. |
| 1.4 | API route: POST `/api/route` | M | — | Wire up route planner + Google Directions API. Cache results. |
| 1.5 | API route: GET `/api/stations` | S | — | Query ChargingStation table with filters |
| 1.6 | API route: GET `/api/vehicles` | S | — | Return Vietnam EV models |
| 1.7 | Vercel Cron: station refresh | M | — | Per D9: weekly OCM API sync |

#### Sprint 2: UI — Input Panel (5 days)

| # | Task | Size | Skill(s) | Details |
|---|---|---|---|---|
| 2.1 | App layout (split-pane desktop, stacked mobile) | M | `frontend-design` | Per UX spec. CSS Grid layout, responsive breakpoints. |
| 2.2 | TripInput component | M | `frontend-design` | Start/end location inputs with Google Places Autocomplete |
| 2.3 | BrandModelSelector component | S | `frontend-design` | Grouped dropdown per D2. VinFast section, BYD section, "Add custom" link. |
| 2.4 | Custom car modal | S | `frontend-design` | Manual entry form (brand, model, battery kWh, range km). Saves to localStorage per D3. |
| 2.5 | BatteryStatusPanel component | L | `frontend-design` | Current battery slider + input, min arrival slider, live range readout, Range Safety Factor in collapsible advanced section. |
| 2.6 | Range Safety Factor warnings | M | `frontend-design` | 4-tier system per D5. Bilingual copy. Animated orange/red warnings. 95%+ confirmation dialog. |
| 2.7 | Language toggle (🇻🇳/🇬🇧) | S | — | React context for locale, toggle in header |

#### Sprint 3: UI — Map & Results (5 days)

| # | Task | Size | Skill(s) | Details |
|---|---|---|---|---|
| 3.1 | Google Map component | L | `frontend-design` | Embed Maps JavaScript API. Dark map style. Vietnam center. Route polyline rendering. |
| 3.2 | Station markers on map | M | `frontend-design` | Color-coded per D11: green=VinFast, blue=EverCharge, gray=other. Custom marker icons. |
| 3.3 | StationInfoWindow component | S | `frontend-design` | Pop-up on marker click: name, address, charger types, power, [Navigate] button. |
| 3.4 | TripSummary component | M | `frontend-design` | Total distance, time, stops needed. Battery progress bar per D6. |
| 3.5 | Battery progress bar | M | `frontend-design` | Segmented horizontal bar showing battery % at each leg. Color-coded green/yellow/red per D6. |
| 3.6 | ChargingStopList component | M | `frontend-design` | Expandable cards: station name, arrive %, depart 80%, charger type, [Navigate]. |
| 3.7 | Mobile bottom sheet | M | `frontend-design` | Draggable bottom sheet for trip summary on mobile. |
| 3.8 | Integration: wire Plan button to API | M | — | Connect UI → POST /api/route → render results on map + summary. Loading states, error handling. |

#### Sprint 4: Polish & Deploy (3 days)

| # | Task | Size | Skill(s) | Details |
|---|---|---|---|---|
| 4.1 | Error handling & edge cases | M | — | No route found, no compatible stations, API failures, network errors |
| 4.2 | Loading states & skeleton UI | S | `frontend-design` | Skeleton loaders for map, trip summary. Button loading state. |
| 4.3 | Vietnamese diacritics testing | S | — | Test all flows with Hồ Chí Minh, Đà Nẵng, Huế, Bà Rịa-Vũng Tàu |
| 4.4 | SEO & meta tags | S | — | Page title, description, OG tags |
| 4.5 | Vercel deployment | S | — | Configure env vars, domain, preview branches |
| 4.6 | Google Maps API budget alerts | S | — | Set alerts at $50, $100, $150 per unresolved tension decision |
| 4.7 | Manual QA walkthrough | M | — | Test all flows from QA test plan |

**Total estimated: ~21 working days (4 sprints)**

### Technical Debt Register

| Debt | Severity | When to Address |
|---|---|---|
| Route cache has no TTL/invalidation | Low | v2 — add cache expiry or invalidate on station data refresh |
| No rate limiting on API routes | Medium | v2 — add API middleware rate limiter |
| Haversine distance is not road distance | Low | Acceptable for station proximity search. Could use Google Distance Matrix in v2. |
| No monitoring/alerting | Medium | v2 — add Vercel Analytics + error tracking (Sentry) |
| Custom cars in localStorage not backed up | Low | v2 — optional user accounts with synced data |

---

## [2/4] QA — QA Strategy & Test Plan

### Test Strategy

Testing scope is defined by the **Locked Scope for v1**. No tests for deferred features (global DB crawl, scraping, export, etc.).

| Test Type | Coverage Target | Tool | Focus Areas |
|---|---|---|---|
| Unit Tests | 90%+ | Vitest | Range calculator, station finder, polyline decoder, Haversine |
| Integration Tests | 80%+ | Vitest + MSW | API routes (/api/route, /api/stations), DB queries |
| E2E Tests | Critical paths | Playwright | Full trip planning flow, brand filtering, RSF warnings |
| Accessibility | WCAG 2.1 AA | axe-playwright | Color contrast, keyboard nav, screen reader |
| Performance | Baseline | Lighthouse CI | FCP < 2s, LCP < 3s, route calc < 5s |

### High-Risk Areas (Priority Testing)

1. **Range calculation math** — Wrong math = stranded driver. Must be bulletproof.
2. **Brand-aware station filtering** — BYD driver seeing VinFast-only stations = useless app.
3. **Route-walking algorithm** — Edge cases: very short trips (no stops), very long trips (5+ stops), routes with no stations nearby.
4. **Range Safety Factor warnings** — Exact threshold behavior at boundaries (70%, 80%, 90%, 95%).
5. **Vietnamese diacritics** — In Places autocomplete, station names, UI labels.

### Unit Test Scenarios — Range Calculator

```
Scenario 1: Standard VF 8 Eco calculation
GIVEN VF 8 Eco (officialRange: 471km), currentBattery: 80%, minArrival: 15%, RSF: 0.80
WHEN calculateUsableRange is called
THEN maxRangeKm = 376.8 (471 × 0.80)
AND usableRangeKm = 245.0 (376.8 × 65/100)

Scenario 2: Low battery edge case
GIVEN VF 8 Eco, currentBattery: 20%, minArrival: 15%, RSF: 0.80
WHEN calculateUsableRange is called
THEN usableRangeKm = 18.84 (376.8 × 5/100)
// This is dangerously low — UI should show low battery warning

Scenario 3: Current battery equals min arrival
GIVEN any vehicle, currentBattery: 15%, minArrival: 15%, RSF: 0.80
WHEN calculateUsableRange is called
THEN usableRangeKm = 0
// User cannot go anywhere without charging first

Scenario 4: Range Safety Factor at extremes
GIVEN VF 8 Eco, currentBattery: 100%, minArrival: 15%, RSF: 1.00
WHEN calculateUsableRange is called
THEN maxRangeKm = 471.0 (full manufacturer range — risky!)
AND usableRangeKm = 400.4 (471 × 85/100)

Scenario 5: RSF at 50% (very conservative)
GIVEN VF 8 Eco, currentBattery: 100%, minArrival: 15%, RSF: 0.50
WHEN calculateUsableRange is called
THEN maxRangeKm = 235.5 (471 × 0.50)
AND usableRangeKm = 200.2 (235.5 × 85/100)

Scenario 6: Custom car with zero range (invalid input)
GIVEN custom car with officialRangeKm: 0
WHEN calculateUsableRange is called
THEN return usableRangeKm = 0 and show validation error

Scenario 7: BYD Seal standard trip
GIVEN BYD Seal (officialRange: 570km), currentBattery: 80%, minArrival: 15%, RSF: 0.80
WHEN calculateUsableRange is called
THEN maxRangeKm = 456.0
AND usableRangeKm = 296.4
```

### Integration Test Scenarios — Route Planning

```
Scenario 8: VF 8 Eco, HCM → Phan Thiet, 80% battery
GIVEN POST /api/route with { start: "Ho Chi Minh", end: "Phan Thiet", vehicleId: "vf8-eco", currentBattery: 80, minArrival: 15, rsf: 0.80 }
WHEN route is ~200km
THEN response has 0 chargingStops (usableRange 245km > 200km)
AND arrivalBattery > 15%

Scenario 9: BYD Seal, HCM → Nha Trang, 80% battery
GIVEN POST /api/route with { vehicleId: "byd-seal-advance", ... }
WHEN route is ~430km
THEN response has 1-2 chargingStops
AND ALL stations in chargingStops have isVinFastOnly = false
AND NO station has operatorName containing "VinFast" or "V-Green"

Scenario 10: VF 5 Plus (short range), Hanoi → Da Nang, 60% battery
GIVEN VF 5 Plus (officialRange: 326km), currentBattery: 60%, RSF: 0.80
WHEN route is ~780km
THEN response has 4-5 chargingStops
AND all departure batteries are 80% (per spec: charge to 80%)
AND final arrivalBattery >= 15% (minArrival)

Scenario 11: No compatible stations on route (BYD on rural route)
GIVEN BYD vehicle on route with only VinFast stations nearby
WHEN no universal station exists within 15km of any route point
THEN response includes warning: "NO_COMPATIBLE_STATION"
AND response is still returned (not a 500 error)

Scenario 12: Very short trip (no charging needed)
GIVEN any vehicle at 100% battery
WHEN route is 5km (within city)
THEN response has 0 chargingStops
AND route calculation completes in < 1 second
```

### E2E Test Scenarios — Full User Flows

```
Scenario 13: Complete trip planning flow (happy path)
GIVEN user navigates to app
WHEN user enters "Hồ Chí Minh" as start
AND enters "Nha Trang" as end
AND selects "VF 8 Eco" from dropdown
AND battery is at 80% (default)
AND clicks "LÊN KẾ HOẠCH"
THEN map shows route polyline
AND charging stop markers appear on map
AND trip summary shows total distance, time, and stops
AND battery progress bar is visible

Scenario 14: Brand-aware filtering visibility (critical)
GIVEN user selects "BYD Seal Advance"
WHEN trip is planned
THEN NO green (VinFast) markers appear on map
AND station list shows only universal stations
AND label reads "Hiển thị trạm tương thích với BYD"

Scenario 15: Range Safety Factor 95% confirmation dialog
GIVEN user opens Advanced Settings
WHEN user drags RSF slider to 96%
THEN red warning appears
AND confirmation dialog is displayed
AND dialog has two buttons: "Tôi hiểu rủi ro" and "Quay về 80%"
WHEN user clicks "Quay về 80%"
THEN slider resets to 80%
AND warning disappears

Scenario 16: Custom car entry
GIVEN user clicks "Xe của tôi không có trong danh sách"
WHEN user fills: Brand="Tesla", Model="Model 3", Battery=60, Range=491
AND clicks "Lưu"
THEN dropdown shows "Tesla Model 3" as selected
AND battery panel updates with Tesla specs
AND trip can be planned with custom car

Scenario 17: Vietnamese diacritics in Places autocomplete
GIVEN user types "Đà" in start field
WHEN autocomplete suggestions appear
THEN "Đà Nẵng" appears with correct diacritics
AND selecting it works correctly
```

### Range Safety Factor Boundary Tests

```
Scenario 18: Exact boundary at 70%
GIVEN RSF slider at 70%
THEN displays "🛡️ Rất an toàn" (green)
GIVEN RSF slider at 71%
THEN displays "✅ Khuyến nghị" (green)

Scenario 19: Exact boundary at 80%
GIVEN RSF slider at 80%
THEN displays "✅ Khuyến nghị" (green)
GIVEN RSF slider at 81%
THEN displays "⚠️ Lạc quan" (orange, with animation)

Scenario 20: Exact boundary at 90%
GIVEN RSF slider at 90%
THEN displays "⚠️ Lạc quan" (orange)
GIVEN RSF slider at 91%
THEN displays "🚨 Rất rủi ro" (red)

Scenario 21: Confirmation dialog threshold at 95%
GIVEN RSF slider at 94%
THEN red warning shown, NO dialog
GIVEN RSF slider at 95%
THEN red warning shown AND confirmation dialog appears
```

### QA Tools & Automation

| Tool | Purpose |
|---|---|
| Vitest | Unit + integration testing (fast, TypeScript-native) |
| MSW (Mock Service Worker) | Mock Google Maps + OCM APIs in tests |
| Playwright | E2E browser testing |
| axe-playwright | Accessibility audits |
| Lighthouse CI | Performance regression detection |
| GitHub Actions | CI pipeline running all tests on PR |

### Regression Plan

After any code change:
1. Unit tests run automatically (pre-commit hook or CI)
2. Integration tests run on PR
3. E2E critical path tests run on PR to main
4. Full E2E suite runs nightly
5. Lighthouse CI runs on deployment preview

---

## [3/4] DevOps — Infrastructure & DevOps Plan

### Infrastructure Architecture

Per **D8** (Supabase free tier) and Vercel deployment:

```
┌─── User Browser ──────────────────────────────────┐
│  Google Maps JS API (client-side, API key)         │
└────────────┬──────────────────────────────────────┘
             │ HTTPS
┌────────────▼──────────────────────────────────────┐
│  VERCEL (Free Tier)                                │
│  ├── Edge Network (CDN for static assets)          │
│  ├── Serverless Functions (API routes)             │
│  ├── Vercel Cron (weekly station refresh, per D9)  │
│  └── Preview Deployments (per branch)              │
└────────────┬──────────────────────────────────────┘
             │ Prisma (pgbouncer mode, per D8)
┌────────────▼──────────────────────────────────────┐
│  SUPABASE (Free Tier → Pro when needed)            │
│  ├── Postgres 15                                   │
│  ├── Connection Pooler (PgBouncer)                 │
│  ├── 500MB storage / 50K MAU                       │
│  └── Auto-backups (daily, 7-day retention)         │
└───────────────────────────────────────────────────┘
             │
┌────────────▼──────────────────────────────────────┐
│  EXTERNAL APIs                                     │
│  ├── Google Directions API (server-side)           │
│  ├── Google Places API (client-side autocomplete)  │
│  ├── Open Charge Map API (server-side, cron)       │
│  └── Google Maps JS API (client-side map render)   │
└───────────────────────────────────────────────────┘
```

### Environment Strategy

| Environment | Platform | Purpose | URL |
|---|---|---|---|
| Development | Local (next dev) | Developer machine | localhost:3000 |
| Preview | Vercel Preview | Per-branch auto-deploy for PR review | *.vercel.app |
| Production | Vercel Production | Live app | ev-road-planner.vercel.app (or custom domain) |

All environments share the same Supabase instance (free tier limitation). If data isolation is needed later, create a separate Supabase project for staging.

### CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check

  unit-and-integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run test -- --coverage
      - uses: codecov/codecov-action@v4

  e2e-tests:
    runs-on: ubuntu-latest
    needs: [lint-and-type-check]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run build
      - run: npm run test:e2e

  lighthouse:
    runs-on: ubuntu-latest
    needs: [unit-and-integration-tests]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: treosh/lighthouse-ci-action@v11
        with:
          urls: |
            ${{ env.VERCEL_PREVIEW_URL }}
          budgetPath: ./lighthouse-budget.json
```

### Vercel Configuration

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/refresh-stations",
      "schedule": "0 3 * * 1"
    }
  ],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "s-maxage=60, stale-while-revalidate=300" }
      ]
    }
  ]
}
```

**Environment Variables (Vercel Dashboard):**

| Variable | Environment | Notes |
|---|---|---|
| `DATABASE_URL` | All | Supabase connection string with `?pgbouncer=true&connection_limit=1` (per D8) |
| `DIRECT_URL` | All | Supabase direct connection (for migrations only) |
| `GOOGLE_MAPS_API_KEY` | All | Server-side usage (Directions API) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | All | Client-side usage (Maps JS, Places) — restricted by referrer |
| `OPEN_CHARGE_MAP_API_KEY` | All | OCM API access |
| `CRON_SECRET` | Production | Vercel Cron authentication |

### Monitoring & Alerting

| What | Tool | Alert Threshold |
|---|---|---|
| API errors | Vercel Logs | >10 errors/hour |
| Function duration | Vercel Analytics | >10s for /api/route |
| Google Maps API spend | Google Cloud Console | $50, $100, $150 alerts |
| Supabase storage | Supabase Dashboard | >400MB (80% of 500MB free) |
| Cron job failures | Vercel Cron logs | Any failure = email alert |
| Uptime | UptimeRobot (free) | < 99% uptime = alert |

### Disaster Recovery

| Scenario | Recovery |
|---|---|
| Supabase outage | App shows cached station data (last successful fetch). Route planning degrades gracefully. |
| Google Maps API quota exceeded | Show error message: "API limit reached. Try again tomorrow." Set budget cap in Google Cloud. |
| Vercel deployment failure | Automatic rollback to previous deployment (Vercel built-in). |
| Database corruption | Supabase auto-backups. Restore from daily backup (7-day retention on free tier). |
| Cron job failure | Station data stays stale (uses previous week's data). Manual trigger via admin endpoint. |

### Cost Estimate (Monthly)

| Service | Free Tier Limit | Expected Usage (v1) | Monthly Cost |
|---|---|---|---|
| Vercel | 100GB bandwidth, 100K fn invocations | <10GB, <10K invocations | $0 |
| Supabase | 500MB storage, 50K MAU | <10MB, <500 MAU | $0 |
| Google Maps Directions API | $200 free credit, $5/1K requests | ~2K requests/month | $0 (within credit) |
| Google Maps JS API | $200 free credit, $7/1K loads | ~5K loads/month | $0 (within credit) |
| Google Places API | $200 free credit, $17/1K sessions | ~3K sessions/month | $0 (within credit) |
| Open Charge Map API | Free (rate limited) | 4 requests/month (weekly cron) | $0 |
| UptimeRobot | 50 monitors free | 1 monitor | $0 |
| **Total** | | | **$0/month** (within free tiers) |

**Scaling trigger:** When Google Maps credit runs out (~20K requests/month), expect ~$50-100/month. Upgrade to Supabase Pro ($25/month) when MAU > 10K or storage > 400MB.

---

## [4/4] Security — Security Assessment & Plan

### Threat Model (v1 Locked Scope)

**Attack Surface:**
1. Client-side web application (Next.js)
2. Server-side API routes (Vercel Serverless Functions)
3. Third-party APIs (Google Maps, Open Charge Map)
4. Database (Supabase Postgres)
5. Cron job endpoint

**Threat Actors:**
- Casual abuser: Automated scripts hitting /api/route to drain Google Maps credit
- Curious user: Inspecting network traffic, finding API keys
- Competitor: Scraping our station data or route calculations
- Malicious input: XSS via location names, SQL injection via API params

**Assets to Protect:**
- Google Maps API key (financial exposure)
- Supabase database credentials
- Station data (competitive advantage)
- Application availability

### Security Assessment by Component

#### 1. Google Maps API Key (HIGHEST RISK)

**Risk:** Client-side `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is visible in browser source. Anyone can extract it and use it on their own site, running up our Google Cloud bill.

**Mitigations:**
- **HTTP Referrer restriction** in Google Cloud Console: Only allow `ev-road-planner.vercel.app` and `localhost:3000`
- **API restrictions**: Limit key to Maps JavaScript API + Places API only. Use a SEPARATE server-side key for Directions API (never exposed to client)
- **Budget cap**: Set hard monthly budget in Google Cloud ($200/month max). API calls stop when cap is reached.
- **Quota per user**: Not available natively — implement server-side rate limiting on /api/route

#### 2. API Route Security

**Risk:** No authentication on API routes. Anyone can call `POST /api/route` programmatically.

**Mitigations (v1):**
- **Rate limiting**: Apply rate limiting middleware on all API routes. Recommended: 30 requests/minute per IP for /api/route, 100/minute for /api/stations
- **Input validation**: Validate all inputs with Zod schemas:
  - `start` and `end`: string, max 200 chars, sanitize HTML
  - `currentBattery`: number, 10-100
  - `minArrival`: number, 5-30
  - `rangeSafetyFactor`: number, 0.50-1.00
  - `vehicleId`: string, must exist in DB (or valid CustomVehicle shape)
- **CORS**: Configure Next.js to only accept requests from own domain
- **No SQL injection risk**: Prisma uses parameterized queries by default

#### 3. Cron Job Security

**Risk:** `/api/cron/refresh-stations` could be called by anyone, triggering unnecessary OCM API calls.

**Mitigation:**
```typescript
// Verify Vercel Cron secret
if (request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
  return new Response('Unauthorized', { status: 401 });
}
```

#### 4. Data Protection

**Assessment:**
- **No PII collected**: No user accounts, no login, no email, no tracking (per D3, W1)
- **localStorage data**: Custom car specs only. Not sensitive. However, if tampered (e.g., setting `officialRangeKm` to 99999), it only affects the user's own calculation — no server-side impact.
- **Station data**: Publicly available (from Open Charge Map). Not confidential.

**Conclusion:** v1 has minimal data protection concerns. No GDPR obligations (no EU personal data). Vietnam's Decree 13/2023/NĐ-CP on personal data protection does NOT apply since we collect zero personal data.

#### 5. Client-Side Security

| Threat | Mitigation |
|---|---|
| XSS via location input | Google Places Autocomplete returns sanitized data. For manual input: sanitize with DOMPurify before rendering. |
| XSS via station names | Station names come from OCM API. Sanitize before rendering. Use React's built-in JSX escaping (no `dangerouslySetInnerHTML`). |
| Prototype pollution | Use `Object.freeze()` on vehicle model data. Prisma returns plain objects, not prototypes. |
| Open redirect | No redirects in app. "Navigate" button uses `window.open()` with hardcoded `https://www.google.com/maps/dir/` prefix. |

#### 6. Dependency Security

- Run `npm audit` weekly (or on every CI build)
- Pin major versions in `package.json` (use `~` not `^` for critical deps like Prisma)
- Use Dependabot or Renovate for automated dependency PRs

#### 7. Scraping Legality (for reference — deferred to v2 per D4)

VinFast's website terms likely prohibit scraping. Open Charge Map data is CC BY-SA licensed — permitted for use with attribution. v1 is fully compliant by using only OCM data.

### Security Checklist for v1

- [x] Separate client-side and server-side Google Maps API keys
- [ ] HTTP referrer restriction on client-side key
- [ ] Budget cap on Google Cloud billing
- [ ] Rate limiting on /api/route (30 req/min/IP)
- [ ] Zod input validation on all API routes
- [ ] CRON_SECRET verification on cron endpoint
- [ ] CORS configured for own domain only
- [ ] npm audit in CI pipeline
- [ ] Content Security Policy headers (script-src, style-src)
- [ ] No `dangerouslySetInnerHTML` anywhere in codebase

### Incident Response (Lightweight for v1)

1. **API key compromise**: Rotate key immediately in Google Cloud Console. Update Vercel env vars. Redeploy.
2. **Cost spike**: Google Cloud budget alerts trigger at $50. Investigate source (legitimate traffic vs. abuse). If abuse: add IP blocklist.
3. **Database exposure**: Supabase credentials rotated in dashboard. Update Vercel env vars. Review Supabase access logs.

---

# PHASE 4: FINAL BLUEPRINT SUMMARY

---

## Executive Summary

**EVoyage** is a web-based EV trip planning tool for Vietnam that differentiates through honest range calculation (80% real-world factor), brand-aware station filtering, and Vietnamese-native UX.

### Locked Decisions (Binding)

| Decision | What it means for Sprint 1 |
|---|---|
| 15 hardcoded Vietnam models (D1) | No crawling scripts. Simple seed file. |
| Grouped dropdown selector (D2) | No search/filter UI. Simple `<select>` with optgroups. |
| Custom cars in localStorage (D3) | No user table, no auth. |
| Open Charge Map only, no scraping (D4) | One API integration. Manual VinFast seed if OCM coverage < 80%. |
| Range Safety Factor 4-tier warnings (D5) | Must ship day 1. Safety-critical. |
| Simple battery progress bar, not chart (D6) | No Recharts dependency. HTML/CSS only. |
| Haversine algorithm, no PostGIS (D7) | Simple math, server-side API route. |
| Supabase free tier + pgbouncer (D8) | $0/month to start. Document connection string. |
| Weekly cron for station refresh (D9) | Vercel Cron, 1 endpoint. |
| All exports deferred to v2 (D10) | No PDF, XLSX, email, calendar. |

### Sprint 1 Action Plan (First 5 Days)

**Day 1:**
```bash
npx create-next-app@latest evoyage --typescript --tailwind --app --src-dir
cd evoyage
npm install prisma @prisma/client @googlemaps/js-api-loader
npx prisma init
```
- Set up Supabase project, get connection strings
- Create Prisma schema (EVVehicle + ChargingStation)
- Run first migration
- Configure Tailwind with dark theme, custom fonts (JetBrains Mono, Be Vietnam Pro, Space Grotesk)
- Add Google Maps API keys to `.env.local`

**Day 2:**
- Write seed script with 15 Vietnam EV models (10 VinFast + 5 BYD)
- Query Open Charge Map API for Vietnam stations — evaluate coverage
- Seed station data into Supabase
- Write + test `calculateUsableRange()` (TDD: tests first)

**Day 3:**
- Write + test `planChargingStops()` algorithm (TDD: tests first)
- Write + test `findNearestStation()` with Haversine
- Build `POST /api/route` endpoint, wire up Google Directions API

**Day 4:**
- Build app layout (split-pane desktop / stacked mobile)
- Build TripInput component with Google Places Autocomplete
- Build BrandModelSelector (grouped dropdown)
- Build BatteryStatusPanel with sliders

**Day 5:**
- Build Range Safety Factor warnings (4 tiers, bilingual)
- Build Google Map component with route polyline
- Wire "Plan My Trip" button to API → render results
- Build TripSummary + battery progress bar

### Key Risk to Monitor

Open Charge Map Vietnam coverage. If fewer than 200 stations are returned, manually seed VinFast stations from public sources (budget: 2 hours).

### Budget

$0/month on free tiers. First cost trigger: Google Maps API credit exhaustion (~20K route calculations/month). Plan for $50-100/month at scale.

### Success Criteria for v1 Launch

1. A user can plan HCM → Nha Trang with a VF 8 Eco and see accurate charging stops
2. A BYD owner never sees VinFast-only stations
3. Range Safety Factor at 95% triggers a confirmation dialog in Vietnamese
4. The app loads in < 3 seconds on 4G mobile
5. Vietnamese diacritics render correctly everywhere
