# EV Driver User Test Report

**Date:** 2026-03-19
**Tester Profile:** VinFast VF 8 Plus owner, daily driver in HCM, weekend road trips
**Scenarios Tested:**
1. HCM (Thủ Đức) → Đà Lạt at 80% battery
2. HCM → Đà Lạt at 50% battery (low-charge start)
3. Battery tab interaction & range estimation
4. Full trip planning flow start-to-finish
5. Landing page first impression

---

## Overall Impression

**The app solves a real problem** — as an EV driver, my biggest anxiety before a long trip is "Will I run out of battery?" and "Where can I charge?". eVoyage answers both questions clearly. The 80% safety factor is smart and matches my real-world experience.

**Would I use this over Google Maps?** For trip *planning* (before I leave), yes — Google Maps doesn't show me battery levels at each point. But during the actual drive, I'd switch to Google Maps/VinFast app for turn-by-turn navigation. **The app needs a way to send the route to Google Maps.**

---

## Bugs & Issues Found

### BUG-D01: Addresses too long in input fields (HIGH)

**What happened:** After selecting "Phường Thủ Đức, Thành phố Thủ Đức, Thành phố Hồ Chí Minh, Việt Nam" — the address fills the entire input and I can't see the end of it. Same for Đà Lạt destination.

**What I expected:** Short, recognizable name like "Thủ Đức, HCM" or "Đà Lạt, Lâm Đồng"

**Driver impact:** I can't quickly confirm both locations are correct because the text is too long. On a phone, I can only see the first ~30 characters.

**Fix suggestion:** After selecting a place, show only the short name (first 2-3 parts) in the input, not the full Nominatim display name. Store the full address internally for the API.

---

### BUG-D02: Duplicate autocomplete results (MEDIUM)

**What happened:** Typing "Thu Duc" showed two identical "Thủ Đức, Nguyễn Văn Bá..." results with the same address text. As a driver, I don't know which one to pick.

**What I expected:** Unique, distinct results. If they're different points, show what makes them different (district vs. specific location).

**Fix suggestion:** Deduplicate results by coordinates (if two results are within 500m of each other, keep only one). Or deduplicate by display name.

---

### BUG-D03: No "Use my current location" button (HIGH)

**What happened:** I have to type my starting location every time. As a driver about to leave, I'm standing next to my car — the app should know where I am.

**What I expected:** A 📍 GPS button next to "Điểm đi" that fills in my current location automatically.

**Driver impact:** This is the #1 friction point. Every navigation app (Google Maps, Grab, VinFast) starts with "Your location" by default. Having to type it feels like 2015.

**Fix suggestion:** Add a location pin button that uses `navigator.geolocation.getCurrentPosition()` to fill the starting point.

---

### BUG-D04: No way to navigate to a charging station from the results (LOW)

**What happened:** The trip results show a charging stop at "Tư Nhân Huỳnh Lâm Ng..." with a "Chỉ đường" (Navigate) button. When I tap it, it opens Google Maps directions — this works! But...

**What I expected:** It works, but I wish I could copy the entire trip (with all stops) into Google Maps, not just one station at a time.

**Fix suggestion:** Add an "Open in Google Maps" button that creates a multi-stop Google Maps URL with all waypoints + charging stops pre-filled.

---

### BUG-D05: Can't see the route on the map properly (MEDIUM)

**What happened:** After planning HCM → Đà Lạt, the route line shows on the map but the map doesn't auto-zoom to fit the route. I can see markers A and B but the route goes off-screen.

**What I expected:** Map should auto-fit to show the entire route with padding after calculation completes.

**Fix suggestion:** After trip plan loads, call `map.fitBounds()` with the route polyline bounds + 20% padding.

---

### BUG-D06: Charging station names truncated — can't identify them (MEDIUM)

**What happened:** Station names show as "Tư Nhân Huỳnh Lâm Ng..." — I can't tell which station this is or where exactly it is. Is it a VinFast showroom? A mall parking lot?

**What I expected:** Full station name, or at least enough to identify it. The address below helps, but the name is the first thing I look for.

**Driver impact:** When I'm driving and need to find the station, I search by name in VinFast app or Google Maps. Truncated names are useless for this.

**Fix suggestion:** Allow station name to wrap to 2 lines instead of truncating. Or show a tooltip on tap.

---

### BUG-D07: No indication of charging cost (HIGH)

**What happened:** The trip shows charging time (24 min) but no estimated cost. As a driver, I care about both time AND money.

**What I expected:** Estimated charging cost (e.g., "~50,000 VND" or "~3.5 kWh × VND/kWh"). Even a rough estimate helps me budget.

**Driver impact:** Without cost info, I can't compare driving my EV vs. taking a bus or ICE car for this trip.

**Fix suggestion:** Add estimated energy consumed (kWh) per stop and total trip. If VinFast pricing is known, show estimated cost.

---

### BUG-D08: Round trip button exists but doesn't auto-plan return charging (MEDIUM)

