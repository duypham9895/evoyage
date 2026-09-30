# eVoyage — Backlog Investigation & Remediation

**Date:** 2026-09-30 · **Base:** `a00e34e` (main, v0.9.0) · **Nothing pushed, nothing deployed.**

Companion document: [`2026-09-30-backlog-triage.md`](./2026-09-30-backlog-triage.md) — all 61
open findings with evidence, plus the refuted and already-fixed lists.

---

## 1. Where the backlog actually was

`gh issue list --state open` returns **zero issues**, yet `docs/agents/issue-tracker.md`
names GitHub as the tracker. Any agent following the repo's own instructions concludes
there is no work to do.

The real backlog is markdown: `EVOYAGE_AUDIT_PLAN.md` (§B gaps B1–B26, §C issues C1–C32,
§F roadmap), `QA-FINDINGS.md`, and `TODOS.md`. All three were written **2026-05-24 against
v0.8.0**. The repo is v0.9.0.

Two blockers were hit before any analysis was possible:

- **`node_modules` was absent.** The test suite could not run at all. `npm ci` first.
- **A false baseline.** `npx tsc --noEmit` with no `node_modules` reports *"No errors found"*.
  That is a false green, and it was initially recorded as the baseline. The true count is
  **5 errors in 3 files**, all pre-existing test-fixture type drift.

## 2. Method

10 read-only triage agents, one per backlog dimension, each re-checking its items against
live code rather than against the audit's claims. Every still-open finding then went to an
independent verifier prompted to **refute** it, defaulting to rejection under uncertainty.

**87 agents · 6.64M tokens · 1,517 tool calls · 41 min · 0 errors.**

| Outcome | Count |
|---|---:|
| Findings raised | 121 |
| **Confirmed open** | **61** |
| Already fixed since the audit | 53 |
| **Killed by the adversarial verifier** | **16** |

That last row is the justification for the whole approach. Acting on the stale audit
directly would have meant re-fixing 53 solved problems and acting on 16 findings that do
not survive scrutiny — while the genuinely broken things went untouched, because **none of
them were in the audit.**

### Severity of what is open

| | P0 | P1 | P2 | P3 |
|---|---:|---:|---:|---:|
| Confirmed open | 0 | 6 | 25 | 30 |

No P0. The daily-failing crawl was raised as P0; the verifier downgraded it to P1 —
the pipeline is dead and silent, but production still serves ~20k stations, nothing is
down, and there is no data loss or security exposure. That is data drift, not an outage.

## 3. Fixed this session

Four P1 correctness bugs, each written test-first, each reviewed cold by an independent
agent instructed to reject. **3 accepted, 0 rejected, 0 abandoned.**

### Trip planning was scoring every station wrong
`src/lib/routing/matrix-api.ts`

Mapbox is queried as `source;dest1;dest2?sources=0` and returns a row whose **first cell is
source→source** (always 0). The module returned that row whole, and the consumer indexed it
by candidate position — so candidate 0 always read 0 s detour and every later candidate read
its *predecessor's* drive time.

Executed against the real ranker with row `[0, 2700, 120, 600]`: the **farthest** station
(45 min away) was selected as best with a reported 0-minute detour, while the nearest
(2 min) was ranked worst. Fixed at the source with `.slice(1)`, so the call site needed no
change and a future second caller cannot re-inherit it.

### Charge times were wrong by 4× for small vehicles
`src/app/api/route/route.ts`

The handler read `'dcMaxChargingPowerKw' in vehicle` — but neither of the two places that
build `vehicle` ever copied that field, so the vehicle's DC charging cap was **permanently
`undefined`** and the ranker's cap logic was dead code.

A VinFast VF 3 (30 kW cap) at a 120 kW station was quoted **6.4 min instead of 25.7 min** —
and the trip plan therefore disagreed 4× with the nearby-stations panel, which reads the
same field correctly. Fixed by populating the field and deleting the `in` check that hid
the omission.

### Chargers under maintenance were offered as stops
`src/app/api/route/route.ts:80`

