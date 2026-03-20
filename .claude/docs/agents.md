# eVoyage Agent Routing

Project-specific agent routing that complements global agents at `~/.claude/agents/`.

## Agent-to-File Mapping

### map-reviewer (`.claude/agents/map-reviewer.md`)
Route these files:
- `src/components/Map.tsx`, `src/components/MapboxMap.tsx`, `src/components/GoogleMap.tsx`
- `src/lib/osrm.ts`, `src/lib/mapbox-directions.ts`, `src/lib/google-directions.ts`
- `src/lib/polyline.ts`, `src/lib/polyline-simplify.ts`
- `src/lib/map-utils.ts`, `src/lib/static-map.ts`
- `src/lib/matrix-api.ts`, `src/lib/elevation.ts`
- `src/lib/nominatim.ts` (geocoding)

### i18n-checker (`.claude/agents/i18n-checker.md`)
Route these files:
- `src/locales/vi.json`, `src/locales/en.json`
- `src/lib/locale.tsx` (LocaleProvider, `t()`, `tBi()`)
- Any component adding new user-facing strings

### ux-auditor (`.claude/agents/ux-auditor.md`)
Route these files:
- All `src/components/**/*.tsx`
- `src/components/landing/LandingClient.tsx`, `src/components/landing/LandingPageContent.tsx`
- Any file adding icons, emoji, or visual elements

## Routing Rules

1. **Single file changed** — route to the most specific agent.
2. **Multiple files across domains** — run matching agents in parallel.
3. **Route planner changes** (`src/lib/route-planner.ts`, `station-ranker.ts`, `station-finder.ts`, `range-calculator.ts`) — use global `code-reviewer` agent; these are pure algorithms, not map rendering.
4. **API route changes** — use `.claude/skills/api-review/SKILL.md` skill (not an agent).
5. **Database changes** — use global `code-reviewer` agent with extra attention to migration safety.

## Combining with Global Agents

- After any code change: global `code-reviewer` + relevant project agent(s) in parallel
- For new features: global `planner` first, then global `tdd-guide`, then project agents for review
- For bugs in map code: global `debugger` + `map-reviewer` in parallel
