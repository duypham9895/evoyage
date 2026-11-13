# Upstream-drift resilience: how the app absorbs a changed price, tariff or vocabulary

Date: 2026-11-13 · Code refs at `af06e4b` (origin/main) · Status: **plan, nothing implemented**

Companion to [the EVN outage RCA](../bugs/2026-11-12-p1-energy-crawl-evn-tariff-restructure.md).

> **What kind of document this is.** A plan: which mechanisms, in what order, and why.
> **Only Phase 1 is specified to the level a developer can implement from.** Every later phase
> needs its own change list and its own review when it is picked up; the "open points" under each
> mechanism are the known gaps, not an exhaustive list.
>
> **Review record.** Revision 3, after three rounds of two fresh Claude sessions each: 15
> blockers, 15, then 7. Round 1 overturned the diagnosis of the longest outage; round 2 found its
> cause already written down in this repository; round 3 confirmed Phase 1 is implementable as
> written and corrected six figures and one omission. See "Review log". Same vendor, same priors —
> no external verifier ran. **The round-3 corrections themselves have not been re-reviewed.**

## What this plan can and cannot deliver

**Can:** on the three energy-price sources, an upstream change of wording, shape, vocabulary or
document becomes a named, same-day review instead of an outage; and a sync PR that never reaches
`main` is named within three days instead of five months. Naming is all it does: issue #176 has
carried a daily failure comment since 2026-11-04 and that outage is still open.

**Cannot:** make the station pipelines safe (they hold more frozen upstream facts than the energy
pipeline — see the last section); see a plausible wrong number from the right document.

## What actually went wrong

| Incident | Upstream change | What failed on our side | Length |
|---|---|---|---|
| Fuel prices frozen | Petrolimex withdrew pure `RON 95-III` (it and `E10 RON 95-III` coexisted in the April feed) | **Publish path.** Sync PR #49 open 2026-06-02 → 11-01. Separately the parser threw `required product "ron95iii" missing` daily and the script swallowed it. | 153 days |
| Station count frozen | none | **Publish path.** Sync PR #48 open 2026-06-02 → 11-01; `station-stats.json` unchanged 2026-05-31 → 11-01. | 154 days |
| EVN tariff | 6 tiers → 5, new article, new wording, article id reused | Parser (frozen labels, count, URL, "tier 4"); and the publish path again — PR #175 open since 2026-11-04 | 9+ days, ongoing |
| Two station sources | evpower.vn bad certificate; Open Charge Map 403 (its API key secret was never set) | EVPower: the script exits 1 and `continue-on-error: true` hides it (G004). Open Charge Map: `scripts/fetch-universal-stations.ts:135-137` catches its own error and exits 0, so the step is green regardless (G005). Job green in both cases. | 35+ days, ongoing |
| Production deploys | none | **Publish path, after `main`.** A failed `vercel deploy` exited 0 behind a pipe; deployments errored while every run stayed green and production served the June build (`deploy.yml:190-195`). Fixed since. | 2026-06-06 → 09-30 |

Two different mistakes are in that table:

- **Frozen fact.** Code encodes an upstream's current wording, shape, identity or value as a
  constant.
- **Unwatched publish.** A correct value is computed and never reaches production, and nobody is
  told. **This caused the two longest outages, at the same time, in both pipelines.**

### Why PRs #48 and #49 sat for five months — known, and already fixed

Recorded in `docs/qa/2026-09-30-backlog-triage.md:55-57`, 32 days before it was fixed:

1. The sync workflows opened a PR and **never asked for it to be merged.** `gh pr merge` first
   appears in both workflows in commit `8ecf01d` (2026-11-01).
2. The required check `Deploy to Vercel` **never appeared** on those PRs. Of the 97 `deploy.yml`
   runs on `automation/energy-prices` while PR #49 was open, 73 ended `failure` with zero jobs
   (so no check run was created) and 20 ended `action_required`. The check was not green, it was
   absent. The repository's Actions approval policy is still `first_time_contributors` today.

