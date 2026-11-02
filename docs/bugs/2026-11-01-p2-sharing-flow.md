# Bug note: sharing flow (p2-sharing-flow)

Date: 2026-11-01 · Code reference: `64db6f92e0792aa4643b2ba76958ff0843b80567` (origin/main) · Live: https://evoyage.duypham.me

> **Status 2026-11-02:**
> - Fixed on this branch:
>   - Related item 1: when the fallback clipboard write also fails, Copy link and Share link show `share_copy_failed` (en + vi) and the full URL to copy by hand, instead of claiming it was copied.
>   - Finding 3: the share modal is portalled to `document.body` and raised to `z-[900]`, above FeedbackFAB (800) and EViFab (750). Unit tests pin the portal, the z-index order and the X closing the modal. Real hit-testing on a 390x844 viewport is not covered by a test yet.
>   - Related item 2: `resolveShortUrl` now returns ok / not-found / expired. `/s/[code]` redirects with `link-not-found` (bad format or no row), `link-expired` or `link-unavailable` (the lookup threw). ErrorBanner shows `share_link_not_found`, `share_expired` or `share_link_unavailable` (new keys, en + vi); unknown codes get the not-found copy. ErrorBanner also latches the code, because the `/plan` URL sync drops `?error` about 300 ms after mount and the banner disappeared on the next re-render.
> - Still open:
>   - Finding 1 (OG preview): needs Duy's product decision (site-wide image vs per-trip card on `/s/[code]`, keep or delete `/api/share-card`). Its test stays `it.fails`.
>   - Finding 2 (auto-plan on open): needs Duy's decision. Each open would cost one `/api/route` call, and the tests open `/plan?…` directly, so passing them means re-planning on every reload. Both tests stay `it.fails`.
>   - Finding 4: unreproduced; needs a real iPhone.
>   - Related item 3 (`/api/share-card` untested): waits on Finding 1.
>   - Same layering pattern, not fixed here: `FeedbackModal` is `z-[100]` below its own FAB; ShareButton's `aria-label`s "Close" and "Share trip" are hardcoded English.
> - Defaults taken (reversible, owner may override): Finding 3 uses portal + `z-[900]` rather than hiding the FABs while a modal is open. Related item 2 uses three codes with new copy: en "This trip link doesn't exist or the address is mistyped. Please plan a new trip." / vi "Không tìm thấy liên kết này. Bạn kiểm tra lại đường dẫn hoặc lên lộ trình mới nhé." and en "We couldn't open this trip link right now. Please try again in a moment." / vi "Chưa mở được liên kết lúc này. Bạn thử lại sau ít phút nhé."; unknown codes fall back to the not-found copy.

## Summary

Sharing a planned trip half-works. The short link resolves, but the person who opens it sees a filled form with no route until they press Plan. In Zalo, Messenger or Slack the link shows no preview image or trip title. On a phone, tapping the share modal's X opens the feedback form. A fourth issue (Copy link failing on iOS Safari's first tap) is plausible but unverified.

## Severity and priority

- Group priority: P2. Nothing is blocked; each issue has a workaround (press Plan, tap the backdrop, tap Copy again).
- Per finding (verifier votes in brackets):

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Shared links have no link preview; `/api/share-card` is an unused POST-only JSON endpoint | low (both verifiers lowered it from medium) | Confirmed |
| 2 | Shared link restores the form but does not plan the trip | medium / low (split) | Confirmed. Whether it is a bug or a product choice needs Duy's decision |
| 3 | Mobile: the feedback button covers the share modal's X, so tapping X opens feedback | medium (both) | Confirmed live |
| 4 | Copy link may fail on iOS Safari's first tap | medium / refuted-as-unverified | Hypothesis, contested |

## Affected features

Short URLs (`/s/[code]`), the `/plan` URL restore, `ShareButton` (copy link, share link, modal), `FeedbackFAB`, `EViFab`, social preview metadata.

---

## Finding 1: shared links have no link preview; `/api/share-card` is unused

**Symptom.** A `/s/<code>` link pasted into a chat app shows no image and no trip title. `CHANGELOG.md:305` claims "Trip sharing via short URLs with OG share card generation".

**Evidence (at 64db6f9 and live).**
- `curl -s -o /dev/null -w "%{http_code} %{size_download}" https://evoyage.duypham.me/api/share-card` gives `405 0`. `src/app/api/share-card/route.tsx:45` exports only `POST`. The comment at `:119` still says "Return SVG-based card as HTML"; `:133-134` return `NextResponse.json(cardData)`.
- `grep -rn share-card src` outside `src/app/api/share-card/` finds no caller.
- `src/app/s/[code]/page.tsx` has no `generateMetadata`. It calls `redirect()` straight away (307), so a crawler (UA `facebookexternalhit`) is sent to `/plan`.
- `/plan` (`src/app/plan/page.tsx`, a client component) has no metadata. `src/app/layout.tsx:26-35` sets title and description only, with no `openGraph`.
- `src/app/page.tsx:7-25` (the landing page) does set `openGraph` and `twitter`, but with no image. No `opengraph-image.*` file exists under `src/app`. So the whole site has no `og:image`.

