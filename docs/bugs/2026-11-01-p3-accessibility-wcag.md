# Bug: WCAG AA failures (text contrast and unlabelled place inputs) — P3

Date: 2026-11-01 · Base commit: `64db6f92e0792aa4643b2ba76958ff0843b80567` · Branch: `bug/p3-accessibility-wcag`

> **Status 2026-11-02:**
> - **Fixed, Finding 2:** `PlaceAutocomplete` ties its `<label>` to the combobox with `useId()` + `htmlFor`/`id`, so the field is named by its label ("Điểm đi"). Both regression tests are flipped to `it`.
> - **Fixed in code, Finding 1 (contrast):** informational text moves from `--color-muted` to `--color-text-secondary` on the sites this doc lists: the `PlaceAutocomplete` label, the inactive `MobileTabBar` tab, the `Header` language toggle and the listed `LandingPageContent.tsx` lines. The fix also covers the same kind of text on `/` that the list missed: the "add model" link in `LandingPageContent.tsx`, and in `LandingClient.tsx` both locale toggles, the FAQ answers and the stat-counter labels. Placeholders, borders, hover borders and token values are unchanged. The three `it.fails` contrast tests are flipped to `it`. A new test in `LandingPageContent.test.tsx` checks every token-coloured text on `/` against landing navy, the worst landing background.
> - **Merge gate, still open:** Duy signs off on before/after screenshots of `/`, `/plan` desktop and `/plan` mobile before merge. The code is reversible, but the change is visual and DESIGN.md asks for his check.
> - **Fixed, related items:** the `/plan` language toggle's accessible name now starts with its visible text (WCAG 2.5.3). The landing footer headings are `h2`, not `h4`. `/plan` has an `sr-only` `h1` in both layouts.
> - **Still open:**
>   - The "infra" role card's name text on `/` (`LandingPageContent.tsx`, inline `color: 'var(--color-muted)'`) is a deliberate third colour tier next to accent and info, so changing it is Duy's design call.
>   - The FAQ "+" glyph stays muted. It is a state graphic (WCAG 1.4.11, 3:1), but Lighthouse may still count it as text.
>   - Muted text on `/plan` outside this doc's list ("Gợi ý cho bạn", "TUYẾN ĐƯỜNG", Khứ hồi, `page.tsx` disabled reason) and the wider sweep of about 180 sites are deferred to a follow-up PR.
>   - Also not done: the optional input `name`, the eVi chat input label, a Lighthouse rerun and a VoiceOver check.
> - **Defaults taken (reversible, owner may override):** toggle name "EN – Chuyển sang tiếng Anh" / "VI – Switch to Vietnamese". `h1` copy "Lên lộ trình xe điện" / "Plan your EV trip". Footer labels become `h2`. `LandingClient.tsx` text and the "add model" link are counted as part of Finding 1. The "+" glyph and the infra card colour stay muted.

## Summary

Labels, inactive tabs, the language toggle and much of the landing page copy use the muted token `#6B6B78`. That gives 3.2–3.75:1 contrast, below the WCAG AA minimum of 4.5:1, so low-vision users and anyone on a phone in sunlight struggle to read core navigation. The origin and destination inputs are also not programmatically tied to their visible labels. A screen reader announces an example placeholder ("VD: Thủ Thiêm, TP.HCM") where it should say the field name ("Điểm đi").

## Severity & priority

- Priority: **P3**. Group severity: **medium**.
- Finding 1 (contrast): medium. Both verifiers agreed.
- Finding 2 (labels): medium. One verifier said medium, the other low. The field still gets *a* name (the placeholder) and the flow works, but the name describes an example value, not the field's purpose.
- Neither finding breaks a flow. Both are standards failures (WCAG 1.4.3, 1.3.1, 4.1.2) on the main trip-planning surface.

## Affected features

- Trip planner `/plan`: origin, destination and waypoint inputs, the mobile tab bar and the header language toggle.
- Nearby stations: both of its `PlaceAutocomplete` inputs.
- Landing page `/`: hero copy, stat captions, section body text and footer.

---

## Finding 1 — Muted token `#6B6B78` used for informational text fails AA contrast

### Symptom

These elements are hard to read on the dark backgrounds:
- form labels (Điểm đi / Điểm đến)
- inactive mobile tabs (Xe, Pin, Trạm sạc, Đã lưu)
- the EN/VI toggle
- the "Gợi ý cho bạn" and "TUYẾN ĐƯỜNG" headings
- the Khứ hồi button text
- landing stat labels and footer text

### Evidence (at 64db6f9)

- `src/app/globals.css:16` sets `--color-muted: #6B6B78`. `:17` sets `--color-text-secondary: #A0A0AB`.
- `DESIGN.md:44-45`:
  - Text Secondary `#A0A0AB` is for "supporting text, descriptions".
  - Muted `#6B6B78` is for "placeholders, borders, disabled text" only.
