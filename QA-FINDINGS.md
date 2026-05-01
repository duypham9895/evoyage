# QA Findings — Multi-Agent Build (2026-05-01)

**Tested:** Cost transparency + Station status crowdsourcing (the two features with new UI)
**Method:** Browser-driven QA via Chrome DevTools (mobile 393×852 + desktop 1440×900) + direct API calls + locale-keys test + full vitest suite
**Test count:** 690/690 pass (51 files)
**Production build:** ✅ (per synthesizer report)

---

## 🚧 BLOCKER

### Couldn't visually QA the new TripSummary UI
**Severity:** High (for QA), but external service
**Symptom:** OSRM routing service returns `502 Bad Gateway` on `POST /api/route`. Without a successful route, `TripSummary` doesn't render — and that's where both new features (cost section + station status reporter) live.
**Cause:** External OSRM dependency is down right now. Not from any code change.
**Workaround used:** Verified both features at lower layers — direct API calls for station status, unit-test invocation for cost calc, locale-keys sync test.
**Recommended action:** Re-run browser QA when OSRM recovers, OR test with Mapbox routing if there's a feature flag for it. The button "Use Mapbox map" / "Use OSM map" appears on desktop — possibly a routing-engine toggle worth investigating.

---

## ✅ Verified Working (lower-layer tests)

### Station status reporter — backend
| Test | Result |
|---|---|
| `POST /api/stations/[id]/status-report` with `WORKING` | ✅ 200, returns `{success, reportedAt}` |
| Same with `BROKEN` | ✅ 200 |
| Same with `BUSY` | ✅ 200 |
| Invalid status `BANANA` | ✅ Rejected: `{success: false, error: "INVALID_STATUS"}` |
| Non-existent station ID | ✅ Rejected: `{success: false, error: "STATION_NOT_FOUND"}` |
| `lastVerifiedAt` updated only on `WORKING` (not on subsequent BROKEN/BUSY) | ✅ Verified in DB |
| `StationStatusReport` rows persisted | ✅ 3 rows visible after test |

### Cost transparency — calculation
For VinFast VF8 Eco trip HCMC→Vũng Tàu (120km, 186 Wh/km efficiency):
- Electricity: **78.120 ₫** (~$3.20 USD) — reasonable for 22 kWh of EVN public charging
- Gasoline equivalent: **193.200 ₫** (~$7.85 USD) — based on 8.4L × 23k VND/L
- Savings: **115.080 ₫ (60%)** — consistent with typical EV vs ICE economics
- Vietnamese number formatting (`.` as thousands separator) is correct ✅

### Locale keys (cost + station status)
- `npx vitest run src/lib/__tests__/locale-keys.test.ts` → 6/6 pass ✅
- 5 cost keys present in en.json + vi.json: `trip_cost_heading`, `trip_cost_electricity`, `trip_cost_savings`, `trip_cost_no_savings`, `trip_cost_note`
- 10+ station status keys present in en.json + vi.json (report flow + status display)
- Vietnamese tone matches existing copy (e.g., "Sạc điện: ~{{amount}}", "So với xăng: tiết kiệm {{amount}}")

### Bilingual toggle (sanity)
- "EN" button on home → toggles all VI text to EN ✅
- "VI" button toggles back ✅

### Existing flows (regression check)
- Home page renders on mobile + desktop ✅
- /plan loads on both viewports ✅
- Vehicle picker loads (15 vehicles) ✅
- eVi tab loads with suggestions and chat input ✅
- DesktopTabBar shows correct tabs on 1440×900 ✅
- Map (Leaflet/OSM) renders ✅
- No PostHog console errors (correctly gated to NODE_ENV=production + key present) ✅

### Full test suite
- 690/690 pass in 8.31s ✅

---

## 🚨 Bugs Found (all PRE-EXISTING, NOT from this build)

