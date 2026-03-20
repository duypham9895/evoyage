# Vietnam Map Landing Hero — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-drawn `RouteVisualization` SVG with an accurate, interactive Vietnam map component using real GADM geographic data.

**Architecture:** Pre-process TopoJSON → static SVG path data at build time (stored as a TypeScript module). React component renders the SVG with CSS animations and vanilla JS tooltip. No runtime geo libraries.

**Tech Stack:** Next.js, TypeScript, Tailwind CSS, Python (build script only)

---

## File Structure

```
src/components/landing/
├── VietnamMap.tsx          # New — main map component (~200 lines)
├── vietnam-map-paths.ts    # New — pre-generated SVG path data (~85KB)
├── LandingPageContent.tsx  # Modify — replace RouteVisualization with VietnamMap
├── LandingClient.tsx       # No changes
scripts/
├── generate-vietnam-map.py # New — TopoJSON → TypeScript converter
```

---

### Task 1: Create the map data generator script

**Files:**
- Create: `scripts/generate-vietnam-map.py`
- Input: TopoJSON from GADM gist (downloaded to `/tmp` at build time)
- Output: `src/components/landing/vietnam-map-paths.ts`

- [ ] **Step 1: Write the generator script**

The script should:
1. Download `vietnam-with-paracel-and-spartly-islands.json` from the GitHub gist
2. Decode TopoJSON arcs with delta encoding
3. Apply equirectangular projection with cos(15.75°) latitude correction:
   - LON_MIN=101.5, LON_MAX=118.0, LAT_MIN=7.0, LAT_MAX=24.5
   - SVG_W=771, SVG_H=850
4. Simplify paths with Ramer-Douglas-Peucker (tolerance=0.008)
5. Generate TypeScript module exporting:

```typescript
export const VIETNAM_MAP = {
  viewBox: '-5 10 781 855',
  provinces: [
    { name: 'An Giang', paths: ['M174.4,694.1L173.2,...Z'] },
    // ... 63 provinces
  ],
  islands: {
    hoangSa: { center: [503, 375], dots: [[x,y], ...] },    // 19 dots
    truongSa: { center: [616, 664], dots: [[x,y], ...] },   // 11 dots
    named: [
      { name: 'Phú Quốc', path: 'M118.1,...Z', center: [83, 693] },
      { name: 'Cát Bà', path: 'M259.2,...Z', center: [184, 180] },
      { name: 'Lý Sơn', path: 'M355.6,...Z', center: [254, 443] },
      { name: 'Thổ Chu', path: 'M92.7,...Z', center: [66, 738] },
      { name: 'Bạch Long Vĩ', path: 'M291.8,...Z', center: [207, 212] },
      { name: 'Cồn Cỏ', path: 'M272.5,...Z', center: [195, 357] },
      { name: 'Côn Đảo', path: null, center: [170, 768] }, // dot only
    ],
  },
  cities: [
    { name: 'Hà Nội', x: 203.3, y: 168.5, primary: true },
    { name: 'Vinh', x: 195.3, y: 282.7 },
    { name: 'Huế', x: 284.6, y: 390.5 },
    { name: 'Đà Nẵng', x: 313.1, y: 410.4 },
    { name: 'Quy Nhơn', x: 360.7, y: 521.2 },
    { name: 'Nha Trang', x: 359.3, y: 595.5 },
    { name: 'Đà Lạt', x: 324.3, y: 610.1 },
    { name: 'TP.HCM', x: 239.7, y: 664.5, primary: true },
  ],
  route: 'M239.7,664.5 C269.7,649.5 ...',  // full bezier
  connectors: {
    hoangSa: { from: [328, 410], to: [463, 375] },  // Đà Nẵng coast → HS
    truongSa: { from: [374, 596], to: [566, 664] },  // Nha Trang coast → TS
  },
} as const;

// Legal: province name corrections applied during generation
// - "Bà Rịa – Vũng Tàu" (en-dash)
// - "Thừa Thiên – Huế" (en-dash)
// - "Hòa Bình" (correct diacritic)
```

6. Apply legal name fixes during generation (L1-L4 from review)

```python
scripts/generate-vietnam-map.py
```

- [ ] **Step 2: Run the script and verify output**

```bash
python3 scripts/generate-vietnam-map.py
```
Expected: Creates `src/components/landing/vietnam-map-paths.ts` (~85KB)

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit src/components/landing/vietnam-map-paths.ts
```
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-vietnam-map.py src/components/landing/vietnam-map-paths.ts
git commit -m "feat: add Vietnam map data generator and pre-built SVG paths"
```

---

### Task 2: Create the VietnamMap React component

**Files:**
- Create: `src/components/landing/VietnamMap.tsx`

- [ ] **Step 1: Write the component**

The component should:

1. Import `VIETNAM_MAP` from `./vietnam-map-paths`
2. Render an `<svg>` with:
   - `viewBox` from data
   - `role="img"` + `aria-label="Bản đồ Việt Nam với tuyến đường xe điện từ TP.HCM đến Hà Nội, bao gồm quần đảo Hoàng Sa và Trường Sa"`
   - SVG `<defs>` for gradients (`landFill`, `bgGlow`, `islandHalo`, `routeGlow`)