`EXCLUDED_STATION_STATUSES` listed `UNAVAILABLE` and `INACTIVE` but not `OUTOFSERVICE` —
which is a real written value: `parse-evpower.ts` maps Vietnamese *"bảo trì"* to it. Drivers
could be routed to a charger under maintenance. Added to the exclusion list, which drives
both the Prisma filter and the in-memory re-filter.

### The station crawl had been dead for ~70 days
`scripts/crawl-vinfast-stations.ts`

`Crawl Charging Stations` failed **every day since 2026-07-21** on a VinFast 403, and
because only that step lacked `continue-on-error`, all six downstream sources (EVPower, OSM,
OCM, manual CSV, crowdsourced promotion, README sync) were skipped with it.

The crawler carried a **private copy** of the fetch logic using `waitUntil: 'networkidle'`
with no retry. Its sibling `refresh-vinfast-cookies.ts` calls the identical endpoint from
the identical runner and returns 200 — because it waits for `domcontentloaded` plus a 2s
settle, letting the Cloudflare challenge resolve before fetching. The crawl log shows the
mechanism exactly: page "loaded" with an **empty title** 0.8s after navigation, then 403.

> This also refutes the obvious theory. It is **not** Cloudflare blocking GitHub runner IPs
> — the sibling script succeeds from the same runner, same UA, same webdriver spoof.

Fixed by **deletion**: the private copy is gone and the crawler now calls the already-tested
`src/lib/station/vinfast-browser-client.ts`, wrapped in 3-attempt backoff. Net **−65/+48**
lines. A persistent failure still exits non-zero — a 70-day outage must stay loud.

### Verification

| Check | Before | After |
|---|---|---|
| `npm test` | 1467 / 133 files | **1471 / 133 files, all pass** (+4 regression tests) |
| `npx tsc --noEmit` | 5 errors | **5 errors** (unchanged, all pre-existing test-fixture drift) |
| `npx next build` | passes | **passes** |
| `npx eslint src scripts` | 32 problems | **32 problems** (no new) |
| `npx playwright test` | could not run — browsers absent | **161 passed / 16 skipped / 0 failed, exit 0** across all 5 projects |
| locale parity | 7 pass | **7 pass** |

Each of the 4 new tests was **revert-verified individually** — reverting one fix fails
exactly its own test and no other. A test that passes either way proves nothing.

> **Environment note.** Playwright's browsers were missing locally, so E2E could not run at
> all until `npx playwright install chromium webkit firefox`. Combined with the absent
> `node_modules`, a fresh clone of this repo cannot verify itself until both are installed —
> worth adding to the README setup steps.

## 3b. What the regression gate caught — and what I changed because of it

The gate ran 6 verification checks plus a per-subsystem blast-radius review (11 agents).
Five checks passed at baseline. It returned **BLOCKED**, and the reason is worth recording
precisely: the only failing check was **E2E, because Playwright's browsers were not
installed on this machine** — `regression: false`. The agent reported that honestly as a
failed check rather than counting a non-runnable suite as a pass. Browsers were then
installed (chromium, webkit, firefox — matching what `deploy.yml` installs) and the suite
was run for real.

The blast-radius reviewers found three genuine problems that the test suite could not:

**Fixed — my `?? []` guard made failure silent.** In `matrix-api.ts` I had asked for a
guard against a missing matrix row. Returning `[]` meant a malformed Mapbox response
produced *every candidate scoring a 0-second detour* instead of throwing. Previously the
`undefined` threw, the caller's `catch` skipped that decision point, and planning fell back
safely. Now it throws explicitly (`no source row`) and that fallback is preserved. A
row that legitimately contains only the source cell still returns `[]`.

**Fixed — the crawler's retry was dead for its most likely failure.** The retry gated on
`isTransientVinfastUpstreamError`, which covers timeout/network/5xx/408/429 but returns
false for `cloudflare_blocked`. Since the shared client labels any challenge body
`cloudflare_blocked` regardless of HTTP status, the retry would never fire for a
Cloudflare-fronted 5xx or 429 — despite its own doc comment promising to retry them.
Switched to `isRecoverableVinfastBrowserAccessError`, matching the green-daily poll script.
That removes the last divergence between the two paths, which is the root-cause class of
this entire bug.

