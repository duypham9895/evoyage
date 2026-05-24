# Option C — Execution Prompt for a Fresh Conversation

**Purpose:** Paste the prompt below verbatim into a new Claude Code conversation in this repo. It hands off implementation of Option C (precautionary extra charging stops) with full context, decision discipline, and clear stopping points.

**Authored:** 2026-05-24 by Duy (PM) + Claude (synthesizer)

---

## The prompt (copy from here ↓)

```
# Task: Execute Option C — Precautionary Extra Charging Stops (Issues #24–28)

You're picking up implementation of a feature that has been thoroughly designed and decomposed. All context lives in the repo and on GitHub — read it first, code second.

## What you're building

Precautionary extra charging stops for eVoyage trip planning. Detect high-risk legs (Tết, peak hour, sparse stations, tight margin, low arrival battery) and inject one optional top-up stop between required stops. Users can dismiss in one tap. Behind `PRECAUTIONARY_STOPS_ENABLED` env flag for staged rollout (default `false`).

Full design and rationale:
- **PRD:** https://github.com/duypham9895/evoyage/issues/23 — problem, solution, user stories, locale keys
- **ADR-0009:** docs/adr/0009-precautionary-extra-stops.md — codified architecture, 5 locked decisions, magic numbers, implementation outline
- **CONTEXT.md** — domain vocabulary (Stop, Station, Alternative, Backup Pressure Score, Range Safety Factor)
- **5 sub-issues in dependency order:**
  - #24 — Slice 1/5: MVP (pure modules + pipeline + minimal timeline rendering) — AFK, no blockers
  - #25 — Slice 2/5: dismiss state machine + why-explanation — AFK, blocked by #24
  - #26 — Slice 3/5: map pin treatment — AFK, blocked by #25
  - #27 — Slice 4/5: saved trip persistence (D4) — HITL (schema review), blocked by #25
  - #28 — Slice 5/5: telemetry + E2E + rollout — AFK, blocked by #25, #26, #27

## The 5 locked decisions (D1–D5 from ADR-0009)

Do NOT relitigate these in code. If you think one of them is wrong, stop and ask before deviating.

- **D1**: Precautionary stops carry normal nMax 1–3 alternatives. Dismiss control sits **outside** the alternatives picker, not inside it.
- **D2**: Injection threshold scales with `RangeSafetyFactor`. SF ≤0.70 → threshold 5; 0.71–0.80 → 4; 0.81–1.00 → 3. Step function, not linear.
- **D3**: Top-up target is vehicle-aware. ≥80 kWh → 60%; 60–79 → 65%; 40–59 → 70%; <40 → 75%. Step function.
- **D4**: Dismissals persist per `(tripId, stationId)`. Recompute fresh on reload. Additive `dismissedPrecautionaryStops Json?` column on the saved-trip Prisma model.
- **D5**: Precautionary stop suppresses ADR-0006's N=0 "no backup, charge to ≥90%" banner on the same leg.

## How to work

1. **Read first, code second.** Read ADR-0009 in full + Issue #23's body + Issue #24's acceptance criteria. After reading, state a 1-paragraph plan for Slice 1 (modules to create, types to touch, tests to write first). Wait for my approval before writing code.

2. **Use these skills** (per the project's CLAUDE.md skill priority):
   - `karpathy-guidelines` — for every code change. Minimum code, surgical changes, no speculative abstractions.
   - `tdd` (Matt Pocock) — write tests FIRST, then implementation. Red-green-refactor.
   - `grill-with-docs` (Matt) — before designing any module, verify against CONTEXT.md vocabulary.

3. **Pick up issues in dependency order.** Start with #24. After it merges, #25 unblocks. After #25 merges, #26 and #27 run in parallel. #28 waits for all three.

4. **Per-issue workflow:**
   - Create a feature branch: `feat/option-c-slice-N-short-description`
   - Read the issue's "What to build" + acceptance criteria carefully
   - Each pure module gets its own colocated `.test.ts` file
   - Verify EVERY acceptance criterion checkbox before opening a PR
   - `npm test` and `npx next build` must pass (pre-commit rule from CLAUDE.md is non-negotiable)
   - Conventional commit messages matching the repo style (run `git log --oneline -10` to see)
   - Open a PR titled "Option C Slice N/5: …" with body referencing the issue ("Closes #N")
   - After merge, post a summary comment on PRD #23 with LOC delta + test count delta + any deviations

5. **Stop after each slice merges.** Don't auto-start the next slice. Ask the user, then proceed.

## Constraints

- **No new dependencies** unless absolutely required. Check existing `node_modules` first.
- **No schema changes outside Slice 4.** Slices 1–3 and 5 must use additive optional type flags only.
- **Feature flag default `false` is mandatory.** Slice 1 must produce byte-identical API response on `main` when `PRECAUTIONARY_STOPS_ENABLED` is unset. CI test enforces this.
- **No emoji in UI strings, no decorative icons** — per DESIGN.md and CLAUDE.md's "Less Icons, More Humanity" rule.
- **Vietnamese is the primary locale.** Write VN first, then translate to EN.
- **Test coverage is non-negotiable.** The CLAUDE.md "Pre-Commit Checklist" applies to every commit.
- **Don't touch files outside scope.** Surgical changes only. If you notice unrelated issues, mention them — don't fix them.
- **Don't force-push, don't skip hooks, don't bypass signing.** Conventional git discipline.

## Success criteria (definition of done)

- All 5 issues closed via merged PRs.
- Test count: 1237 → ~1307 unit, 19 → 20 E2E.
- `PRECAUTIONARY_STOPS_ENABLED=true` injects up to 2 precautionary stops on high-pressure Tết trips.
- Telemetry events (`extra_stop_suggested`/`accepted`/`dismissed`/`undone`) fire with full property set.
- Production rollout doc at `docs/operations/precautionary-stops-rollout.md` lays out the 10% → 100% schedule with dismissal-rate guardrail.
- No regressions to existing trip-planning behavior when flag is off.

## What to do RIGHT NOW

1. Run `gh issue view 24 --comments` and `gh issue view 23` to read the spec.
2. Read `docs/adr/0009-precautionary-extra-stops.md` in full.
3. Read `CONTEXT.md` for domain vocabulary.
4. Skim `src/lib/routing/backup-pressure.ts`, `src/lib/routing/apply-backup-pressure.ts`, `src/lib/routing/route-planner.ts`, `src/lib/routing/station-ranker.ts` — these are the modules you'll integrate with.
5. State your 1-paragraph plan for Slice 1: which 4 modules you'll create, what types you'll touch, what tests you'll write first, what the feature-branch name will be.
6. Wait for my approval before writing any code.

Start now.
```

