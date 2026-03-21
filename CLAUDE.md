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
- Bilingual: Vietnamese (vi) and English (en) via JSON locale files
- Vitest for unit + integration tests
- Playwright for E2E tests

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

- **452 tests** across **33 files**
- Covers: geocoding, feedback validation, URL building, locale sync, PWA manifest, haptics, display logic, routing, coordinates, station finding, eVi AI chat, speech recognition, suggestions client
- Runtime: ~4.5 seconds
- This count should only go UP — never delete tests unless the feature is removed

### Pre-Commit Checklist

Before every commit, verify:
- [ ] `npm test` passes (all 452+ tests green)
- [ ] `npx next build` succeeds (no TypeScript errors)
- [ ] New/changed code has corresponding tests
- [ ] No `console.log` left in production code
- [ ] Locale keys match between en.json and vi.json

## gstack — Development Workflow (Mandatory)

This project follows the gstack development process. Every feature, bug fix, and refactor MUST go through this workflow. No exceptions.

### Standard Workflow

```
Think → Plan → Build → Review → Test → Ship → Reflect
```

| Phase | What to do | gstack skill |
|-------|-----------|-------------|
| **Think** | Brainstorm the idea, challenge assumptions | `/office-hours` |
| **Plan** | Review architecture + design before coding | `/plan-eng-review`, `/plan-design-review` |
| **Build** | Implement with TDD, use `/investigate` for bugs | `/investigate`, `/freeze` |
| **Review** | Code review before merge — catches what tests miss | `/review` |
| **Test** | QA the running app as a real user (mobile + desktop) | `/qa` |
| **Ship** | Tests → changelog → version bump → PR | `/ship` |
| **Reflect** | Update docs, run retrospective | `/document-release`, `/retro` |

### When to use each skill

| Situation | Skill |
|-----------|-------|
| New feature idea | `/office-hours` first, then `/plan-eng-review` |
| Ready to code | `/freeze` to scope edits, then build |
| Found a bug | `/investigate` — root cause first, no guessing |
| Code done, ready for review | `/review` — two-pass: critical then informational |
| Want to test the running app | `/qa` — browser-based testing on mobile + desktop |
| Report bugs without fixing | `/qa-only` |
| Visual polish needed | `/design-review` — finds and fixes UI inconsistencies |
| Ready to deploy | `/ship` — automated tests, changelog, PR |
| After shipping | `/document-release` — sync all docs |
| End of week | `/retro` — commit analysis, trends |
| Working with production | `/careful` or `/guard` for safety |
| Want a second opinion | `/codex` — adversarial code review |

### Rules

1. **Never skip `/review` before merging.** Code review catches structural issues that tests don't — race conditions, SQL safety, LLM trust boundaries.
2. **Never skip `/qa` on UI changes.** Always test on mobile (393x852) AND desktop (1440x900). Most drivers use phones.
3. **Always run `npm test` before committing.** 452+ tests must pass. No exceptions.
4. **Use `/investigate` for bugs, not guessing.** Iron Law: no fixes without root cause investigation first.
5. **Use `/document-release` after shipping.** Keep README, CLAUDE.md, and test counts in sync.

### Troubleshooting

If gstack skills aren't working:
```bash
cd ~/.claude/skills/gstack && ./setup
# Then in Claude Code:
/reload-plugins
```
