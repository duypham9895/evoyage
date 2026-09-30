# eVoyage Agent Team

Twelve role-based agents plus three workflows. Agents carry judgement and standards;
workflows carry deterministic control flow (fan-out, verification, review gates).
Use an agent when you need a perspective. Use a workflow when you need a process
that must not be improvised.

## Why this file changed

Until 2026-09-30, the nine files in `.claude/agents/` had no YAML frontmatter, so
Claude Code never registered any of them — they were prose nobody could invoke.
Each now opens with `name` / `description` / `tools`, and their stale facts have
been corrected against the live repo.

## Roster

### Leadership
| Agent | Owns | Invoke when |
|---|---|---|
| `head-of-product` | Prioritization, scope, PRDs | Deciding what to build next, or whether to cut |
| `head-of-engineering` | Architecture, tech debt, file-size limits | Before a refactor, schema change, or new dependency |
| `head-of-design` | Design system, DESIGN.md compliance | Before any visual work; to audit for violations |

### Build
| Agent | Owns | Invoke when |
|---|---|---|
| `senior-frontend` | `src/components`, `src/hooks`, pages | Component work, state bugs, responsive layout |
| `senior-backend` | `src/app/api`, Prisma, external APIs | Route work, queries, integrations, caching |
| `data-pipeline-engineer` | `scripts/`, cron routes, VinFast ingestion | A crawl or sync job fails; station data looks stale |

### Quality
| Agent | Owns | Invoke when |
|---|---|---|
| `qa-lead` | Test strategy, regression detection | After any implementation, before any commit |
| `devsecops` | Security posture, CSP, rate limits, deploy | New endpoints, auth changes, pre-deploy |
| `release-manager` | Version, CHANGELOG, branch protection, release gate | Cutting a release; deploy path is broken |

### Content & Research
| Agent | Owns | Invoke when |
|---|---|---|
| `content-writer` | Bilingual copy, locale keys | Any user-visible string changes |
| `ux-researcher` | Feedback analysis, heuristics, a11y | Validating a design call; diagnosing low engagement |
| `docs-keeper` | README, ARCHITECTURE, CHANGELOG, ADRs, RECOVERY | After a feature ships; when a doc contradicts code |

The three newest roles exist because real backlog clusters had no owner:
`data-pipeline-engineer` (the crawl/cron surface, split between backend and devsecops),
`release-manager` (version, changelog, and branch-protection drift), and
`docs-keeper` (documentation drift — the single largest backlog category).

## Workflows

| Workflow | Shape | Run it |
|---|---|---|
| `issue-triage` | 10 dimensions fan out, each finding adversarially verified | Quarterly, or whenever the backlog's age is unknown |
| `fix-wave` | One isolated worktree per finding, then a cold reviewer per diff | After triage, on the confirmed findings |
| `regression-gate` | Full verification sweep + per-subsystem blast-radius review | Before every commit, merge, or deploy |

```
Workflow({name: 'issue-triage'})
Workflow({name: 'fix-wave', args: [ ...confirmed findings... ]})
Workflow({name: 'regression-gate'})
```

## Where the backlog actually lives

`docs/agents/issue-tracker.md` says GitHub issues. As of 2026-09-30 there are **zero
open GitHub issues**, while `EVOYAGE_AUDIT_PLAN.md` holds roughly sixty tracked items.
An agent that trusts the tracker doc alone concludes there is no work to do.

Read `EVOYAGE_AUDIT_PLAN.md` (sections B, C, F), `QA-FINDINGS.md`, and `TODOS.md` —
**and treat all three as stale until verified.** They were written 2026-05-24 against
v0.8.0. The repo is v0.9.0. Most of their items are already fixed; the live problems
are mostly ones they never recorded.

## The rule that matters most

Verify before you fix. The audit doc claims 106 TypeScript errors; the real count is 0.
Acting on a stale list re-breaks things that were already repaired.

## Baseline (measured 2026-09-30 @ `a00e34e`)

```
npm test               1467 tests / 133 files, all pass
npx tsc --noEmit       5 errors (pre-existing test-fixture drift)
npx next build         passes
npx eslint src scripts 32 problems (14 errors, 18 warnings)
```

Run `npm ci` first on a fresh clone — `node_modules` is not committed, and a missing
install looks exactly like a broken test suite.
