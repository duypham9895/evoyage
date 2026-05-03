# Feedback Bugs Investigation — 2026-05-03

**Status:** Resolved (2/3 shipped, 1 deferred as planned). See "Resolution" section below.
**Trigger:** Two real-user feedback emails (both from PM dogfooding alt account `duypham1810@gmail.com`, sent 2026-05-01).
**Method:** 3 parallel read-only investigators (Track A — share flow; Track B — email QP artifact; Track C — eVi performance). No code changes during investigation phase.

## Resolution

| # | Issue | Outcome | Commit |
|---|-------|---------|--------|
| 1 | Shared link → blank page | **Shipped** — `ErrorBanner` reads `?error=` via `useSyncExternalStore`, dismiss button strips the param from URL, reuses `share_expired` copy. | `57bd69b fix(plan): show error banner when shared link is invalid` |
| 2 | Email URL QP corruption | **Shipped** — explicit plain-text body sent to Resend so the auto-generated QP-encoded fallback no longer mangles URLs. | `7630ccd fix(feedback): send plain-text body so Resend stops mangling URLs` |
| 3 | eVi feels slow + responses too long | **Stage 1 shipped** — capped M2.7 reasoning tokens and parallelized vehicle resolve + end-geocode. Stage 2 (instrumentation) and Stage 3 (model swap / streaming) deferred until Stage 1 impact is measured. | `5861165 perf(evi): cap M2.7 reasoning + parallelize vehicle and end-geocode` |

---

## TL;DR

| # | Issue | Root cause | Confidence | Severity | Fix cost |
|---|-------|-----------|------------|----------|----------|
| 1 | Shared link → blank page | DB wipe on 2026-04-30 invalidated old short URLs **+** `/plan` silently swallows the `error=link-not-found` redirect param | HIGH | HIGH | S — error banner; data loss itself is unrecoverable |
| 2 | Email URL mangled (`=10` → `0x10`) | Resend payload sends `html` only with no `text`; Resend auto-generates QP-encoded plain-text fallback that decodes URL `=NN` as bytes | HIGH | LOW (cosmetic, only PM sees it; HTML renders fine) | S — explicitly send `text` body |
| 3 | eVi feels slow + responses "too long" | MiniMax-M2.7 is a reasoning model with `<think>` chain; `max_tokens: 16384` lets it think for ages; fully buffered (no streaming); function region defaults to US East but Minimax API is in China | HIGH | MED (flagship feature feels broken) | S–M — multiple cheap wins |

---

## Issue 1 — Shared link → blank page (P0)

### Root cause (two-part)

**1a. Data loss (unrecoverable)**
Per `docs/RECOVERY.md:86`, the Supabase project was deleted and rebuilt on 2026-04-30. The `ShortUrl` table was wiped as part of the schema rebuild. Every short URL created before that date now returns 404 from `resolveShortUrl()`.

**1b. Silent failure mode (fixable)**
When `/s/[code]` can't resolve the code, it redirects to `/plan?error=link-not-found` (`src/app/s/[code]/page.tsx:26-28`). But `parseUrlState()` in `src/hooks/useUrlState.ts:40` never reads the `error` param. The page renders an empty trip form with no explanation. User perceives this as "blank."

### Evidence

- `docs/RECOVERY.md:86-89` — explicit incident note: "ShortUrl — All previously-shared trip links — Old share links return 404"
- `src/app/s/[code]/page.tsx:13,23,26-28` — all error paths redirect to `/plan?error=link-not-found`
- `src/hooks/useUrlState.ts:40` — `parseUrlState` ignores any param outside the recognized trip-state keys
- Timing alignment: user said the friend "already planned" the trip → link created pre-2026-04-30 → opened post-2026-04-30 → 404 path

### Fix proposal (root-cause-targeting only)

The data loss cannot be undone. What we CAN fix:

1. On `/plan?error=<code>`, render a dismissable error banner with localized copy
   - `link-not-found` → "This shared link is no longer valid. It may have expired or been removed. Plan a new trip below." (vi + en variants)
   - Generic fallback for other error codes
2. Component scope: a small `<ErrorBanner />` reading `useSearchParams()` for the `error` key

### Failing test (TDD per CLAUDE.md rules)

- `src/app/plan/__tests__/error-banner.test.tsx` — render `<PlanPage />` with `?error=link-not-found` → expect banner copy visible
- E2E: navigate to `/s/INVALID0` → expect redirect to `/plan` with banner visible

### Risk / blast radius

Low. Adds one component, one locale key, conditional render keyed on URL param. Does not touch share creation, plan logic, or `/s/[code]` route.

### Open scope-creep question

Should we also add a `localStorage` "Restore last trip" feature — when user successfully plans, save the params; when they later land on empty `/plan`, offer to restore? This would soften any future DB-loss event. Likely out of scope for this fix; flag for separate spec.

---

## Issue 2 — Email URL QP corruption (P3 — defer)

### Root cause

`src/lib/feedback/email.ts:163-169` calls Resend with only an `html` field, no `text`. When `text` is omitted, Resend auto-generates a plain-text MIME alternative by stripping HTML tags, then transmits it with `Content-Transfer-Encoding: quoted-printable`. URLs contain literal `=` characters between query keys and values; the QP decoder reads `=NN` (where NN is any pair of hex digits) as a single byte. Hence:
- `slat=10.650257` → `slat` + 0x10 + `.650257`
- `elat=11.908263` → `elat` + 0x11 + `.908263`

