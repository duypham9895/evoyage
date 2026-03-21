# Vietnam Map Landing Hero — Design Spec

## Goal

Replace the simplified hand-drawn SVG in the landing page hero section with an accurate, interactive Vietnam map built from real geographic data (GADM TopoJSON, CC0 license). The map includes all 63 provinces, all major Vietnamese islands, Hoàng Sa & Trường Sa archipelagos with sovereignty labels, an animated EV charging route, and province-level hover tooltips.

## Data Source

- **GADM TopoJSON** via [tandat2209/gist](https://gist.github.com/tandat2209/5eb797fc2bcc1c8b6d71271353a40ab4) — CC0 license, no attribution required
- Contains: `gadm36_VNM_1` (63 provinces), `gadm36_XPI_0` (Hoàng Sa/Paracel), `gadm36_XSP_0` (Trường Sa/Spratly)
- Simplified with Ramer-Douglas-Peucker (tolerance 0.008) for web performance
- Projection: equirectangular with cos(15.75°) latitude correction

## Map Projection

```
LON_MIN=101.5, LON_MAX=118.0
LAT_MIN=7.0, LAT_MAX=24.5
CENTER_LAT=15.75°N, cos(15.75°)=0.9625

SVG_W = 771, SVG_H = 850 (ratio 0.907 — true geographic proportions)

project(lon, lat):
  x = (lon - LON_MIN) × cos(CENTER_LAT) / REAL_W × SVG_W
  y = (1 - (lat - LAT_MIN) / REAL_H) × SVG_H
```

## Components

### 1. Mainland (63 provinces)

- Each province is a separate `<g class="province" data-name="...">` with `<path>` elements
- Fill: linear gradient `#1464F4` (25% opacity) → `#00D4AA` (15%) → `#00D26A` (10%)
- Stroke: `#1C1C1E` at 0.3px (province borders barely visible — unified landmass look)
- CSS `drop-shadow` for subtle glow (replaces triple-rendered SVG approach)
- Hover: fill changes to `rgba(0, 212, 170, 0.22)`, stroke to `rgba(0, 212, 170, 0.4)`
- Tooltip: shows province name in Vietnamese with diacritics

### 2. Named Islands (shapes from GADM data)

| Island | Province | Coordinates | Render |
|--------|----------|-------------|--------|
| Phú Quốc | Kiên Giang | 10.22°N, 103.96°E | Shape outline |
| Cát Bà | Hải Phòng | 20.73°N, 106.98°E | Shape outline |
| Lý Sơn | Quảng Ngãi | 15.38°N, 109.13°E | Shape outline |
| Thổ Chu | Kiên Giang | 9.26°N, 103.46°E | Shape outline |
| Bạch Long Vĩ | Hải Phòng | 20.13°N, 107.73°E | Shape outline |
| Cồn Cỏ | Quảng Trị | 17.16°N, 107.34°E | Shape outline |
| Côn Đảo | Bà Rịa – Vũng Tàu | 8.68°N, 106.60°E | Dot marker (not in GADM) |

- Fill: `rgba(0, 212, 170, 0.2)`, stroke: `#00D4AA` at 0.8px
- Labels: 8px teal text, `class="island-label-sm"` (hidden on mobile <768px)
- Hoverable with tooltip

### 3. Hoàng Sa & Trường Sa (sovereignty markers)

| Archipelago | Position | Islands in data |
|-------------|----------|-----------------|
| Hoàng Sa (Paracel) | ~16.5°N, 112°E | 19 island dots |
| Trường Sa (Spratly) | ~8.5-11°N, 112-115°E | 11 island dots |

- Each island rendered as teal dot (r=3-3.5) at real geographic position
- Radial gradient halo (`islandHalo`) behind each group
- Expanding ring animation (`ringExpand`)
- Breathing opacity animation
- Label: "Hoàng Sa" / "Trường Sa" in 11px bold teal, with "(Việt Nam)" subtitle in 8px
- Label has pill background: `rgba(0, 212, 170, 0.12)` with `#00D4AA` border
- Dashed connector line from nearest coastal city (Đà Nẵng → Hoàng Sa, Nha Trang → Trường Sa)
- **Hoverable**: `class="archipelago"`, tooltip shows "Quần đảo Hoàng Sa (Việt Nam)"

### 4. EV Charging Route

Path: **TP.HCM → Đà Lạt → Nha Trang → Quy Nhơn → Đà Nẵng → Huế → Vinh → Hà Nội**

City coordinates (verified):

| City | Lat | Lon | SVG (x, y) |
|------|-----|-----|-------------|
| Hà Nội | 21.03°N | 105.85°E | (203.3, 168.5) |
| Vinh | 18.68°N | 105.68°E | (195.3, 282.7) |
| Huế | 16.46°N | 107.59°E | (284.6, 390.5) |
| Đà Nẵng | 16.05°N | 108.20°E | (313.1, 410.4) |
| Quy Nhơn | 13.77°N | 109.22°E | (360.7, 521.2) |
| Nha Trang | 12.24°N | 109.19°E | (359.3, 595.5) |
| Đà Lạt | 11.94°N | 108.44°E | (324.3, 610.1) |
| TP.HCM | 10.82°N | 106.63°E | (239.7, 664.5) |

- Route: smooth cubic bezier path following coastline
- Glow layer: `filter: gaussianBlur(3)`, opacity 0.3, stroke `#00D26A` 2.5px
- Crisp layer: opacity 0.55, stroke `#00D26A` 1px
- Traveling pulse: circle r=3, `animateMotion` 5s loop along the same bezier
- City nodes: static double-circle (outer halo + inner solid), no animation
  - Endpoints (Hà Nội, TP.HCM): r=7/3.5, `#1464F4` / `#00D26A`
  - Intermediate: r=5/2.5, alternating `#00D26A` and `#1464F4`
  - Đà Lạt: `#00D4AA` (teal, distinct as highland stop)
- City labels: Hà Nội + TP.HCM in `#F5F5F7` 11px bold, others in `#8E8E93` 9px

### 5. Tooltip System

- `<div id="tooltip">` absolutely positioned inside map wrapper
- Desktop: `mouseover` on `.province`, `.named-island`, `.archipelago` → show name, follow cursor
- Mobile: `touchstart` → show at tap position, auto-hide after 2s
- Style: dark glass (`rgba(28,28,30,0.95)` + `backdrop-filter: blur(8px)`), teal border, rounded

### 6. Accessibility

- SVG: `role="img"` + `aria-label` in Vietnamese
- `@media (prefers-reduced-motion: reduce)`: all animations disabled
- All province names include proper Vietnamese diacritics

## Legal Requirements

- Province names use official Vietnamese naming with correct punctuation:
  - "Bà Rịa – Vũng Tàu" (en-dash, not ASCII hyphen)
  - "Thừa Thiên – Huế" (en-dash)
  - "Hòa Bình" (not "Hoà Bình")
- Hoàng Sa and Trường Sa labeled as "(Việt Nam)"
- No English colonial names ("Paracel", "Spratly") in rendered UI

## Performance

- Target: <100KB total SVG (current: 98.8KB)
- Single province render + CSS `drop-shadow` (not triple SVG layers)
- Simplification tolerance 0.008 balances detail vs file size
- No external dependencies (pure inline SVG + vanilla JS)

## Integration

Replaces `RouteVisualization` component in `src/components/landing/LandingPageContent.tsx` (lines 24-90). The new component will be `VietnamMap` in `src/components/landing/VietnamMap.tsx`.

Existing CSS animations in `src/app/globals.css` (`.route-path`, `.charge-dot`) can be removed after migration.