> **This creates a real coupling you need to know about.** That function exists only in
> your uncommitted working tree. `scripts/crawl-vinfast-stations.ts` now imports it, so
> **the WIP is load-bearing** — discarding it breaks the crawler's import. Commit the WIP
> together with this change, or tell me to revert the crawler to the narrower classifier.

**Reported, not fixed — a P1 regression inside your WIP.** Your working-tree change moves
the Cloudflare-marker check *ahead* of the status check in
`src/lib/station/vinfast-browser-client.ts:46`. That is deliberate and it has a test. But
it has an unintended consequence: a 429 or 503 whose body happens to carry a Cloudflare
interstitial is now classified `cloudflare_blocked` rather than `http_error`. And
`classifyVinfastCronError` treats transient `http_error` as a skippable outage (exit 0,
cron stays green) while `cloudflare_blocked` is not in that set — so the every-2-hours poll
cron flips from a graceful skip to a hard red on a Cloudflare-fronted upstream incident.

No test covers CF-markers-plus-5xx. I have not touched this: it is your in-flight design
decision, and the fix belongs in the classifier rather than in the ordering. The likely fix
is to have `classifyVinfastCronError` also treat `cloudflare_blocked` carrying a transient
status as skippable.

## 3c. A tooling hazard worth knowing

The `rtk` token-optimizer hook rewrites command output, and for two commands in this repo
it rewrote it **incorrectly**:

- `npx eslint src scripts` → rtk reported `Lint: 2 errors, 0 warnings`. The real output is
  `32 problems (14 errors, 18 warnings)`. A 7× undercount on errors.
- `git diff` → rtk emits a human summary, not a patch. `git diff > x.patch` produces a file
  `git apply` rejects as *"No valid patches in input"*.
- `npx playwright test --reporter=line` → rtk rewrote the reporter and reported
  `PASS (10) FAIL (164)` for what was actually a browser-install problem.

Use `rtk proxy "<command>"` whenever the exact output matters — verification, patches, or
anything you are about to make a decision on.

## 4. Agent infrastructure — it was inert

**All 9 files in `.claude/agents/` lacked YAML frontmatter.** Claude Code registers a
subagent only when the file opens with `---` / `name:` / `description:`. These opened with
`# QA Lead Agent`. None of them had ever loaded.

The same repo's *skills* all had correct frontmatter — so this was an isolated oversight,
not a misunderstanding.

Rebuilt to **12 agents**, all registering:

- **Leadership** — head-of-product, head-of-engineering, head-of-design
- **Build** — senior-frontend, senior-backend, **data-pipeline-engineer** *(new)*
- **Quality** — qa-lead, devsecops, **release-manager** *(new)*
- **Content** — content-writer, ux-researcher, **docs-keeper** *(new)*

Each new role maps to a measured backlog cluster that had no owner: the crawl/cron surface
(split between backend and devsecops, owned by neither), release and branch-protection
drift, and documentation drift — the single largest category.

Stale facts corrected while converting: test counts, 6→12 Prisma models, file sizes
(`TripSummary.tsx` documented as 543 lines, actually 1261 — over the agents' own 800-line
hard limit), and `src/components/__tests__/` which does not exist (tests are colocated).

Also fixed: `.claude/docs/agents.md` routed to **3 agents that exist nowhere**
(`map-reviewer`, `i18n-checker`, `ux-auditor`) and ~9 module paths deleted in a past
reorg. `.claude/skills/review/` had a good checklist but no `SKILL.md`, so it could never
register — added.

## 5. Workflows

Three reusable workflows in `.claude/workflows/`, invocable by name:

| Workflow | Shape |
|---|---|
| `issue-triage` | 10 dimensions fan out → adversarial verifier per finding |
| `fix-wave` | One isolated worktree per finding → cold reviewer per diff |
| `regression-gate` | Full verification sweep → per-subsystem blast-radius review |

## 6. What I deliberately did not do

**Repo settings — needs your decision.** Every `Deploy to Vercel` run sits at
`action_required`. They are all bot-authored PRs: branch protection (added to close audit
item C3) requires that check, but GitHub gates bot workflow runs behind manual approval, so
automation PRs **#48** and **#49** can never go green. They have been stuck since June, and
#48 carries the station count 19951 → 20023.