So the cause was fixed on 2026-11-01. What is still missing is anything that **notices** when that
fix stops working — and it stopped working three days later: on 2026-11-04 a transient GraphQL
error skipped the auto-merge call and PR #175 has been open since.

## The outcomes, worst first

| Outcome | Example |
|---|---|
| **Silent wrong** — a plausible wrong number shown as current | the naive EVN fix: reseller prices published as household prices |
| **Silent stale** — an old number shown as current | fuel and station count, June–November |
| **Loud outage** — an old number, an alert nobody acted on | EVN, November |
| **Reviewed change** — the new number the same day, after one look | does not exist yet |

## Mechanisms

### M5 — Watch the publish, not the crawl *(Phase 1 — specified)*

A separate scheduled workflow, `data-freshness.yml`, that fails when any of these is true:

| Check | Threshold | Would have fired |
|---|---|---|
| an open PR whose head branch starts with `automation/` (later also `review/`) | older than 3 days | 2026-06-05 for #48 and #49; 2026-11-07 for #175 |
| `lastSyncedAt` in `src/data/energy-prices.json` on `main` | older than 3 days | 2026-06-04; 2026-11-06 |
| `lastUpdated` in `src/data/station-stats.json` on `main` | older than 3 days | 2026-06-03 |

The threshold is measured, not guessed: the 13 automation PRs among the 100 most recently
**created** merged PRs were each open 15 minutes at most, both data files commit daily when
healthy, and in six months of history every gap over 3 days was a real stall. Scheduled runs here
start 4.5–8 hours after their cron time, so the threshold cannot usefully go below about a day.

**M5 reads `main`, not the live site.** A merge that lands and is never deployed is invisible to it.

Implementation requirements:

- Pure functions in `src/lib/` for "is this PR too old" and "is this data too old", with unit
  tests; a thin script calls them. (Scripts that run `main()` on import cannot be imported by a
  test; `vitest.config.ts` only includes tests under `src/`.)
- A **top-level** `permissions:` block (column 0, two-space entries — the health test's regex
  does not see a job-level block) listing `contents: read`, `pull-requests: read`,
  `issues: write`. A workflow with an explicit block gets only what it lists.
- It must carry the standard failure-issue block: `scheduled-workflow-health.test.ts:13-15`
  auto-discovers every workflow with a `schedule:` trigger and asserts `issues: write`, the exact
  line `if: failure() && github.event_name == 'schedule'`, `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`
  and `gh issue list` / `comment` / `create`.
