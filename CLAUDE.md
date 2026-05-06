# eVoyage — Project Instructions

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## UI/UX Design Philosophy

### Less Icons, More Humanity

This app should feel warm and human, not like a robotic SaaS dashboard.

**Rules:**
- **No decorative icons** — Don't add icons just to fill space or "look professional." If removing an icon doesn't hurt comprehension, remove it.
- **Text over icons** — Prefer clear, well-written text labels over icon + label combos. Words are more human than pictograms.
- **Functional icons only** — Icons are allowed when they serve a clear interaction purpose: navigation arrows, close buttons, status indicators, map markers. If the user needs the icon to understand what to do, keep it.
- **No icon grids** — Avoid the pattern of "icon in a circle + title + description" repeated 6 times. Use typography, spacing, and color to create visual hierarchy instead.
- **No emoji in UI** — Don't use emoji in tabs, navigation, avatars, or interactive elements. Emoji are only acceptable in user-facing content text (chat messages, descriptions) where they add meaning.
- **Transparency section uses text, not icons** — The "Built with AI" section should feel honest and personal, not decorated.

**Why:** Icons at scale create visual noise and make everything look the same. The app's personality comes from its words, layout, and the care put into micro-interactions — not from a grid of SVG shapes.

**How to apply:** Before adding any icon, ask: "Would this section work with just text and good typography?" If yes, skip the icon.

## Transparency