Unblocking means `gh api -X PUT .../actions/permissions/fork-pr-contributor-approval
-f approval_policy=all_collaborators`. That is an outward-facing permission change on a
public repo, so it is yours to make.

*Note the shape of this one: closing C3 created this deadlock. Fixing an issue broke a
working feature — exactly the failure mode to watch for.*

**Crawler retry breadth — coupled to your WIP.** The integrated crawler retries via
`isTransientVinfastUpstreamError` (timeout, network, 5xx, 408, 429) — **not** 403 or
`cloudflare_blocked`. The green-daily poll script uses the broader
`isRecoverableVinfastBrowserAccessError`, which covers both. Switching the crawler to it
would remove the last divergence between these two paths — but that function exists **only
in your uncommitted working tree**, so the change would couple the crawler to work that is
not committed yet.

**Nothing was committed, pushed, or deployed.** All changes are in the working tree as one
reviewable `git diff`.

---

## 7. Final state

Every gate check passes, each re-run after the post-gate corrections:

```
npm test                 1471 passed / 133 files
npx tsc --noEmit         5 errors (unchanged pre-existing baseline)
npx next build           passes
npx eslint src scripts   32 problems (unchanged baseline, no new)
npx playwright test      161 passed / 16 skipped / 0 failed — exit 0
locale-keys.test.ts      7 passed
```

The regression gate's `BLOCKED` verdict was driven solely by E2E being unrunnable locally,
which is now resolved. No check regressed against baseline; the test count rose by 4 and
nothing else moved.

The three fix worktrees (3.3 GB) were removed after their patches were applied and verified.

### Immediate next steps, in order

1. **Decide the two coupled VinFast questions** (§6): the CF-ordering regression in the WIP,
   and whether the crawler keeps the broader classifier. These gate committing the crawl fix.
2. **Verify the crawl fix against reality.** The local suite cannot prove it — `scripts/` is
   outside `vitest.config.ts`'s `src/**` include, which is why the bug survived. Run the
   workflow manually (`gh workflow run crawl-stations.yml`) and confirm a green run before
   trusting it.
3. **Unblock the automation PRs** (§6) so #48/#49 can merge and station data resumes syncing.
4. **Work the 61 open findings** from the triage report — 6 P1, 25 P2, 30 P3, each with
   evidence, a proposed fix, and a named regression risk. `fix-wave` takes them directly.

---

# Part 2 — Full backlog remediation wave

**9 batches, 18 agents, 0 errors.** Each batch owned a disjoint file set and ran against the
main working tree (not worktrees, which branch from `HEAD` and would have dropped the
uncommitted P1 fixes). Every batch was reviewed cold by an independent agent told to reject.

**7 accepted · 2 rejected · 0 abandoned.** Both rejections were then fixed by hand.

## Verified result

| Check | Session start | After Part 1 | **Now** |
|---|---|---|---|
| `npm test` | 1467 / 133 files | 1471 / 133 | **1606 / 140 files** |
| `npx eslint src scripts` | 32 problems (14 err) | 32 (14 err) | **19 problems (1 err)** |
| `npx tsc --noEmit` | 5 errors | 5 | **5** (unchanged baseline) |
| `npx next build` | passes | passes | **passes** |
| `npx playwright test` | could not run | 161 pass / 0 fail | **160 pass / 0 fail** |

**+139 tests and 7 new test files. 13 of 14 eslint errors eliminated.** The one remaining
error is `src/hooks/useRouteNarrative.ts:176`, deliberately left: the agent was told to do
the safe part and report the rest, and fixing it requires restructuring an async callback
that sets state twice before its first await.

## The two rejections — why they mattered

### D-middleware: the first fix left a live unauthenticated write vector

The accepted-looking fix widened the *matcher* to cover dotted admin paths. The reviewer
probed the deployed site and found the actual defect untouched: **the guard compared paths
case-sensitively.**

```
/api/admin/feedback/<id>   -> 401  (auth ran)
/API/ADMIN/FEEDBACK/<id>   -> 405  (handler module ran; auth never did)
```

Next resolves *dynamic* routes case-insensitively, so the uppercase form reaches
`src/app/api/admin/feedback/[id]/route.ts`. A `PATCH` there plausibly reaches
`prisma.feedback.update` **with no credentials**. This is strictly worse than the dotted
path it replaced: the dotted vector could not reach a real record because `Feedback.id` is
a cuid and contains no dot — the case vector needs no dot at all.

