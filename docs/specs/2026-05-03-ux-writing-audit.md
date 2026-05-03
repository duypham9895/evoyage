# UX Writing Audit — eVoyage Locale Copy

**Date:** 2026-05-03
**Author:** Duy Phạm (PM) + Claude Code (Senior UX Writer review)
**Status:** Approved & implemented
**Scope:** `src/locales/en.json` + `src/locales/vi.json` (string values only — no key changes)

---

## Trigger

User flagged a duplicated-feeling collision between the desktop tab `Plan Trip` and the primary action button `Plan this trip`. Audit was extended to cover all user-facing copy in both languages as a Senior UX Writing pass.

## Findings

### Issue 1 — Tab/button collision (the original ask)

| Surface | Before EN | Before VI | After EN | After VI |
|---|---|---|---|---|
| Desktop tab | `Plan Trip` | `Lên lộ trình` | **`Trip`** | **`Chuyến đi`** |
| Primary button | `Plan this trip` | `Xem lịch trình` | **`Calculate route`** | **`Tính lộ trình`** |
| eVi confirm button | `Plan Trip` | `Lên lộ trình` | **`Calculate route`** | **`Tính lộ trình`** |

**Why this works:**
- Tab becomes a noun (`Trip` / `Chuyến đi`) — matches sibling tabs `eVi` and `Stations` which are also nouns. Three-noun parallel structure.
- Button becomes an accurate action verb. The previous Vietnamese `Xem lịch trình` ("View itinerary") was misleading — there is no itinerary to view yet; the click *creates* one.
- Reuses already-established vocabulary: `Recent trips` / `Chuyến đi gần đây`, `Share trip` / `Chia sẻ chuyến đi`.

### Issue 2 — Vietnamese terminology fragmentation

Five overlapping words for the same concept were scattered across the app. Canonicalised to:

| Word | Meaning | Used for |
|---|---|---|
| `chuyến đi` | the journey/trip event | UI surfaces, summaries, share copy |
| `lộ trình` | the planned route | tabs, buttons, instructional text |
| `tuyến đường` | the map polyline | route field, route tab |
| `hành trình` | poetic "journey" | **AI-narrated context only** (`route_briefing`, eVi's self-introduction) |
| `lịch trình` | itinerary | **deprecated** — replaced everywhere |

Replacements applied (besides the Issue 1 keys):
- `share_expired`: `lên lịch trình mới` → `lên lộ trình mới`
- `plan_your_trip`: `Lên lịch trình chuyến đi` → `Chi tiết chuyến đi`
- `evi_speech_error`: `gõ hành trình` → `gõ lộ trình`
- `evi_voice_unavailable`: `gõ hành trình` → `gõ lộ trình`

`route_briefing`, `route_briefing_loading`, and `evi_not_trip` keep `hành trình` because they frame AI narrative output, where the more poetic register reads naturally.

### Issue 3 — English CTA copy duplication

`Plan your trip` appeared 3× as the same string across distinct surfaces. Differentiated:

| Key | Before | After |
|---|---|---|
| `plan_your_trip` (form heading) | `Plan your trip` | `Trip details` |
| `landing_hero_cta` (top CTA) | `Plan your trip` | `Start planning` |
| `landing_cta_button` (bottom CTA) | `Plan your trip` | `Plan a trip` |

Vietnamese: `landing_hero_cta` was previously `Bắt đầu ngay` — same as `landing_cta_button`. Differentiated to `Lên lộ trình ngay` (specific) at the top, `Bắt đầu ngay` (summary) at the bottom.

### Issue 4 — Title Case → sentence case

Project convention is sentence case. Stragglers fixed:
- `route_briefing`: `Route Briefing` → `Route briefing`
- `nearby_title`: `Nearby Charging Stations` → `Nearby charging stations`
- `share_qr_code`: `QR Code` → `QR code`
- `evi_show_on_map`: `Show on Map` → `Show on map`

(Vietnamese already follows sentence case throughout — no changes needed.)

### Issue 5 — eVi confirm button echoed the tab

`evi_plan_button` was the same string as the desktop tab (`Plan Trip` / `Lên lộ trình`). Folded into Issue 1 — now also reads `Calculate route` / `Tính lộ trình`, matching the primary plan button for consistency across all "plan" affordances.

---

## Changes summary

- **`src/locales/en.json`:** 10 string values updated, 0 keys added/removed.
- **`src/locales/vi.json`:** 8 string values updated, 0 keys added/removed.
- **No code changes.** All key names preserved, so all `t('...')` call sites continue to work.
- **`locale-keys.test.ts`** continues to pass — only values changed, no key drift.

## Out of scope (flagged but not changed)

- `Mình` self-reference in eVi greetings — appropriate for the AI character's voice; the project rule "use Duy not Mình" applies to copy authored *by* Duy (transparency section), not the AI character's first-person speech.
- Sample trip chip labels (`sample_trip_*`) — already concise and consistent.
- Station report copy — already follows good patterns.