eVoyage is built entirely by Claude Code (Anthropic's AI coding agent). Duy Phạm's role is Product Manager — defining features, making design decisions, and ensuring quality. This transparency is a core value of the project and should be reflected honestly in the UI.

## Writing Style (Vietnamese)

When writing Vietnamese copy, refer to the creator as "Duy" (not "Mình" or "Tôi"). Use third-person voice for transparency and professionalism.

## Tech Stack

- Next.js (App Router), TypeScript, Tailwind CSS
- Mapbox + OpenStreetMap for maps
- VinFast API for charging station data (SSE streaming for real-time detail)
- MiniMax M2.7 AI for eVi trip assistant (via OpenAI-compatible API)
- Prisma + Supabase Postgres (region `ap-southeast-1`), deployed on Vercel
- Bilingual: Vietnamese (vi) and English (en) via JSON locale files
- Vitest for unit + integration tests
- Playwright for E2E tests

## Operations

- **Disaster recovery:** If the production DB is paused, deleted, or corrupted, follow [docs/RECOVERY.md](./docs/RECOVERY.md). Schema lives in `prisma/schema.prisma`; reference data lives in `scripts/seed-*.ts` and `scripts/crawl-vinfast-stations.ts`. Never edit the schema in the Supabase UI.

## Agent skills

### Skill priority — Matt Pocock first

When multiple installed skills match the same trigger, **prefer Matt Pocock's skill**. Specifically:

| Intent | Use this | Not these |
|---|---|---|
| Test-driven development | `tdd` (Matt) | `superpowers:test-driven-development`, `everything-claude-code:tdd`, `everything-claude-code:tdd-workflow` |
| Debugging a hard bug or perf regression | `diagnose` (Matt) | `superpowers:systematic-debugging` |
| Interviewing user before any creative work | `grill-me` (Matt) for non-code, `grill-with-docs` (Matt) for code | `superpowers:brainstorming` |
| Breaking a plan into issues | `to-issues` (Matt) | (no real overlap) |
| Turning conversation into a PRD | `to-prd` (Matt) | (no real overlap) |
| Triaging incoming issues | `triage` (Matt) | (no real overlap) |
| Architectural review / refactoring | `improve-codebase-architecture` (Matt) | (no real overlap) |
| Reading code in broader system context | `zoom-out` (Matt) | (no real overlap) |

**Exceptions** — don't replace these with Matt's lighter equivalents:

- `gsd-debug` — when the bug investigation needs to survive context resets (multi-session debugging). Matt's `diagnose` is a single-shot loop; gsd's persists state.
- `gsd-discuss-phase` / `gsd-plan-phase` / etc. — full GSD project-management workflow. Matt's `grill-me` is one interview; gsd is a full phase lifecycle.

For everything else not listed above (e.g. `gsd-*`, `everything-claude-code:*` patterns/refs, `claude-md-management:*`), use the existing skill — they don't conflict with Matt's set.

### Issue tracker

GitHub issues at [duypham9895/evoyage](https://github.com/duypham9895/evoyage) via the `gh` CLI. See [docs/agents/issue-tracker.md](./docs/agents/issue-tracker.md).

### Triage labels

Canonical 5-role vocabulary, no overrides: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See [docs/agents/triage-labels.md](./docs/agents/triage-labels.md).

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at repo root. See [docs/agents/domain.md](./docs/agents/domain.md).

## Coding Behavior — Karpathy Guidelines (Mandatory)

Apply [.claude/skills/karpathy-guidelines/SKILL.md](./.claude/skills/karpathy-guidelines/SKILL.md) on every code change. Invoke the `karpathy-guidelines` skill before writing, reviewing, or refactoring code.

The four rules in one line each:

1. **Think Before Coding** — State assumptions, surface ambiguities, present tradeoffs, push back on bad approaches. Don't pick silently.
2. **Simplicity First** — Minimum code that solves the asked problem. No speculative features, abstractions, configurability, or error handling for impossible cases. If 200 lines could be 50, rewrite.
3. **Surgical Changes** — Touch only what the user asked for. Don't reformat, refactor, or "improve" adjacent code. Match existing style. Mention unrelated dead code; don't delete it.
4. **Goal-Driven Execution** — Translate vague asks into verifiable outcomes ("Add validation" → "Write tests for invalid inputs, then make them pass"). State a mini-plan with verification checks for multi-step work.

Tradeoff: these guidelines bias toward caution over speed. For trivial tasks (typo fixes, locale tweaks, one-line config), use judgment.

## Testing — Mandatory Rules

### When to Run Tests

Run `npm test` (vitest) **BEFORE every commit**. This is non-negotiable. If tests fail, fix them before committing.

Trigger conditions — run tests when ANY of these happen:
1. **New feature** — Write new tests FIRST (TDD), then implement
2. **Bug fix** — Write a failing test that reproduces the bug, then fix it
3. **Change request** — Update existing tests to match new behavior, then implement
4. **Refactoring** — Run tests before AND after to ensure no regressions
5. **Dependency update** — Run full suite to catch breaking changes
6. **Locale changes** — The `locale-keys.test.ts` catches missing/mismatched keys automatically

### What to Test

| Change Type | Required Tests |
|-------------|---------------|
| New utility function | Unit test with edge cases in colocated `.test.ts` file |
| New component | Component test for rendering + interaction |
| New API endpoint | Integration test for happy path + error cases |
| New locale key | Automatic — `locale-keys.test.ts` catches mismatches |
| Bug fix | Regression test that would have caught the bug |
| UI behavior change | Update existing tests to match new behavior |
| New validation/schema | Zod schema test with valid, invalid, and edge cases |

### Test File Convention

```
src/lib/foo.ts          → src/lib/foo.test.ts          (colocated)
src/lib/bar/baz.ts      → src/lib/bar/baz.test.ts      (colocated)
src/components/X.tsx    → src/components/X.test.tsx     (colocated)
cross-cutting concerns  → src/lib/__tests__/name.test.ts (shared)
```

### Test Quality Standards

- Every test must have a clear description explaining WHAT it verifies
- Test edge cases: empty inputs, null/undefined, max length, special characters
- Test error paths: network failures, invalid data, permission denied
- Never test implementation details — test behavior and outputs
- Mocks must be restored after each test (`vi.restoreAllMocks()`)
- No hardcoded timeouts in tests — use `vi.useFakeTimers()` when needed

### Current Test Suite (baseline)

- **1197 unit/integration tests** across **103 files** (vitest, ~12 seconds)
- **18 E2E tests** across **10 spec files** (Playwright, ~43 seconds on Desktop Chrome)
- Unit/integration covers: geocoding, feedback validation, URL building, locale sync, PWA manifest, haptics, display logic, routing, coordinates, station finding, nearby stations API, eVi AI chat, eVi station search, speech engines (Web Speech + Whisper), suggestions client, transcription API, MapLocateButton, smart markers, mini-card popups, station event emitter, DesktopTabBar, energy-price parsers (Petrolimex / V-GREEN / EVN), trip-cost calculator, HomeEnergyPrices block, eVi LLM module (provider chain, fallback, telemetry — see ADR-0002)
- E2E covers: trip planning, eVi chat, nearby stations, bottom sheet, desktop tabs, vehicle selection, sharing, bilingual toggle, feedback FAB, URL state
- These counts should only go UP — never delete tests unless the feature is removed

### Pre-Commit Checklist

Before every commit, verify:
- [ ] `npm test` passes (all 1197+ tests green)
- [ ] `npx next build` succeeds (no TypeScript errors)
- [ ] New/changed code has corresponding tests
- [ ] No `console.log` left in production code
- [ ] Locale keys match between en.json and vi.json