**Root cause.**
- Established: no OG image route exists. Shared links redirect to `/plan` before any trip metadata could be served, and `/plan` has no OG tags. `/api/share-card` returns JSON and nothing calls it.
- Hypothesis: the share-card route was once an image or HTML renderer and was rewritten into JSON. The stale comment at `:119` suggests this; the git history was not checked.
- Correction to the original finding: OG metadata does exist on `/` (without an image). Saying "no OG metadata anywhere" overstates it.

**Repro.**
```
curl -s -o /dev/null -w "%{http_code}\n" https://evoyage.duypham.me/api/share-card     # 405
curl -s https://evoyage.duypham.me/plan | grep -c 'og:'                                  # 0
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" -A facebookexternalhit/1.1 https://evoyage.duypham.me/s/AAAAAAA   # 307 -> /plan?error=link-not-found
```

**Regression test.** `src/app/s/[code]/page.test.ts` › `exposes trip-specific OG metadata with an og:image for a resolved short link` (`it.fails`). It fails today because `generateMetadata` is undefined. This test assumes the fix puts the metadata on `/s/[code]`. If the fix serves OG tags from `/plan` instead, for example through a `plan/layout.tsx`, rewrite the test against that route rather than deleting it. A passing companion test, `redirects a resolved code to /plan with the stored trip params`, pins the current redirect.

**Fix direction.**
- Product decision first: delete `/api/share-card` as dead code, or turn it into a real image route (`next/og` `ImageResponse`, `GET`, keyed by short code).
- `/s/[code]` must answer crawlers with meta tags. Today a bare `redirect()` means bots never see a page. Options: add `generateMetadata` to `/s/[code]` and render a minimal page that redirects on the client or through a meta refresh, or add OG metadata to `/plan` through a server `layout.tsx`. `/plan/page.tsx` is `'use client'` and cannot export metadata.
- Cheapest partial fix: a site-wide `src/app/opengraph-image.(png|tsx)`. Note that `src/app/page.tsx` overrides `openGraph` shallowly. Check that the file-based image still applies to `/`.
- Update `CHANGELOG.md:305`, or make it true.
- `generateMetadata` on `/s/[code]` would call `resolveShortUrl`, a DB read, for every crawler hit. Keep it cheap and do not call `incrementAccessCount` from it.

---

## Finding 2: a shared link restores the form but does not plan the trip

**Symptom.** The recipient opens a shared link and lands on `/plan` with start, end, vehicle and battery filled in. No route, no charging stops and no map line appear until they press "Tính lộ trình" (Plan).

**Evidence (at 64db6f9).**
- `src/app/plan/page.tsx:224-283`: the URL restore runs at render time (`if (isClient && !restoredFromUrl)`) and only calls setters.
- `:287-298`: a separate effect fetches `/api/vehicles?id=<vid>` and sets `selectedVehicle`.
- Auto-planning runs only when `autoPlanRequestId` changes (`:355`, effect at `:739-744`). It is incremented only at `:406` (eVi "plan trip") and `:708` (notebook re-plan). The URL-restore path never increments it.
- `ShareButton.tsx` builds the link from `window.location.search`, and `/s/[code]` redirects to `/plan?{params}`. Every share recipient takes this path.
- Live check by a verifier, GET only: after loading `/plan?start=Ho%20Chi%20Minh&end=Vung%20Tau&slat=10.7769&slng=106.7009&elat=10.346&elng=107.0843&vid=<real id>`, the only `/api/` request made was `GET /api/vehicles?id=...`. No `/api/route` call followed, and no result rendered after about 12 s.
- The e2e gap: `e2e/url-state.spec.ts:35-59` only asserts that the URL contains `/plan`. Lines 11 and 39 use `vehicleId=`, `startLat=` and `endLat=`. The parser reads `vid`, `slat`, `slng`, `elat` and `elng` (`src/hooks/useUrlState.ts:54-96`), so neither vehicle nor coordinate restore is exercised.

**Root cause.**
- Established: the URL-restore path has no auto-plan trigger.
- Not established: that auto-planning is the intended behaviour. No README, CONTEXT or ADR says so. `docs/design/short-url-system.md` only requires that params "survive round-trip", which the current code does. One verifier rated this low for that reason.