- **The alert text must state the cause** — e.g. "PR #175 `automation/energy-prices` open 9 days;
  energy prices last synced 10 days ago" — in both the created issue and each comment. Without
  it, M5 failing for its own reasons (a permissions mistake) is indistinguishable from M5
  reporting a real stall. The alert step reads the cause from what the check step wrote; if the
  check died before writing anything, the alert must say so explicitly ("the freshness check
  itself failed before it could report a cause") instead of posting an empty cause.
- If it ships before RCA Step 7 is done it is red on its first run (PR #175 and the stale energy
  data exist now) — correct. If Phase 0 lands first, as ordered, it is green on its first run —
  also correct.
- Any open PR from a branch named `automation/…` counts, including one a person opens by hand.
- A daily comment while a stall persists is the intended escalation. The way to silence it for a
  PR the owner has decided not to merge is to **close that PR**.

M5 is the backstop for RCA Step 6 (retry `gh pr merge --auto`; capture the URL from
`gh pr create`), which ships in Phase 0. Step 6 makes the stall less likely; M5 notices when it
happens anyway.

- **Enforced by:** the unit tests; the existing health test.

### M1 — Every upstream token is consumed by a named rule or reported *(Phase 3)*

- A parser returns what it did not recognise; it is printed in the run log and the PR body.
- A required role or tier that cannot be filled is a hard failure **naming what the feed did
  contain**. Raw titles are captured before any filter.
- No silent default on a required upstream field (`?? 0`, `?? ''`, "unknown → some status").
- **Ambiguity is a failure.** If a marker, a table label or a feed key occurs more than once, all
  occurrences must agree; otherwise the source fails. Never first-match, never last-write.
- Plausibility lower bounds: fuel ≥ 10,000 ₫/L, electricity ≥ 500 ₫/kWh (today both are `min: 0`,
  `plausibility.ts:32-33`).

Known instances in the energy pipeline:

| Where | Today |
|---|---|
| `parse-petrolimex.ts:69` and `:72` | two silent `continue`s. The second is firing now: `E10 RON 95-V` is in the feed, not in `TITLE_TO_KEY`, and `ron95v` left the data file on 2026-11-01 with no log. Nothing reads `ron95v`. |
| `parse-petrolimex.ts:74` | `products[key] = …` in a loop: a duplicated title is last-write-wins |
| `parse-vgreen.ts:23` | first match wins; the fixture has the price sentence twice (identical today) |
| `parse-evn.ts:45-53` | first match per tier label over the whole document — two residential tables on one article would publish the first |
| `crawl-energy-prices.ts:107-116,207-210` | the EVN decisions page is best-effort: on failure the run still succeeds and publishes a carried-over `effectiveAt` under a fresh `lastSyncedAt`. Removed by RCA Step 3. |

Fuel roles replace the hand-written alias at `parse-petrolimex.ts:80-87`. The JSON keys stay
`ron95iii` / `do005s`. Exact-title match only, order is the mechanism:

```
ron95iii ← ['RON 95-III', 'E10 RON 95-III']
do005s   ← ['DO 0,05S-II', 'DO 0.05S-II']
```

### M2 — Select a document by content and record which one was read *(Phase 0 anchor; Phase 2 record)*

RCA Step 3 selects the EVN article by a content anchor. Additionally record the selected article
URL and the matched heading string with the data.

Why prices and tiers cannot do this job: the reseller page has the same five tier labels, the
same boundaries and the same decision number as the household page; one of its six tables has a
tier-3 price 1.9% from the household one. Only the document distinguishes them.

Open points: the anchor's exact form and case-sensitivity must be stated once (a case-insensitive
match finds the heading twice on the real household page — title and table caption). The
Petrolimex source has the same weakness and no design here: three hardcoded CMS UUIDs
(`crawl-energy-prices.ts:34-42`) and a comment promising a fallback that no code implements.

### M3 + M4 — Structural changes go to a human; numbers keep flowing; freshness is per source *(Phase 2)*

One data file per source, one branch per source, three lanes per source. Supersedes RCA Step 5.

The lane rule is an **allow-list of what may change silently**: prices, `effectiveAt`, `syncedAt`.
A difference in anything else — tiers or their boundaries, product titles or labels, which title
filled a role, the recorded document — is REVIEW: its own `review/energy-<source>` branch, a PR
without auto-merge, body and label rewritten on every push. A source that cannot be parsed is
FAILED: its file is untouched and the run ends red. The comparison baseline is always `main`.

Why an allow-list and not "non-numeric → review": `effectiveAt` is non-numeric and changes on
every ordinary fuel adjustment (4 of 4 in the record, plus one day, 2026-05-03, where only its
milliseconds changed), while tier boundaries are numbers.

There is no change band: across all 29 committed versions of the data file the largest ordinary
move was +6.11%. On the fuel incident the headline gasoline price did not move at all
(24,150 on 2026-06-01 and on 2026-11-01; only its label changed) and diesel moved +9.37% over
five months; the EVN change moved the representative price −3.47%. No band wide enough to stay
quiet on +6.11% fires on either.

Expected behaviour on the record:

| Day | Lane |
|---|---|
| Petrolimex withdraws `RON 95-III`, successor already in the candidate list | REVIEW — role filled by a different title |
| …successor not in the list (the real 2026 case, before the alias existed) | FAILED, naming the titles seen — loud and specific, not one-click |
| EVN publishes Decision 2892 | REVIEW — tiers and document differ |
| EVN serves the reseller page at the old URL | FAILED — anchor rejects it; other sources publish |
| Ordinary weekly fuel adjustment | AUTO |

Open points, each a blocker for this phase's own spec:

- **The README is a shared file.** `scripts/update-readme-stats.ts` regenerates one energy block
  containing all three sources, so per-source branches still conflict there. Decide where the
  README is regenerated before splitting the data.
- The workflow YAML for three branches and two PR kinds is not designed. It must still satisfy
  `scheduled-workflow-health.test.ts` and `deploy-quality-gates.test.ts`.
- When a source returns to AUTO, its open `review/` PR must be closed automatically.
- `EnergyPricesSnapshot` must gain per-source `syncedAt` (the freshness wording in S3 needs it), so
  every typed literal of it changes: five in `trip-cost.test.ts` (lines 7, 228, 248, 268, 282) and
  the four snapshot-shaped objects in `index.test.ts` (opening at lines 43, 63, 81, 101).
- **M5 must be updated in the same PR.** Its second check reads `lastSyncedAt` from
  `src/data/energy-prices.json`; after the split that file is gone, and a single global timestamp
  would stay fresh while one source is dead. M5 must check each source's own `syncedAt`.
- One `zod` schema per source file, created in this phase together with the writer; TypeScript
  types derived from it. `scripts/` is outside `tsc`, so a schema/writer mismatch would otherwise
  compile green.

### M6 — A hidden failure is worse than a failure *(after decision D2)*

`crawl-stations.yml` has five `continue-on-error: true` steps (lines 58, 62, 66, 72, 76). Two are
known dead; three are unaudited.

- Keep `continue-on-error` (removing it would skip the later steps and stop the working station
  sync). Give each step an `id`; add one roll-up step after the PR step that fails the job if any
  `steps.<id>.outcome == 'failure'` and names which. This is valid Actions semantics: `outcome`
  stays `failure` when `continue-on-error` turns `conclusion` to `success`.
- A step that needs a secret checks for it first.
- `scripts/warm-station-pois.ts` counts failures and never turns the count into an exit code (F007).
- **The roll-up only sees a step whose script exits non-zero.** `fetch-universal-stations.ts`
  catches its own error and exits 0, so the roll-up is blind to it; today's Open Charge Map
  failure would be caught only by the secret check above. Auditing the exit behaviour of the
  three unaudited scripts (`seed-osm-stations.ts`, `seed-manual-stations.ts`,
  `promote-crowdsourced-stations.ts`) is therefore a **precondition** of the roll-up.
- The roll-up runs under the default `if: success()`, so on a day the PR step itself fails it
  does not print which tolerated step died. The job is red either way.

Open points: whether `failure() || cancelled()` catches a `timeout-minutes` kill is unverified in
this repository, and changing the condition requires rewriting the exact-string assertion at
`scheduled-workflow-health.test.ts:51` in the same PR.

## Supporting rules

- **S1 — fixtures are permanent and uniquely named.** A capture date or the upstream's document
  number in every name. `capture-fixtures.ts` writes a new dated path with `flag: 'wx'` and exits
  non-zero on failure (today its `safe()` wrapper swallows errors). The EVN part ships in Phase 0.
- **S2 — facts nobody can crawl are labelled manual, with a review date** (`value`, `source`,
  `verifiedAt`, `reviewBy`), and M5 fails when a `reviewBy` passes. Known: `freeForVinFastUntil =
  2029-12-31`, re-stamped daily as if crawled (`crawl-energy-prices.ts:47`); pinned LLM model ids
  (`llm-providers.ts:18,25`); undated vehicle list prices (`vietnam-models.ts:22`); the holiday
  table ending 2030 (`vietnam-holidays.ts:58`); "34 Vietnamese provinces & cities" (`README.md:12`).