3. Province groups: map over `VIETNAM_MAP.provinces`, render each as `<g className="province" data-name={name}>` with `<path>` elements
4. Named islands: map over `VIETNAM_MAP.islands.named`, render shapes or dots
5. Hoàng Sa group: `<g className="archipelago" data-name="Quần đảo Hoàng Sa (Việt Nam)">` with dots, halo, label + "(Việt Nam)" subtitle, dashed connector
6. Trường Sa group: same pattern
7. Route: glow path + crisp path + traveling `<circle>` with `<animateMotion>`
8. City nodes: static circles + labels
9. Tooltip div: `<div>` positioned absolutely, shown/hidden via `useRef` + event handlers

Interaction logic (all in the component, no external JS):
- `onMouseOver` / `onMouseMove` / `onMouseOut` on the SVG for desktop hover
- `onTouchStart` on the SVG for mobile tap-to-reveal (auto-hide 2s via `setTimeout`)
- Target: `.province`, `.named-island`, `.archipelago` elements via `closest()`

- [ ] **Step 2: Add CSS to globals.css**

Add these to `src/app/globals.css` under the landing animations section:

```css
/* Vietnam map */
.province path {
  transition: fill 0.2s, stroke 0.2s;
}
.province:hover path {
  fill: rgba(0, 212, 170, 0.22);
  stroke: rgba(0, 212, 170, 0.4);
  stroke-width: 0.6;
}
.archipelago { cursor: pointer; transition: opacity 0.2s; }
.archipelago:hover { filter: drop-shadow(0 0 8px rgba(0, 212, 170, 0.3)); }

@media (max-width: 767px) {
  .island-label-sm { display: none; }
}
```

Also update the existing `@media (prefers-reduced-motion: reduce)` block to include map animations.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/VietnamMap.tsx src/app/globals.css
git commit -m "feat: add VietnamMap interactive component with province hover"
```

---

### Task 3: Integrate into landing page

**Files:**
- Modify: `src/components/landing/LandingPageContent.tsx`

- [ ] **Step 1: Replace RouteVisualization with VietnamMap**

In `LandingPageContent.tsx`:
1. Delete the entire `RouteVisualization` function (lines 24-90)
2. Add import: `import VietnamMap from './VietnamMap';`
3. In the hero section, replace `<RouteVisualization />` with `<VietnamMap />`
4. Update the container div: change `max-w-[320px] md:max-w-[400px]` to `max-w-[400px] md:max-w-[500px]` (wider to accommodate correct aspect ratio)

- [ ] **Step 2: Clean up old CSS**

In `src/app/globals.css`, remove the old animation classes that are no longer used:
- `.route-path` and `@keyframes drawRoute` (replaced by inline SVG animate)
- `.charge-dot` and its nth-child animation rules

- [ ] **Step 3: Build and verify**

```bash
npm run build
```
Expected: Build succeeds

- [ ] **Step 4: Visual test**

```bash
npm run dev
```
Open `http://localhost:3000` and verify:
- Map renders in hero section with correct proportions
- Province hover shows tooltip with Vietnamese name
- Hoàng Sa + Trường Sa visible with "(Việt Nam)" labels
- All 7 named islands visible with labels
- Route animation plays smoothly
- Mobile: tap provinces shows tooltip
- Test `prefers-reduced-motion`: animations should be disabled

- [ ] **Step 5: Run tests**

```bash
npm test
```
Expected: All existing tests pass (no regression)

- [ ] **Step 6: Commit**

```bash
git add src/components/landing/LandingPageContent.tsx src/app/globals.css
git commit -m "feat: replace hand-drawn SVG with interactive Vietnam map on landing page"
```

---

### Task 4: Write tests for map component

**Files:**
- Create: `src/components/landing/VietnamMap.test.tsx`

- [ ] **Step 1: Write component tests**

Test cases:
1. Renders SVG with correct role and aria-label
2. Renders all 63 provinces as `.province` groups
3. Each province has a `data-name` attribute with Vietnamese text
4. Renders Hoàng Sa and Trường Sa as `.archipelago` groups
5. Archipelago labels include "(Việt Nam)"
6. Renders all 8 city labels
7. Named islands are present (Phú Quốc, Côn Đảo, Cát Bà, etc.)
8. Province names use correct punctuation ("Bà Rịa – Vũng Tàu", "Thừa Thiên – Huế", "Hòa Bình")

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/components/landing/VietnamMap.test.tsx
```
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/VietnamMap.test.tsx
git commit -m "test: add VietnamMap component tests for provinces, islands, and sovereignty labels"
```

---

### Task 5: Final verification

- [ ] **Step 1: Full build**

```bash
npm run build
```

- [ ] **Step 2: Full test suite**

```bash
npm test
```
Expected: All 245+ tests pass (including new map tests)

- [ ] **Step 3: Bundle size check**

```bash
npx next build 2>&1 | grep -A5 "Route.*Size"
```
Verify the landing page bundle hasn't grown excessively (the ~85KB path data should be code-split since it's only used on the landing page).

- [ ] **Step 4: Commit and push**

```bash
git push
```