(copy to here ↑)

---

## Why this prompt is structured the way it is

- **Reads-first ordering.** The prompt forces a "state your plan, wait for approval" gate before code. Even though the design is locked, the implementation has degrees of freedom that benefit from a sanity check (branch name, module file boundaries, which test runs first).
- **The 5 locked decisions are repeated.** Even though they're in the ADR, repeating D1–D5 in the prompt is cheap insurance against Claude misremembering after a long read-then-code arc.
- **Skill priority is explicit.** The project's CLAUDE.md lists `karpathy-guidelines`, Matt Pocock's `tdd`, and `grill-with-docs` as canonical. The prompt names them so Claude doesn't fall back to generic patterns.
- **Stop-after-each-slice is hardcoded.** This protects against runaway autonomous execution. The user (Duy) retains control between slices.
- **Constraints are surgical.** The "no emoji, no decorative icons, Vietnamese-primary" rules come from DESIGN.md + CLAUDE.md and would be missed by a fresh Claude session without the reminder.
- **The "right now" steps are concrete.** Vague openings ("get started!") produce vague work. Specific commands (`gh issue view 24 --comments`) produce specific work.

## Tradeoffs and what to change if needed

- If you want **fully autonomous execution** (no stop-and-confirm between slices), delete bullet 5 under "How to work" and add to "What to do RIGHT NOW": "After you finish Slice 1, immediately proceed to Slice 2 without asking. Continue through Slice 5."
- If you want **a single-slice-only run** (e.g., just Slice 1 for now), replace "Issues #24–28" in the title with "Issue #24" and delete references to slices 2–5.
- If you want to **target a specific session length** (e.g., "spend at most 3 hours total"), add to "Constraints": "Time budget: stop after 3 hours of work regardless of slice progress and report status."

## Related artifacts

- PRD: https://github.com/duypham9895/evoyage/issues/23
- ADR-0009: [docs/adr/0009-precautionary-extra-stops.md](../adr/0009-precautionary-extra-stops.md)
- Slice issues: [#24](https://github.com/duypham9895/evoyage/issues/24) · [#25](https://github.com/duypham9895/evoyage/issues/25) · [#26](https://github.com/duypham9895/evoyage/issues/26) · [#27](https://github.com/duypham9895/evoyage/issues/27) · [#28](https://github.com/duypham9895/evoyage/issues/28)