### Finding #1 — Emojis in vehicle filter buttons
**Severity:** Low
**Location:** `/plan` → Xe tab → filter buttons
**Issue:** Buttons read "🇻🇳 Xe tại VN" and "🌍 Tất cả". DESIGN.md says "No emoji in tabs, navigation, avatars, or interactive elements." These are interactive filter buttons.
**Fix:** Replace with plain text labels — e.g., "Tại Việt Nam" / "Tất cả". Pre-existing.

### Finding #2 — Emojis in selected vehicle card
**Severity:** Low
**Location:** `/plan` → Xe tab → after selecting a vehicle, the summary card shows "🔋 87.7 kWh", "📏 471 km", "⚡ 150 kW".
**Issue:** Same DESIGN.md violation. The icons are decorative, not functional.
**Fix:** Replace with plain labels: "Pin: 87.7 kWh", "Tầm xa: 471 km", "Công suất: 150 kW". Pre-existing.

### Finding #3 — Footer GitHub link is wrong account
**Severity:** Medium (404 on click)
**Location:** Footer, both mobile + desktop, both en + vi
**Issue:** Link points to `https://github.com/edwardpham94/evoyage` — that account doesn't have the repo. Real account is `duypham9895`.
**Fix:** Update href in the footer component. Pre-existing.

### Finding #4 — Page `<title>` doesn't translate
**Severity:** Low
**Location:** Browser tab title
**Issue:** Toggle to English; the `<title>` stays "eVoyage — Lên kế hoạch chuyến đi xe điện tại Việt Nam".
**Fix:** Wire title into the locale system (Next.js metadata API supports dynamic titles). Pre-existing.

### Finding #5 — Map alt-text doesn't translate
**Severity:** Low (a11y)
**Location:** Hero image on home page
**Issue:** `alt="Bản đồ Việt Nam với tuyến đường xe điện..."` stays Vietnamese in English mode.
**Fix:** Move alt to locale keys. Pre-existing.

### Finding #6 — Hydration mismatch in dev console
**Severity:** Low (dev-only warning, no user-facing impact)
**Location:** `/plan` page on mobile viewport
**Issue:** React hydration error from `MapLocateButton` ("server rendered HTML didn't match the client").
**Cause:** Likely the `latitude`/`longitude` props start as `null` server-side and get a value client-side, or something similar.
**Fix:** Wrap in `<ClientOnly>` or use `useEffect` for the initial state. Pre-existing.

---

## 📌 Things I Could Not Test

| Thing | Why | Suggested next step |
|---|---|---|
| Actual cost section render (in-browser) | OSRM 502 blocks TripSummary | Wait for OSRM or test with Mapbox |
| Actual station status buttons (click in browser) | Same — TripSummary not rendered | Same |
| "Xác nhận lần cuối: X phút trước" label | Same | Same |
| PostHog event firing in production | No NEXT_PUBLIC_POSTHOG_KEY in dev (correctly gated) | Set env var on Vercel after sign-up |
| eVi AI chat (full flow) | Skipped — eVi UI loaded but didn't send a message | Manual smoke test |

---

## ✅ Recommended Decision

**The new features are SAFE TO PUSH** based on:
- 690/690 unit/integration tests pass
- Backend API for station status verified working (5 happy/error paths)
- Cost calculation produces correct Vietnamese values
- Locale keys synced
- No regressions on home page, vehicle picker, eVi tab, language toggle
- Production build passes (per synthesizer)

**The 6 bugs found are all pre-existing**, none introduced by this multi-agent build. Worth a separate cleanup PR (probably a 30-min job).

**You should still do one in-browser smoke test** of the actual TripSummary UI when OSRM is back up, before considering this fully QA'd. Test scenario:
1. Plan trip Quận 1 → Vũng Tàu, VinFast VF 8 Eco
2. Confirm "Chi phí chuyến đi" section appears with reasonable VND numbers
3. Tap a station status button (e.g., "Báo trạm hoạt động")
4. Verify some UI feedback (toast, label change, or "Xác nhận lần cuối" appears)

---

## Screenshots captured
- `test-results/qa-mobile-vehicle-selected.png` — mobile, VF8 Eco selected, OSRM error visible
- `test-results/qa-desktop-home.png` — desktop home page