### Evidence (smoking gun)

- `src/lib/feedback/email.ts:163-169` — payload with `html` only, no `text`
- The corruption pattern affects **only** params whose values start with two hex digits (`10`, `11`, `06`, `08`)
- `vid=vf8-plus` is **untouched** — `vf` isn't valid hex, so no QP decoding triggers
- DB stores the URL clean (`prisma/schema.prisma` line 187, `pageUrl String?` raw, written verbatim from Zod-parsed body)

### Fix proposal

Provide an explicit `text` field in the Resend payload where URLs are placed safely (e.g., wrapped in `<…>` per RFC 3986, or with surrounding whitespace) AND `=` characters in the URL are escaped to `=3D`. Or use Resend's React Email integration to render both bodies consistently.

Minimum viable fix: add a `text:` field we control, even if just `[Description]\n\n[URL]\n\n[Device]\n\n[Other fields]` with a tiny QP-escape helper for `=`.

### Failing test

- `src/lib/feedback/email.test.ts` — build payload with `pageUrl` containing `?slat=10&slng=106`. Capture text body sent to Resend (mock fetch). Assert text body, after QP-decoding, does not contain `` or ``.

### Risk / blast radius

Very low. Single file change. Only affects PM-internal feedback emails.

### Why deferred

- Only Duy receives these emails. The HTML body renders correctly in Gmail web (the bug is purely in the plain-text MIME alternative).
- Dogfooding feedback loop continues to work without this fix.

---

## Issue 3 — eVi slow + verbose (P1)

### Root cause (compound)

Three independent factors stacked:

1. **M2.7 is a reasoning model.** The comment at `src/lib/evi/minimax-client.ts:74` confirms it: responses are wrapped in `<think>...</think>` tags that have to be stripped. The model emits 1k–8k think tokens before the 350-token JSON.
2. **`max_tokens: 16384`** at `minimax-client.ts:62` — gives the reasoning chain a huge budget. No incentive for brevity.
3. **Fully buffered, no streaming.** Server uses `openai.chat.completions.create()` without `stream: true`; client does `await lastRes.json()` (`useEVi.ts:317`). User stares at typing indicator for the entire round-trip.

Plus secondary:
- Vercel function region defaults to iad1 (US East). Minimax API is in China. Every call pays cross-Pacific RTT.
- `resolveVehicle()` + `searchPlaces()` run sequentially after Minimax returns (`parse/route.ts` lines 99 and 117) — 300-700ms wasted.

### Reframing: "slow" and "too long" are the same complaint

The actual JSON output is tight (~350 tokens). The user isn't complaining about a verbose displayed answer — they're complaining about the wait. "Too long" = "took too long," not "answer is too long."

### Fix proposal (ranked, stage and measure)

**Stage 1 — three one-liners (~30 min total)**
- `minimax-client.ts:62` — lower `max_tokens` 16384 → 1024 (JSON schema fits in 350 tokens; 1024 leaves ~600 tokens for think budget)
- `src/app/api/evi/parse/route.ts` — add `export const preferredRegion = 'sin1'` (Singapore is closest free-tier region to China)
- `parse/route.ts` lines 99,117 — wrap `resolveVehicle` + `searchPlaces` in `Promise.all`

**Stage 2 — instrumentation (separate PR)**
- Add `performance.now()` markers around Minimax call
- Log `usage.completion_tokens` from response
- Wire to PostHog if key is set

**Stage 3 — only if Stage 1+2 insufficient**
- Switch to non-reasoning model (M2.7 → Text-01 or GPT-4o-mini for structured extraction)
- Add streaming (large refactor of state machine in `useEVi.ts`)
- Park as separate spec

### Failing test

- `src/lib/evi/minimax-client.test.ts` — assert `max_tokens` passed ≤ 1024
- `src/app/api/evi/parse/route.test.ts` — mock `resolveVehicle` + `searchPlaces`; assert both pending simultaneously (parallel)

### Risk / blast radius

Stage 1: Low.
- `max_tokens=1024` could truncate complex multi-stop trips. Mitigation: monitor `finish_reason: "length"` and revisit if seen.
- Region change is config-only; needs Vercel Pro to be honored (Hobby ignores `preferredRegion`).
- Parallelizing two independent reads is trivially safe.

Stage 2: zero risk (instrumentation only).

### Open question

Vercel plan tier — Hobby ignores `preferredRegion`; Pro honors it. Confirm before applying that change, otherwise it's a no-op.

---

## Recommended sequencing

```
P0 — Issue 1 (error banner) ──ship──> verify
                                       │
                                       ▼
P1 — Issue 3 Stage 1 (3 one-liners + parallelize) ──ship──> verify
                                                            │
                                                            ▼
                                          Stage 2 instrumentation ──> measure ──> decide on Stage 3
                                                                                      │
                                                                                      ▼
P3 — Issue 2 (email text body) — defer until P0 + P1 done
```

Each fix lands as its own commit per Karpathy "one change at a time." PR shape (single PR with all approved fixes vs. one PR per issue) is Duy's call.

---

## Decision points for Duy

1. Approve Issue 1 fix (error banner + decide on localStorage scope-creep)
2. Approve Issue 3 Stage 1 (3 one-liners) and confirm Vercel plan tier
3. Confirm Issue 2 deferral
4. PR format: one PR or three?

Once approved → start with failing tests (TDD per CLAUDE.md).