Fixed by lowercasing the pathname before the prefix comparison, plus 6 tests.
**Revert-verified: 5 of them fail without the fix.**

> **Open item — local and production disagree.** Against the local matcher harness,
> `/ADMIN/feedback/a.a` (uppercase *and* dotted) is correctly challenged. The reviewer
> probing the deployed site saw that same shape render the admin 404 shell, meaning
> middleware did not run there. Vercel's compiled edge matcher and the local harness do not
> behave identically. The dotless vector — every real record URL — is closed either way.
> **Re-verify the dotted uppercase form against production after deploy.**

### B-ci: a false rationale replaced with a different false rationale

The batch was asked to delete a stale comment claiming a private-repo Actions budget. It
deleted it and wrote a new one claiming the poll job's cadence is capped by cookie
lifetime from `refresh-vinfast-cookies.yml`. That dependency does not exist:
`scripts/poll-vinfast-station-status.ts` `main()` opens its own Chromium context, mints its
own cookies, calls `persistCookies()`, and only then polls — `pollStationStatus` reads back
*the row it just wrote*, and its `fetchLocators` is stubbed to the payload already in
memory. Verified directly before rewriting.

It had also baked eslint/tsc baseline counts into a permanent comment — numbers that were
already stale by the end of the same run. Both comments rewritten to state the mechanism
honestly and to cite the command that regenerates the counts rather than asserting them.

## What the batches changed

- **A-docs** — 10 files. Test counts, LLM provider (ADR-0010: OpenAI primary), 2 missing
  API routes and 11 missing directories in ARCHITECTURE.md, a `## [Unreleased]` CHANGELOG
  section with every bullet carrying its commit SHA, the Precautionary Stop glossary entry
  written from shipped code rather than the ADR, and `db:push` → `db:push:local` in the
  disaster-recovery runbook. It declined to bump `package.json` — correctly: a version bump
  is a release act, and doing it here would create fresh drift.
- **C-lint-tests** — 11 of 14 eslint errors, with zero assertions added, removed or altered.
- **E-route-api** — the P1 Mapbox→OSRM fallback (resilience was one-directional),
  `maxDuration = 60`, and the client's `response.json()`-before-`response.ok` bug that
  turned every 500 into a JSON parse error instead of a real message.
- **F-cron-maint** — prune failures now compose into the job's `ok` flag instead of being
  swallowed; pruning extended to ShortUrl / StationStatusReport / Feedback.
- **G-feedback-evi** — feedback no longer reports failure for a row that was saved; server
  Nominatim calls now have AbortController timeouts.
- **H-stations** — Zod bounds validation on `/api/stations`, and the first-ever tests for
  `src/lib/cron-auth.ts`, the shared gate protecting all three cron endpoints.
- **I-hooks** — `useIsMobile` cascading double-render fixed and proven by test;
  `MobileBottomSheet` ref-during-render fixed after writing 11 characterization tests
  against the *old* behaviour first.

## Retention windows need your confirmation

F-cron-maint extended the existing pruner to ShortUrl, StationStatusReport and Feedback and
chose conservative windows, but **these delete real user data and are a product decision,
not an engineering one.** Read its choices in the diff and confirm or change them before
this runs against production.

## Further problems the agents found but did not fix

- **Feedback image blobs are write-only.** The only `@vercel/blob` import is `put` in
  `feedback/upload/route.ts`; there is no `del` anywhere and the admin UI never touches
  `imageUrl`. At 5 MB/image this is the real unbounded-growth case.
- **`src/app/api/evi/parse/route.test.ts` hits the live network.** Tests passing
  `userLocation` with `startLocation: null` call the real `nominatim.openstreetmap.org` —
  only `searchPlaces` is mocked, the reverse-geocode fetch is not.
- `route.ts:733` still tells users to "switch to a different map provider", a control
  removed from the header in commit `171773d`.
- `plan/page.tsx` error strings are hardcoded English in a bilingual app.
- A root `VERSION` file says `0.5.1` while `package.json` says `0.9.0`.