- Muted is used on non-disabled text in these places:
  - `src/components/trip/PlaceAutocomplete.tsx:183`: the field `<label>` (`text-xs text-[var(--color-muted)]`)
  - `src/components/layout/MobileTabBar.tsx:54`: the inactive tab branch
  - `src/components/layout/Header.tsx:21`: the language toggle
  - `src/components/landing/LandingPageContent.tsx`, lines 116, 131, 135, 139, 142, 187, 219, 237, 260, 264, 268, 308, 340, 357, 377, 399, 406, 424, 427 and 438
- Contrast ratios computed from the hex values with the WCAG 2.x formula:

  | Background | `#6B6B78` (muted) | `#A0A0AB` (text-secondary) |
  |---|---|---|
  | `#0F0F11` background | 3.65:1 | 7.40:1 |
  | `#1A1A1F` surface | 3.30:1 | 6.70:1 |
  | `#0D1B3E` landing navy | 3.22:1 | 6.52:1 |
  | `#0B0B0D` landing footer | 3.75:1 | 7.60:1 |
  | `#111114` landing alt | 3.59:1 | 7.28:1 |

- Lighthouse (mobile, live prod, from the audit):
  - `/plan`: `color-contrast` flagged 10 nodes, e.g. `button#tab-vehicle` at 3.64:1 and the label "Điểm đi" at 3.3:1.
  - `/`: 12 nodes, e.g. stat labels at 3.21:1 on `#0d1b3e` and the footer at 3.74:1.

### Root cause

- **Established:** `--color-muted` is applied to informational, enabled text, outside the scope DESIGN.md sets for it. The token value is not wrong. Where it is used is wrong.
- **Not a cause:** the two most recent commits that touched globals.css (cf41161, 3529f7f) did not change the value.

### Repro

```bash
# Lighthouse accessibility, mobile, on prod (read-only)
npx lighthouse https://evoyage.duypham.me/plan --only-categories=accessibility --form-factor=mobile --quiet --output=json \
  | jq '.audits["color-contrast"].details.items | length'
# repeat for https://evoyage.duypham.me/
grep -n "color-muted" src/components/layout/MobileTabBar.tsx src/components/layout/Header.tsx src/components/trip/PlaceAutocomplete.tsx
```

### Regression tests

All of them use a test-only helper, `src/lib/__tests__/wcag-contrast.ts`. It finds the `text-[var(--color-x)]` class on an element, looks up that token's hex value in `globals.css`, and computes the WCAG ratio. The helper has its own passing tests in `src/lib/__tests__/wcag-contrast.test.ts`.

- `src/components/layout/MobileTabBar.test.tsx` › `renders inactive tab text with at least 4.5:1 contrast on the page background (WCAG 1.4.3)`
- `src/components/layout/Header.test.tsx` › `renders the language toggle text with at least 4.5:1 contrast on the header surface (WCAG 1.4.3)`
- `src/components/trip/PlaceAutocomplete.test.tsx` › `renders the field label with at least 4.5:1 contrast on the surface card (WCAG 1.4.3)`

All three are `it.fails`. They test what the class names say, not pixels a browser actually rendered. They pass whichever way the fix is done: a different token in the class, or a different token value.

- **Not unit-tested:** the landing page (`LandingPageContent.tsx`, about 20 sites). Too many sites, and the backgrounds vary by section. Check it with the Lighthouse command above, and expect `color-contrast` to report 0 items.

### Fix direction

- Switch informational text from `var(--color-muted)` to the existing `var(--color-text-secondary)` (`#A0A0AB`). That covers the labels, inactive tabs, the toggle, the stat captions, landing body copy and the footer.
- No new token is needed, and DESIGN.md does not change. The fix brings the code back in line with DESIGN.md. (The original audit said the fix needed approval because it touches DESIGN.md. Both verifiers corrected that.)
- Keep `--color-muted` for placeholders (`PlaceAutocomplete.tsx:201`, `placeholder:text-[var(--color-muted)]`), for borders (e.g. `Header.tsx:21` `hover:border-[var(--color-muted)]`) and for genuinely disabled text.
- Gotchas:
  - Do not change the `--color-muted` value itself. That also lightens borders and placeholders, which DESIGN.md intends to stay subdued.
  - `--color-border` is built from the same RGB (`rgba(107,107,120,0.2)`).
  - Hover states (`hover:text-[var(--color-foreground)]`) should still be visibly brighter than the resting colour.
  - The UI change is visual, so check it against DESIGN.md and show Duy before/after screenshots.

---

## Finding 2 — Origin/destination inputs are not programmatically labelled

### Symptom

A screen reader announces the combobox by its placeholder example ("VD: Thủ Thiêm, TP.HCM"), not by its label ("Điểm đi"). Voice-control users cannot say "click Điểm đi".

### Evidence (at 64db6f9)

- `src/components/trip/PlaceAutocomplete.tsx:183`: `<label className=...>{label}</label>`. It has no `htmlFor` and does not wrap the input; the input sits in a sibling `<div>`.
- `PlaceAutocomplete.tsx:187-201`: `<input role="combobox">` has no `id`, no `aria-label` and no `aria-labelledby`.
- `useId()` is already imported. Line 27 uses it only for `listboxId`.
- The only `aria-label` in the component is on the GPS button (`:216`).
- No caller can fix this from outside, because the component accepts no id or aria prop. Callers:
  - `TripInput.tsx:81`, `:121`
  - `WaypointInput.tsx:79`
  - `NearbyStations.tsx:507`, `:532`
