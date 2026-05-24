# Retro — 2026-05-24 audit-fixup cycle

> 5 phases, 1 single working session, 16 commits, 46 new tests, 6 prod findings, 2 self-corrections.

## What happened

eVoyage had accumulated three weeks of Trust Intelligence Roadmap work after v0.8.0 (Phases 1-5 + ADRs 0006/0007 + MiMo/Whisper migrations) without a release. The PM asked for a top-to-bottom audit, plan, then execution.

Cycle ran:

| Phase | Output | Time |
|---|---|---|
| **0 — Discovery** | 4 parallel agents → `EVOYAGE_AUDIT_PLAN.md` (1586 lines, 111 QA cases, 32 findings) | ~12 min |
| **1 — P0 fixes** | 5 commits: branch protection, transcribe rate-limit, doc refresh, RECOVERY/cron-setup, `.env.example` | |
| **2 — Hygiene** | 4 commits: Cluster A (Node 22 + Dependabot + concurrency + `db:push:local`), Cluster B (cookie-refresh resilience + poll-status noise suppression), Cluster C (retention prunes + ShortUrl expiry), Cluster D (telemetry holes). Cluster E was no-op (DESIGN.md violations all pre-fixed) | |
| **3 — Features** | 3 commits: ADR-0003/4/5 status audit (all NOT SHIPPED), admin panel (Basic Auth + status PATCH), CSP nonce, Vercel Blob image uploads | |
| **4 — QA** | 1 fix commit (CSP smoke caught 2 bugs) + `docs/qa/2026-05-24-phase4-qa-report.md` | |
| **5 — Ship** | This commit + tag v0.9.0 | |

## What the audit got right

1. **Parallel discovery was the right call.** 4 agents working concurrently — codebase, GitHub Actions, Supabase/Prisma, doc/spec history — produced a more complete picture in 12 minutes than a single sequential pass would have in 45. The codebase + intent-recovery agents in particular caught complementary issues (one looked at code, one at docs, both flagged "ADR-0004 not shipped" via different evidence).
2. **Atomic per-cluster commits.** Each commit reverts cleanly; each maps to a numbered item in the plan. Code review (if it ever happens) is bounded.
3. **111 test cases gave the QA pass structure.** Walking it module-by-module surfaced 6 findings that wouldn't have come up otherwise.

## What the audit got wrong

Three findings I'd reclassify with hindsight:

### Self-correction 1 — C19 (poll-status `JSON.parse` no try/catch)
**Audit claim:** P3, `poll-status.ts:91` is unguarded.
**Reality:** Lines 90-100 already have the try/catch. The audit agent missed it.
**Lesson:** Audit agents have read windows; verify code-level findings against the actual file before scoping a fix.

### Self-correction 2 — F3 (FEEDBACK_EMAIL_FROM missing in prod, marked P2)
**Audit claim:** Resend rejects sends without FROM; feedback notifications aren't being delivered.
**Reality:** `email.ts:207` falls back to `eVoyage Feedback <onboarding@resend.dev>` (a working Resend sandbox sender). Feedback emails ARE being delivered.
**Lesson:** When an env var seems missing in prod, grep the code for its read site and check for a `??` fallback before assuming a functional gap.

### Self-correction 3 — D.10 entire cluster
**Audit claim:** 5 DESIGN.md violations to fix (emoji, footer URL, hero alt, hydration mismatch).
**Reality:** All 5 had been fixed in commits between the QA-FINDINGS snapshot (2026-05-01) and the audit (2026-05-24). Cluster was a complete no-op.
**Lesson:** Audit-doc dates matter. When the source-of-truth findings doc is N weeks old, factor in churn — don't assume the world hasn't moved.

## What broke that automated tests didn't catch

This is the single most important takeaway from Phase 4. **Unit tests passing 1304/1304 is not the same as "the app works."**

Two real production-blocking bugs in the CSP middleware made it through 9 colocated middleware tests + 7 PATCH-route tests + every other vitest case:

1. **`node:crypto` import was Edge-incompatible.** The middleware imported `timingSafeEqual` from `node:crypto` at the top of the file. Vitest's Node-environment harness loaded it fine — all 9 middleware tests went green. Production middleware runs on Edge Runtime, which has no `node:crypto`. Every request to `/admin/*` would have crashed with `TypeError: Native module not found`.
2. **Static `/plan` rendering meant the middleware nonce never reached the page's HTML.** Next.js statically generates routes that don't read request headers. Middleware ran, set the nonce, set the CSP header — but the served HTML was pre-built without nonces on its `<script>` tags. CSP's `strict-dynamic` then blocked all 14 framework chunks. The page rendered the server shell (header, sidebar shell) but the client-side map and form were dead.

Both caught in 30 seconds of local browser smoke via the chrome-devtools MCP tools. Fix shipped in commit `14abbf8` (Edge-compatible XOR compare + `await headers()` in root layout to force dynamic rendering).

**Process change for next cycle:** add a "QA bottleneck" gate after every middleware/CSP/auth/SSR change. The vitest+Playwright suites are necessary but not sufficient. A 60-second browser smoke against `npx next start` would have caught both bugs at write time instead of after a Phase 3 deploy.

## What we learned about the operating environment

The audit surfaced 4 env-side gaps the deployed app was ready for but the Vercel project wasn't:

- **F1 [P0]** — `UPSTASH_REDIS_REST_URL/_TOKEN` not set → in-memory rate-limit fallback in prod → every public endpoint uncapped against scripted abuse. Phase 1 transcribe rate-limit and Phase 3 upload rate-limit are both effectively no-ops today until this is wired.
- **F2 [P3]** — Stale `GOOGLE_MAPS_API_KEY` from v0.2.0 removal. **Fixed in Phase 5.**
- **F4 [P3]** — Stale `SCRAPER_API_KEY` from old crawler iteration. **Fixed in Phase 5.**
- **F5 [P3 a11y]** — `<html lang>` doesn't update on locale toggle. Backlog.

The pattern: code-side audit catches code issues; env-side gaps need a separate `vercel env list` review. Next time, build env audit into the discovery phase explicitly.

## What we deferred and why

**ADR-0003 / 0004 / 0005 execution.** All three NOT SHIPPED. The PM-call was to defer execution to a dedicated milestone post-Phase 4 QA so the current 646-line `/api/route/route.ts` behavior is regression-locked by tests before any refactor. ADR-0004 is the largest single change in the codebase and would touch a file with no colocated test today.

**Sequencing for that future milestone** (from the status docs): ADR-0005 (EviTripExtractor) first — lowest-risk, proves the deepened-Module pattern. Then ADR-0003 (VinFastDetail). Then ADR-0004 (TripPlanner) — highest-risk, last.

**Phase 5 D.11 stretch goal — tests for 5 high-value untested files.** Started but not finished within this session. Backlog candidates: `vinfast-client.ts` (275 LOC, no test), `api/feedback/route.ts` (route-level integration tests beyond the schema tests already in place), `api/short-url/route.ts`. Skipping `api/route/route.ts` until ADR-0004 milestone.

## Operating-mode observations

A few mechanical things worth keeping for next cycle:

- **`vercel env add NAME preview` requires an empty-string positional for the git-branch arg.** Took 6 attempts to discover. The CLI's `--yes` flag doesn't bypass the prompt; you need `vercel env add NAME preview "" --value <v> --yes`.
- **`vercel blob create-store --yes` does the linking AND env-var-write in one go** if you set `--access` upfront. Without `--yes`, the linking prompt is interactive and times out in non-TTY contexts.
- **Vercel marketplace integrations require browser-based terms acceptance.** Cannot be automated end-to-end from CLI — `vercel integration add upstash/upstash-kv` returns an `action_required` JSON with the URL the user has to click.
- **Next 16's terse `Errors: N / Warnings: N` build-summary format under-reports the real source.** Use `npx tsc --noEmit` for the real TS picture; `next build` returns 0 even when it shows "Errors: 1" (turned out to be the Edge-runtime `node:crypto` import — surfaced only at runtime, not at build).
- **GHA `concurrency: { group: deploy-prod, cancel-in-progress: false }` collapses the queue.** When 3 push events land in the same window, the middle one gets cancelled, not queued. End state: in-flight run + latest pending. Fine for prod deploys (latest commit captures the linear history) but worth knowing when CI feels "missing" runs.

## Stat block

- **Plan size:** 1 doc, 1586 lines, 6 sections, 111 test cases, 32 findings
- **Execution:** 16 commits, 46 new tests (1258 → 1304), 0 regressions
- **Code surface added:** ~1,900 LOC across `src/middleware.ts`, `src/app/admin/feedback/**`, `src/app/api/admin/feedback/[id]/route.ts`, `src/app/api/feedback/upload/route.ts`, `src/components/feedback/FeedbackImageUpload.tsx`, `src/lib/maintenance/prune-stale-caches.ts`, `scripts/db-push-local.ts`, `.github/dependabot.yml`
- **Deploys triggered:** 5 (1 Phase 1, 1 Phase 2, 2 Phase 3, 1 Phase 5 — plus 1 cancelled by concurrency-group queue collapse, 1 in flight as of this writing for the v0.9.0 tag)
- **Manual ops on Vercel:** ADMIN_TOKEN added (3 envs), Vercel Blob store created + linked (1 env-var set across 3 envs), 3 stale env vars removed, Upstash flagged (blocked on browser-based terms acceptance)
- **Time:** ~3 hours from initial discovery prompt to v0.9.0 tag (excluding manual env-side work)

## What I'd ask the PM to do differently next time

1. **Run the env audit upfront.** Send me `vercel env list` output at the start of discovery. F1 (Upstash absent in prod) would have been the first P0 we addressed, not the last.
2. **Decide the ADR-0003/4/5 fate at discovery time.** Carrying three "decision only" ADRs through Phase 1-3 added cognitive load. If they're not going to ship in this cycle, mark them `superseded` or `decision-only` in the front-matter of each ADR file at start.
3. **The QA report finding-classification needs cross-checking.** I marked 2 findings (C19, F3) as bugs that were actually false positives. A 60-second code-grep before opening a finding would save us from documenting work that doesn't exist.

## What I'd keep doing

1. **Parallel discovery agents.** Cheap, fast, more complete than sequential.
2. **Atomic per-cluster commits.** Phase 1 = 5 commits, Phase 2 = 4, Phase 3 = 3. Each commit has 1 reason to revert.
3. **Browser smoke after CSP/middleware/SSR changes.** Saved the v0.9.0 cycle.
4. **Surface findings as I find them.** Don't batch up env-side surprises into a final "by the way" — call them out the moment they show up.