**Repro.** Run locally (`npm run dev`), plan a trip, copy the URL, and open it in a fresh tab. The form is filled and no trip result appears.

**Regression tests** (`src/app/plan/page.effects.test.tsx`, both `it.fails`, both fail today with "expected 0 to be greater than 0", meaning no `/api/route` call):
- `shared-link recipient (URL restore) › auto-plans a shared link with start/end coords and a custom vehicle, without pressing Plan`
- `shared-link recipient (URL restore) › auto-plans a shared link with a preset vehicle id once the vehicle fetch resolves`

Both were checked to turn green against a throwaway local patch, which was reverted and not committed. The patch was an effect that bumps `autoPlanRequestId` once restored start, end, coordinates and a vehicle are all present. So the tests detect the fix and are not only red by accident.

**Fix direction.**
- In `src/app/plan/page.tsx`, increment `autoPlanRequestId` once, after the restore, when start and end (and their coordinates in mapbox mode) and a vehicle are present.
- For `vid`, wait for the vehicle fetch at `:287-298` to resolve. Firing earlier makes `handlePlanTrip` fail with "Please select a vehicle", the race noted in `docs/plans/2026-06-05-trip-planning-reliability-plan.md:151`.
- The trigger must be one-shot. It must not fire again when the user edits inputs, because the URL sync effect at `:302-319` rewrites the URL.
- Product cost: every share-link open will call `/api/route`. Duy must approve this before it is treated as a bug fix.
- Fix `e2e/url-state.spec.ts` to use `vid`, `slat`, `slng`, `elat` and `elng`, and assert that a trip result renders.

---

## Finding 3: on mobile, the feedback button covers the share modal's X

**Symptom.** At 390x844, tapping the X in the share modal's top-right corner opens the "Gửi góp ý" feedback sheet on top of the still-open share modal.

**Evidence.**
- Live, from a verifier using Playwright at 390x844 on prod: the Close button rect is `{x:330,y:338,w:32,h:32}`. `elementFromPoint(346,354)` returns the feedback button (`aria-label="Gửi góp ý"`, rect `{x:334,y:327.8,w:44,h:44}`). After `page.mouse.click(346,354)`, the open dialogs are `['Share trip','eVi','Gửi góp ý']`.
- Code (at 64db6f9):
  - `src/components/feedback/FeedbackFAB.tsx:261`: `fixed z-[800] right-3 bottom-[calc(55vh+8px)]`. Its drag style at `:248` also sets `zIndex: 800`.
  - `src/components/trip/EViFab.tsx:21`: `z-[750]`.
  - `src/components/trip/ShareButton.tsx:454`: overlay `fixed inset-0 z-[100]`.
  - `src/components/layout/MobileBottomSheet.tsx:161`: sheet root `fixed ... z-40`.
  - `src/app/plan/page.tsx:1014`: on mobile, `ShareButton` renders inside `MobileBottomSheet`. `EViFab` (`:1085`) and `FeedbackFAB` (`:1096`) are siblings of the sheet.

**Root cause (established).** The sheet root (`fixed z-40`) creates a stacking context. The share modal's `z-[100]` only orders it inside the sheet, and the sheet as a whole paints at z-40. The FABs (z-800 and z-750) paint above it. The feedback button's default position overlaps the X of the vertically centred modal. **Raising the modal's z-index alone will not fix this on mobile.**

**Repro.** On a 390x844 viewport, plan a trip, tap "Chia sẻ chuyến đi", then tap the X. Playwright snippet for after the modal is open:
```js
const r = await page.getByRole('dialog', { name: 'Share trip' }).getByRole('button', { name: 'Close' }).boundingBox();
await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label'), [r.x + r.width / 2, r.y + r.height / 2]);
// returns "Gửi góp ý" today; should return "Close"
```

**Regression test.** Not unit-testable with confidence. jsdom has no layout, hit testing or stacking-context resolution, and the bug only appears from how `page.tsx` composes the sheet and the FABs. Any jsdom test would have to fix the solution in advance (portal or hide the FABs). A good home for a test is a Playwright mobile spec built from the snippet above: assert that `elementFromPoint` at the Close button's centre is the Close button.

**Fix direction.** Either render the share modal through a portal to `document.body` with a z-index above 800, or hide `FeedbackFAB` and `EViFab` while any modal is open. Hiding them needs shared "modal open" state, since `FeedbackFAB`'s `isOpen` at `:43` and `:148` tracks only its own modal. Check `FeedbackModal` (`z-[100]`) and the eVi sheet for the same problem.

---

## Finding 4 (hypothesis, contested): Copy link may fail on iOS Safari's first tap

**Symptom if the hypothesis holds.** On the first tap of "Copy link" on iOS or macOS Safari, the short URL is created but nothing is copied, and the user sees "Couldn't create a short link. The full URL has been copied instead." A second tap works because the URL is now cached.