- **S3 — user-visible text does not restate an upstream fact as a literal.** `trip_cost_note`,
  `trip_cost_hero_percent_free`, `trip_cost_electric_free_line` (both locales);
  `station-stats.ts:55-58` → `README.md:16-19`; `README.md:13`. Labels and the year become
  parameters (double-brace syntax); the tier is removed from the note, per RCA Step 4. **Freshness
  wording is computed at render time** — older than 3 days reads "prices as of <date>" instead of
  "Auto-updated daily". This is the only protection that works when no scheduled job runs.
  Enforced by a guard test over `trip_cost_*` values; run against today's locale files it matches
  exactly those three keys.

## Order of work

| Phase | What | Why here |
|---|---|---|
| 0 | RCA Steps 0-4, 6 and 7 | restores prices; Step 6 is the auto-merge retry |
| 1 | **M5** | covers the failure happening today; no data-shape change |
| 2 | M3 + M4, M2's record, schemas | the adaptive mechanism |
| 3 | M1 | closes the parser-side silent paths |
| 4 | S2, then S3 | S3 reads the year from where S2 puts it |
| 5 | M6, starting with removing the EVPower and Open Charge Map steps (D2 = A) | after the script exit-behaviour audit |

## Decision D2 (owner: Duy) — the two dead station sources

> **Decided 2026-11-13 — Duy chose option A: remove both steps now; re-add each when it works.**
> M6 is unblocked. Its remaining precondition is the exit-behaviour audit of the three unaudited
> scripts.

With the roll-up on, `crawl-stations` would be red every day until EVPower and Open Charge Map
are repaired or removed.

