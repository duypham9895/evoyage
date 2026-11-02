# P2 — Feedback form failures (silent 400s, CSP-blocked photo preview)

All file:line references are at commit `64db6f92e0792aa4643b2ba76958ff0843b80567` (origin/main).

> **Status 2026-11-02:** Fixed on branch `bug/p2-feedback-form-failures` (code only).
> - Finding 1: coordinates accept a decimal comma (`10,7626` → `10.7626`); anything else unparseable (including a pasted `lat, lng` pair) or out of range shows an inline error under the field (new keys `feedback_lat_invalid` / `feedback_lng_invalid`) and nothing is sent. A 400 detail for a field the form does not render now shows `feedback_invalid_input` in the submit-error box; `description` / `email` behave as before.
> - Finding 2: the preview is rendered from `URL.createObjectURL(file)` (already allowed by `img-src blob:`), revoked on remove/replace/unmount. The CSP is unchanged: allowlisting `*.public.blob.vercel-storage.com` would admit images from every Vercel Blob store, not just ours. The `src/proxy.test.ts` test (the file was renamed from `middleware.test.ts` in #126) was rewritten to pin `blob:` in img-src, and `FeedbackImageUpload.test.tsx` asserts a `blob:` preview src.
> - Still open: splitting a pasted pair across both fields (the user now gets an error instead), client-side clamping of `pageUrl` / `routeParams` (optional), and the rate limit running before validation (intended abuse guard, owner decision). Open questions 1 and 3 were not checked.

## Summary

Two defects in the feedback modal. (1) When the API rejects a field the form does not display (most realistically the MISSING_STATION coordinates typed with a decimal comma or pasted as a pair), the user presses Send and nothing happens: no error, no success, and each retry burns one of the 5/hour per-IP submissions. (2) After a successful photo upload, the thumbnail is blocked by the site's Content-Security-Policy and shows as a broken image, so the upload looks failed even though it worked.

## Severity & priority

- Group priority: **P2**, severity **medium**.
- Finding 1: filed as high; both verifiers lowered to **medium** (secondary flow, only one category, only some inputs).
- Finding 2: **medium** (3 of 4 verifier votes; one voted low). The upload and the submitted URL are unaffected; only the preview breaks.

## Affected features

- Feedback FAB → modal → submit, category MISSING_STATION (and in principle any category, for fields the form does not render: `pageUrl`, `routeParams`, `proposedLatitude`, `proposedLongitude`).
- Feedback photo upload preview (`FeedbackImageUpload`, mounted for the categories that show the upload field).

---

## Finding 1 — Feedback modal silently does nothing when the server rejects a field it does not display

### Symptom

A user reporting a missing station enters the coordinates as `10,7626` / `106,6602` (decimal comma), or pastes `10.7626, 106.6602` into one box, or types an out-of-range value. They press Send. The spinner stops, the modal stays on the form, and no message appears. The POST returned 400. Each attempt still counts against the 5/hour feedback rate limit, so after a few retries the user gets the rate-limit message instead.

### Evidence

- `src/components/feedback/FeedbackModal.tsx:132-147` — `validate()` checks only `description` and `email`. Nothing checks the coordinates.
- `src/components/feedback/FeedbackModal.tsx:176-183` — the body sends `Number(proposedLatitude)` / `Number(proposedLongitude)` directly from the inputs.
- `src/components/feedback/FeedbackModal.tsx:458-483` — the inputs are `type="text" inputMode="decimal" maxLength={20}`, so commas, spaces and text are accepted.
- `node -e 'console.log(JSON.stringify({a:Number("10.7626, 106.6602"),b:Number("10,7626")}))'` prints `{"a":null,"b":null}`: `Number()` gives `NaN`, and `JSON.stringify` turns `NaN` into `null`.
- `src/lib/feedback/schema.ts:25-26` — `z.number().min(-90).max(90).optional()` (and ±180) rejects `null` with `Invalid input: expected number, received null`, and rejects out-of-range numbers.
- `src/app/api/feedback/route.ts:74-84` — on parse failure the route returns 400 with `details: parsed.error.issues`.
- `src/components/feedback/FeedbackModal.tsx:200-214` — on a 400 with `details`, the client stores `errors[issue.path[0]] = issue.message` and calls `setValidationErrors(errors)`. It does **not** call `setStep('error')`.
- The JSX renders only three keys: `validationErrors.description` (`:378-386`), `validationErrors.email` (`:540-547`), `validationErrors.submit` (`:591-593`). Any other key (`proposedLatitude`, `proposedLongitude`, `pageUrl`, `routeParams`, ...) is stored and never shown.
- `src/app/api/feedback/route.ts:44-61` — the rate-limit check runs before JSON parse and `safeParse`, so every rejected attempt consumes quota.
- Verifier schema repro (scratch script, not in repo): body with `proposedLatitude: Number('10,7626')` round-tripped through JSON → `safeParse` → `false [["proposedLatitude"]]`; same for `200` and `"abc"`. A `pageUrl` over 2000 chars fails the same way with path `["pageUrl"]`.

### Root cause

- **Established (code + test):** two gaps together. (a) The client converts free-text coordinate inputs with `Number()` without validating or normalising them. (b) The 400-details handler writes errors under arbitrary field keys, but the form renders only three keys, so any other field error is swallowed.
- **Established:** rate limiting happens before validation, which turns the silent failure into quota loss.
- **Hypothesis (plausible, not observed):** real users hit this. The locale help text (`src/locales/en.json:343`, `vi.json:343`) tells users to long-press in Google/Apple Maps to copy coordinates. Google Maps copies a `lat, lng` pair as one string, which fits in the 20-char field and becomes `null`. Whether Vietnamese mobile keyboards emit `,` for `inputMode="decimal"` was not observed.
- Not exercised in a live browser: POST /api/feedback to prod was off-limits during the audit.

### Repro

Local dev only (do not POST to prod):

1. `npm run dev`, open the app, click the feedback button, choose the MISSING_STATION category ("Trạm chưa có trong eVoyage").
2. Description of 10+ characters; latitude `10,7626`; longitude `106,6602`.
3. Press Send, and watch DevTools → Network.
4. Expected: an error next to the coordinates, or the values normalised to `10.7626` / `106.6602`. Actual: 400 with `details` for `proposedLatitude` and `proposedLongitude`; the UI shows nothing.

### Regression tests

`src/components/feedback/FeedbackModal.test.tsx`, both marked `it.fails`:

- `normalises decimal-comma coordinates for MISSING_STATION instead of sending null`. It currently fails with `expected null to be 10.7626`. **Gotcha:** the test encodes the *normalise* fix. If the fixer instead chooses to reject commas client-side with a visible error, rewrite this test to assert that error and that no request was sent. Do not just delete it.
- `shows a visible error when the server rejects a field the form does not render`. It mocks a 400 with `details: [{path:['proposedLatitude'], ...}]` and passes if either the error step (`feedback_error_message`) or the detail message is visible. It currently fails with `expected false to be true`. The assertion is wrapped in `vi.waitFor`, so it holds whether the fix calls `setStep('error')` (which removes the submit button) or sets an inline message. **Gotcha:** it accepts exactly two visible outputs: the text `feedback_error_message` (the error step) or the raw zod message (`expected number, received null`). If the fixer shows a new generic locale key in `validationErrors.submit` instead (for example `feedback_invalid_input`), add that key to the assertion. Do not loosen it to "anything rendered".

### Fix direction

- `FeedbackModal.tsx` `validate()`: parse the coordinates. Accept `,` as a decimal separator, and consider splitting a pasted `lat, lng` pair across both fields. Check the ranges (±90 / ±180) and show an inline error under the coordinate inputs. That requires rendering `validationErrors.proposedLatitude` / `proposedLongitude`, which in turn requires new locale keys in both `en.json` and `vi.json` (`locale-keys.test.ts` enforces parity).
- 400-details branch (`:200-214`): for any key the form does not render, fall back to a visible message: `validationErrors.submit` with a generic text, or `setStep('error')`. Keep the existing behaviour for `description` / `email`.
- Optional: clamp `pageUrl` (2000) and `routeParams` (5000) client-side, so long URLs cannot trigger the same failure.
- Gotcha: `parseFloat('10,7626')` returns `10` and silently drops the decimals. Do not "fix" this with `parseFloat`.
- Out of scope unless agreed: moving the rate-limit check after validation in `route.ts`. It is a deliberate abuse guard, and changing it affects spam protection.

---

## Finding 2 — Feedback photo preview is blocked by CSP (img-src lacks the Vercel Blob host)

The audit filed this twice (areas `feedback-admin` and `ui-frontend`). It is merged here as one finding.

### Symptom

After a successful upload in the feedback modal, the thumbnail is a broken image, and the console logs a CSP `img-src` violation. The upload succeeded and the URL is still submitted with the feedback, but the user cannot see their photo and may assume the upload failed.

### Evidence

- `src/middleware.ts:97` (in `buildCsp`): `"img-src 'self' data: blob: *.openstreetmap.org *.googleapis.com *.mapbox.com *.basemaps.cartocdn.com *.vinfastauto.com"`. There is no `*.public.blob.vercel-storage.com`. The `blob:` keyword only covers `blob:` scheme URLs, not that https host.
- A grep for `img-src` across `src` and `next.config.ts` finds only this line.
- Live: `curl -sI https://evoyage.duypham.me/plan | grep -io "img-src[^;]*"` returned the same img-src, in an enforcing `content-security-policy` header (not Report-Only).
- `src/app/api/feedback/upload/route.ts:118-128`: `put(filename, buf, { access: 'public', ... })` returns `url: blob.url`.
- `src/lib/feedback/schema.ts:38` only accepts image URLs on `*.public.blob.vercel-storage.com`.
- `src/components/feedback/FeedbackImageUpload.tsx:44` `onChange(data.url)`; `:80-81` `<img src={value}>`; mounted at `FeedbackModal.tsx:430`.
- Observed in a browser (verifier, no upload performed): on https://evoyage.duypham.me/, `new Image()` pointed at `https://abc123.public.blob.vercel-storage.com/feedback/x.jpg` fired a `securitypolicyviolation` event (`violatedDirective=img-src`), and then `onerror`.

### Root cause

**Established:** the CSP img-src allowlist was not extended when Vercel Blob uploads were added. The block was observed in a real browser against prod with a probe URL. A real end-to-end upload was not run, because it writes to prod.

### Repro

- Without uploading: open https://evoyage.duypham.me/, then in the DevTools console run `const i=new Image(); i.onerror=()=>console.log('blocked'); i.src='https://abc123.public.blob.vercel-storage.com/feedback/x.jpg'`. You will see a CSP violation and `blocked`.
- End to end, only on a preview deployment with `BLOB_READ_WRITE_TOKEN` set: open feedback, pick a category with the upload field, attach a JPEG, and watch the thumbnail and the console.

### Regression test

`src/middleware.test.ts` → `CSP img-src must allow the feedback photo preview host` → `allows Vercel Blob public URLs in img-src (FeedbackImageUpload renders <img src={blob.url}>)` (`it.fails`). It currently fails because img-src has no `<host>.public.blob.vercel-storage.com` entry. The regex accepts either the wildcard `*.public.blob.vercel-storage.com` or a store-scoped `https://<store-id>.public.blob.vercel-storage.com`, so both CSP options below turn it green. **Gotcha:** if the fix renders the preview from `URL.createObjectURL(file)` instead of widening the CSP, this test stays red by design. In that case, replace it with a `FeedbackImageUpload` component test asserting that the `<img>` src is a `blob:` URL.

### Fix direction

Pick one:

- Add `*.public.blob.vercel-storage.com` (or `https://<store-id>.public.blob.vercel-storage.com` to scope it to this project's store) to img-src in `buildCsp`, `src/middleware.ts`. This is a one-line change, and the e2e CSP smoke test may need updating.
- Or render the preview from a local object URL (`URL.createObjectURL(file)`), which `blob:` already allows. This keeps the CSP tighter but needs `revokeObjectURL` cleanup. The admin view is not affected today: `src/app/admin/feedback/[id]/page.tsx:74` shows `row.imageUrl` as plain text through `field()` (`<dd>{String(value)}</dd>`, :15-22), with no `<img>`. The CSP would only matter there if admin starts rendering the image.

---

## Related low-severity items

- Rate limit consumed before validation (`route.ts:44-61` before `:74`): each invalid submit costs quota. Noted under Finding 1; probably intentional.

## Open questions / what to verify first

1. Is `BLOB_READ_WRITE_TOKEN` set in prod? If not, `/api/feedback/upload` returns 503, users never reach the preview, and Finding 2 is latent. Check in the Vercel env settings, not by uploading.
2. Product decision for coordinates: normalise silently, or reject with an inline message? This determines how the first regression test is rewritten.
3. Does a Vietnamese Android/iOS keyboard emit `,` for `inputMode="decimal"`? Check on a real device.

## Verification provenance

- Each finding was checked by 2 adversarial verifier agents on 2026-11-01, against HEAD `bfa3a3b` and live prod https://evoyage.duypham.me. Neither finding was refuted. All 4 votes confirmed the mechanism.
- This document was re-checked against `64db6f92e0792aa4643b2ba76958ff0843b80567`, and both findings still hold. Nothing was dropped; the duplicate CSP finding was merged.
- Same vendor, same priors: the verifiers are Claude agents, and no external verifier ran.