- Live `/plan` check during the audit (`evaluate_script`): all three inputs returned `{id:'', name:'', aria:null, labelled:false}`. Chrome's Issues panel reports "A form field element should have an id or name attribute".
- axe and Lighthouse do **not** flag this. The placeholder counts as an accessible name, so this finding came from manual review.

### Root cause

- **Established:** the label element is visual only and has no association with the input.
- **Hypothesis, corrected by a verifier:** the original finding said the name disappears once the user types. That is probably wrong. Chrome's accessible-name computation keeps falling back to the placeholder even when the field has a value. The real defect is that the announced name is an example value, not the field's purpose. Nobody has tested this with VoiceOver.

### Repro

1. Open https://evoyage.duypham.me/plan in Chrome.
2. In DevTools, go to Elements › Accessibility and select the "Điểm đi" input. The computed name comes from the placeholder ("VD: …").
3. Or turn on VoiceOver (Cmd+F5) and Tab to the field.

### Regression tests

In `src/components/trip/PlaceAutocomplete.test.tsx` (`@/lib/geo/nominatim` is mocked):
- `names the combobox by its visible label, not by the example placeholder (WCAG 1.3.1 / 4.1.2)`: `getByRole('combobox', { name: 'Điểm đi' })`
- `keeps the field label reachable after the user has typed a value`: `getByLabelText('Điểm đi')` has value `'Quận 1'`

Both are `it.fails`.

jsdom's name computation (dom-accessibility-api) does **not** use the placeholder as a fallback. In jsdom the name today is `""`, not the placeholder. So the tests can encode "named by the label", but they cannot reproduce the exact browser announcement.

### Fix direction

- In `PlaceAutocomplete`, generate an input id with `useId()`. Set `<label htmlFor={inputId}>` and `<input id={inputId}>`, or use `aria-labelledby`.
- Keep `aria-controls={listboxId}` as it is.
- Also set `name` on the input to clear the Chrome Issues warning (optional).
- Related, not tested: the eVi chat input renders `placeholder="VD: Đi Đà Lạt, VF8, pin 85%"` with no `aria-label` or `id`. One verifier saw this in the server-rendered HTML of `/plan`. Give it an `aria-label`, or a visually hidden label that both locales provide.

---

## How to flip the tests

All 5 tests are `it.fails`. Each has a `// BUG(p3-accessibility-wcag)` comment directly above it.

1. After the fix, change `it.fails` to `it` and run:

   ```bash
   npx vitest run src/components/trip/PlaceAutocomplete.test.tsx src/components/layout/Header.test.tsx src/components/layout/MobileTabBar.test.tsx src/lib/__tests__/wcag-contrast.test.ts
   ```

2. Author-side check: a throwaway edit swapped the three components to `--color-text-secondary` and added `htmlFor`/`id`. With that edit in place, all 5 `it.fails` reported "Expect test to fail", which shows they flip. The edit was reverted and is not in this branch.
3. `Header.test.tsx` finds the toggle with `{ name: 'Toggle language' }`. If you also fix the related WCAG 2.5.3 item below by renaming that label, update the query too.

## Related low-severity items (not tested)

- **Language toggle accessible name does not contain the visible text (WCAG 2.5.3).** In `Header.tsx`, `aria-label="Toggle language"` hides the visible "EN"/"VI", so a voice user who says "click EN" fails. Fix direction: drop the `aria-label`, or make it start with the visible text, e.g. "EN – switch to English".
- **Heading order skips a level.** The footer of `LandingPageContent.tsx` (`:406`, `:424`) uses `<h4>` after `<h2>`, with no `<h3>` between. Separately, `/plan` (`src/app/plan/page.tsx`) has no `<h1>`. Screen-reader heading navigation is degraded.

## Dropped findings

None. Both findings still hold at `64db6f9`, and the cited lines are unchanged from the audit at `bfa3a3b`.

## Open questions / what to verify first

1. Run the Lighthouse command after the fix. The `/plan` count includes elements outside the three tested components ("Gợi ý cho bạn", "TUYẾN ĐƯỜNG", Khứ hồi). Grep `color-muted` across `src/components/**` to find every remaining text use.
2. VoiceOver check of the combobox name before and after the fix. That confirms the "name disappears when typing" claim either way.
3. Duy's sign-off on the visual change (brighter secondary text), per DESIGN.md.

## Verification provenance

- The audit (2026-11-01, HEAD `bfa3a3b`, live prod https://evoyage.duypham.me) found both findings. Two adversarial verifier agents then checked each one, and neither refuted either finding.
- The verifiers are Claude agents: same vendor, same priors, and no external verifier ran.
- This document re-checked the code at `64db6f9` (origin/main) and recomputed the contrast ratios locally.