**Evidence (code only, at 64db6f9).**
- `handleCopyLink` in `src/components/trip/ShareButton.tsx:152-183` awaits `getOrCreateShortUrl()` before calling `navigator.clipboard.writeText(url)` at `:158`.
- On first creation, that await covers `fetch('/api/short-url')` (`:116`), `response.json()` (`:130`) and `QRCode.toDataURL` (`:137`).
- The fallback `writeText` at `:176` also runs after these awaits.
- `handleShareLink` (`:186-203`) awaits the same chain before calling `navigator.share`, which also needs transient activation.

**Root cause.** Hypothesis: WebKit drops transient user activation across the awaits, so `writeText` is rejected. No one has seen this happen. Of the two verifiers, one marked it refuted (unverified, no WebKit available) and one upheld it at medium severity based on WebKit's documented Async Clipboard behaviour.

**Repro (manual, needs a real device).** On an iPhone in Safari, plan a trip, tap Share, then tap "Copy link" once. Read the message, then paste somewhere to see what was actually copied. Do not POST `/api/short-url` on prod from scripts. Use a local or preview deployment.

**Regression test.** Not unit-testable. jsdom does not model user activation, and Playwright's WebKit does not apply Safari's real clipboard policy faithfully.

**Fix direction (only if confirmed on a device).** Call `navigator.clipboard.write([new ClipboardItem({'text/plain': promiseOfBlob})])` synchronously inside the click handler (Safari accepts a promise-valued `ClipboardItem`). Or create the short URL when the modal opens, so the click handler copies synchronously. Check `handleShareLink` too.

---

## Related low-severity items

1. **The copy-link fallback claims success even when it failed.** `ShareButton.tsx:174-180`: if the fallback `writeText(getFullUrl())` also throws, the inner `catch` still shows `share_link_error` ("…The full URL has been copied instead.", `src/locales/en.json:204`, `vi.json:204`). The user then pastes whatever was on the clipboard before. This happens in every browser, not only Safari.
   - Regression test: `src/components/trip/ShareButton.test.tsx` › `does not claim the full URL was copied when the fallback clipboard write also fails` (`it.fails`, fails today because the text is shown).
   - Passing companion test: `copies the full URL and says so when short-link creation fails but the fallback copy succeeds`.
   - Fix direction: add a separate locale key for "could not copy", in both en and vi (`locale-keys.test.ts` enforces parity), and show the long URL so the user can select it by hand.
2. **Every short-link error says "expired".** `src/app/s/[code]/page.tsx:13,22,26` all redirect to `?error=link-not-found`. A malformed code, an unknown code and a DB failure all look the same. `src/components/layout/ErrorBanner.tsx:40` always shows `share_expired` ("This trip link has expired…"), so a typo or an outage is reported to the user as expiry. Not tested here; it needs a product decision on the wording.
3. **Test gaps.** Before this branch nothing tested `ShareButton`, `/s/[code]` or `/api/share-card`. The only e2e short-URL test mocks `/s/` itself and uses the wrong param names (see Finding 2). This branch adds unit coverage for the first two. `/api/share-card` remains untested until the product decides whether to keep it.

## Open questions / what to verify first

1. Duy: should opening a shared link auto-plan (Finding 2)? It costs one `/api/route` call per open. If not, record that as a design decision and delete the two `it.fails` tests instead of flipping them.
2. Duy: keep `/api/share-card` and build a real OG image, or delete it (Finding 1)? Also, is a generic site-wide `og:image` enough, or is a per-trip card required?
3. Before fixing Finding 4, reproduce it on a real iPhone. If it does not reproduce, close it.
4. For Finding 3, decide whether to portal the modal or hide the FABs. The choice applies to every modal opened from inside the mobile bottom sheet, not only Share.
5. Unrelated flakiness seen while writing these tests: the first test in `src/app/plan/page.effects.test.tsx` (`passes geolocationSupported=true…`) took 3.6 s on a warm run and timed out at 5 s once on a cold run, from the first dynamic import of `page.tsx`. This was pre-existing, and the base passed 2 of 2 runs.

## Verification provenance

- Each finding was checked by 2 adversarial verifier agents on 2026-11-01, against HEAD `bfa3a3b` and live prod. Findings 1-3 were confirmed by both. Finding 4 was contested (1 refuted as unverified, 1 upheld).
- Re-checked against `64db6f9` while writing this note. All cited code still matches, and no finding was dropped.
- The verifiers ran on the same vendor and model family as the author: same vendor, same priors, and no external verifier ran.
- Live checks were read-only (GET only). No short codes were created on prod, and nothing was written to the production DB.