| Option | Gain | Lose | Risk |
|---|---|---|---|
| A: remove both steps now; re-add each when it works | the roll-up ships at once and exposes the three unaudited steps | their rows stop refreshing (already true for 35+ days) | those rows age silently unless pruned |
| B: repair first (get an Open Charge Map key; handle evpower.vn's certificate) | keeps non-VinFast diversity | M6 waits on work outside the repository | evpower.vn may not be repairable from our side |

## What this does not prevent

- A wrong but well-formed number from the right document.
- A change of meaning with no change of shape (e.g. watts → kW in `vinfast-client.ts:148`).
- **A merge that lands on `main` and never reaches production.** M5 reads `main`, not the live
  site. `deploy.yml` is the only thing watching the deploy, and its smoke test probes
  `/api/health` and `/api/vehicles`, not the data values. This failed silently from 2026-06-06 to
  2026-09-30. Nothing in the repository compares a deployed value with `main`.
- A review PR that is never clicked. M5 names it after three days; it does not click.
- M5 itself not running — GitHub disables scheduled workflows after 60 days without repository
  activity. Only S3's render-time freshness wording covers that.
- Until M1 ships: two residential tables on the right EVN article, or a duplicated product title,
  resolved silently by first-match / last-write.

## Outside this plan — the station pipelines

Found during review; not designed for here. Each needs M1 applied and its own inventory.

| Where | Frozen fact |
|---|---|
| `src/lib/vinfast/vinfast-client.ts:100-150` and a second copy in `scripts/enrich-vinfast-detail.ts:95-131` | `?? 0` / `?? ''` on upstream fields: a field rename becomes zero or empty for every VinFast station, with no error |
| `src/lib/vinfast/vinfast-client.ts:81` | unknown connector standard passes through into the UI |
| `scripts/fetch-universal-stations.ts:57,63`, `scripts/seed-osm-stations.ts:70` | same defaults on Open Charge Map and OSM fields |
| `src/lib/stations/parse-osm.ts:65,78` | `capacity` read as kW by one function and port count by its caller (G010); invented `22` kW default |
| `src/lib/stations/parse-evpower.ts:83-89` | unrecognised status → `UNAVAILABLE` (G035) |
| `src/app/api/route/route.ts:81`; `src/lib/geo/map-utils.ts:26-32`; `StationInfoChips.tsx:10` | status vocabulary copied in several places; `OUTOFSERVICE` missing from two (G008, G027 — both disputed in the audit) |

## Not verified

- Nothing here is prototyped. The lane table is reasoned from code, fixtures, git history and run logs.
- The date Petrolimex withdrew `RON 95-III`: after 2026-06-01, no later than 2026-09-09.
- Whether the Actions approval policy `first_time_contributors` still prevents `Deploy to Vercel`
  from running on automation PRs now that they are pushed with `AUTOMATION_PAT`. PR #175 does show
  that check as passed, which suggests it no longer does.
- The three unaudited `continue-on-error` steps.
- Line numbers under "Outside this plan" come from the reviewers' reading and were not re-checked
  by the author.

## Review log

| Round | Finding | Change |
|---|---|---|
| 1 | The 5-month fuel freeze was a stalled publish, not the parser | M5 added, moved to Phase 1 |
| 1 | A shape signature could not tell household from reseller tariff | signature dropped; M2 record |
| 1 | Change bands fired on no ordinary day and on neither incident | bands dropped; lower bounds |
| 1 | "Strictest lane" and a reused branch rebuilt the coupling and let held-back changes auto-merge | per-source branches; baseline always `main` |
| 1 | Removing `continue-on-error` would stop the working station sync; five instances, not two | M6 keeps it, adds a roll-up; D2 |
| 1 | V-GREEN first-match; role matching unspecified | M1 ambiguity rule; exact ordered roles |
| 2 | The stall's cause was already recorded in the repo; a second, parallel 154-day outage (PR #48) was missing; "checks green" was wrong — the required check was absent | incident table and cause section rewritten |
| 2 | "Non-numeric → review" would put Petrolimex in review weekly and let a tier-boundary change through | lane rule inverted to an allow-list |
| 2 | Per-source files do not give independence while the README is one shared block; no workflow design; snapshot type must change | listed as open points of Phase 2 |
| 2 | Two residential tables on one article, or a duplicated feed key, pass silently | M1 ambiguity rule widened to labels and keys |
| 2 | M5 would alarm daily on a review PR whose cause had gone; M5's own failure looks like a real alert | auto-close on return to AUTO; cause in alert text; permissions listed |
| 2 | Heading count, `unrecognised` as a lane input and a separate schema phase bought nothing | dropped / folded into Phase 2 |
| 2 | A rename to an unlisted title is FAILED, not REVIEW | lane table split into two rows |
| 2 | The document was written as a spec and reviewed as one, with gaps in every later phase | reframed as a plan; only Phase 1 specified |
| 3 | **Phase 1 is implementable as written**: a workflow drafted to its requirements passed every assertion of the health test; all five "would have fired" dates and the threshold measurement reproduced | — |
| 3 | "Does not prevent" omitted a merge that never deploys — a recorded 117-day outage | added to the incident table and to "does not prevent"; the Can-claim narrowed to "reaches `main`" |
| 3 | Open Charge Map's failure is hidden by its own script exiting 0, not by `continue-on-error`; the roll-up cannot see that class | incident table and M6 corrected; script audit made a precondition |
| 3 | Wrong figures: "19 of 30" (a truncated window), "six weeks" (32 days), "−2.0%" (unsourced; the headline did not move), "two days" of ms-only change (one), 1 of 5 typed literals cited | each replaced with the measured value |
| 3 | M5's check would lose its subject when the data file is split | added as a Phase 2 open point |

**The round-3 fixes above have not been reviewed.** The review budget (three rounds) is spent.
