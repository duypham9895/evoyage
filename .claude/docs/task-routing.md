# Task-to-Model Routing

Choose the right model tier for each eVoyage task to optimize cost and quality.

## Haiku (fast, cheap — 90% of Sonnet capability)

Best for tasks that follow established patterns:
- Adding/editing locale keys in `vi.json` and `en.json`
- Simple text or copy changes in components
- Tailwind CSS tweaks and styling adjustments
- Adding a new field to an existing Zod schema
- Writing a straightforward unit test that follows existing test patterns
- Updating constants in `src/types/index.ts`
- Adding a new vehicle to the hardcoded fallback list
- Fixing lint errors or TypeScript type errors
- Documentation updates

## Sonnet (primary coding model)

Best for standard development work:
- New component creation (following existing patterns)
- API route implementation (Zod + rate limit + fallback pattern)
- React hook creation or modification
- Writing integration tests
- Prisma schema changes and migration scripts
- Refactoring large components (e.g., extracting from TripSummary, FeedbackModal, ShareButton)
- Bug fixes requiring multi-file changes
- State management changes (useUrlState, Context, localStorage)
- VinFast API integration changes
- Landing page updates

## Opus (deep reasoning)

Reserve for architecturally significant work:
- Route planner algorithm changes (`src/lib/route-planner.ts` — 390 lines of battery simulation)
- Station ranking formula redesign (`src/lib/station-ranker.ts`)
- Multi-provider map architecture changes (must work across 3 renderers)
- eVi AI assistant integration (Minimax, new architecture)
- Multi-waypoint trip planning (new algorithm design)
- Isochrone visualization design (EV range circles on map)
- Database schema redesign (migration strategy for production data)
- Performance optimization of the corridor search algorithm
- Security architecture changes (CSP, rate limiting strategy)
- Cross-cutting refactors that touch route planning + rendering + state

## Decision Heuristic

1. Does the task require understanding the route planning algorithm end-to-end? → Opus
2. Does it involve creating/modifying multiple interacting components? → Sonnet
3. Is it a single-file edit following an obvious pattern? → Haiku
4. When in doubt, start with Sonnet. Escalate to Opus if the task proves architecturally complex.