**What happened:** I see the "↻ Khứ hồi" (Round trip) button but when I toggle it, it just sets the destination to the same as the start. It doesn't account for the fact that I'll arrive at Đà Lạt with 33% battery and need to charge there before coming back.

**What I expected:** A round trip plan should show BOTH legs — outbound with stops, AND return with stops — in a single view.

**Driver impact:** Right now I have to manually plan two trips. This defeats the purpose of the round trip feature.

**Fix suggestion:** For round trips, show two sections: "Đi" (outbound) and "Về" (return). The return leg should assume battery at arrival percentage from the outbound leg.

---

### BUG-D09: No saved trips / recent trips (MEDIUM)

**What happened:** I closed the browser and came back — my trip is gone. I have to re-enter everything.

**What I expected:** Recent trips saved locally, or at least the last trip remembered.

**Driver impact:** I often plan a trip the night before, then check it again in the morning. Having to redo it is frustrating.

**Fix suggestion:** Save last 5 trips to localStorage. Show a "Recent trips" section on empty state.

---

### BUG-D10: Battery percentage text at bottom of trip summary ("Đến nơi 79%") is too small (LOW)

**What happened:** The "Xuất phát 50%" and "Đến nơi 79%" text below the battery bar is `text-[10px]` — I had to squint to read it on my phone.

**What I expected:** At least 12px. This is critical info for a driver — I need to immediately see how much battery I'll have when I arrive.

**Fix suggestion:** Increase to `text-xs` (12px). Make arrival percentage bold if it's below 25% (danger zone).

---

### BUG-D11: "Hệ số an toàn" (Safety factor) is confusing UX terminology (LOW)

**What happened:** I expanded the advanced settings and saw "Hệ số an toàn" with a slider. I'm an engineer so I understand it, but my wife (who also drives our VF 8) wouldn't know what "trust 80% of range" means.

**What I expected:** Simpler language like "Kiểu lái" (Driving style) — Tiết kiệm / Bình thường / Nhanh (Economy / Normal / Sporty). Map these to 70% / 80% / 90% safety factors internally.

**Fix suggestion:** Replace the technical slider with 3 driving style presets. Keep the slider as "advanced" for power users who understand the concept.

---

### BUG-D12: No elevation warning for mountain routes (MEDIUM)

**What happened:** HCM → Đà Lạt involves climbing from sea level to 1,500m elevation through Bảo Lộc pass. The app mentions "Nhận biết địa hình" on the landing page, but the trip results don't show any elevation warning or impact on range.

**What I expected:** A warning like "⛰️ Tuyến đường có đoạn đèo cao 1,500m — pin tiêu hao nhiều hơn khi lên dốc" (This route has a 1,500m mountain pass — expect higher battery consumption on uphills).

**Driver impact:** Mountain passes are the #1 cause of range anxiety for VF8 drivers in Vietnam. The Bảo Lộc pass alone can eat 15-20% more battery than flat terrain.

**Fix suggestion:** If the route has elevation gain >500m, show an elevation warning card with estimated extra consumption.

---

## Feature Requests (As a Driver)

| # | Request | Priority | Why |
|---|---------|----------|-----|
| FR-01 | "Use my location" GPS button | **Must have** | Every driver expects this |
| FR-02 | Estimated charging cost per stop | **Must have** | Drivers need cost comparison |
| FR-03 | Open full route in Google Maps (multi-stop) | High | For actual navigation during drive |
| FR-04 | Recent/saved trips | High | Re-check trips, share with friends |
| FR-05 | Shorter display names in inputs | High | Readability on small screens |
| FR-06 | Real round-trip planning (both legs) | Medium | Weekend trip planning |
| FR-07 | Driving style presets instead of safety factor | Medium | Non-technical users |
| FR-08 | Elevation impact warning | Medium | Mountain route awareness |
| FR-09 | Show total kWh consumed for trip | Low | For energy tracking |
| FR-10 | Offline mode for saved trips | Low | Use during drive without signal |

---

## What Makes Me Come Back (Positives)

1. **80% safety factor is genius** — matches my real VF8 experience perfectly
2. **Charging station status (Sẵn sàng/Available)** — saves me from driving to a broken station
3. **Alternative stations** — if my preferred stop is busy, I can see alternatives
4. **Battery bar visualization** — I can immediately see if I'll make it
5. **CCS2 connector info** — I know the station is compatible with my car
6. **"Chỉ đường" button** — one tap to navigate to the charging station
7. **Trip summary is comprehensive** — distance, time, stops, charging time all in one view

---

## Summary: Would I Recommend This App?

**Yes, with caveats.** I'd tell my VinFast driver group: "Use eVoyage to PLAN your trip the night before. It tells you exactly where to stop and charge. But you still need Google Maps/VinFast app for actual navigation."

The app goes from **useful** to **essential** if it adds: GPS current location, charging costs, and the ability to export the route to Google Maps.

**Driver Score: 7.5/10** → Would be **9/10** with FR-01, FR-02, FR-03 implemented.
