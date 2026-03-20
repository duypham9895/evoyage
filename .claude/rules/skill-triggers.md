# Skill Auto-Invoke Triggers

When files matching these patterns are modified, automatically run the corresponding skill.

## i18n Validation
- **Trigger**: any file in `src/locales/*.json` is created or modified
- **Skill**: `.claude/skills/i18n-validation/SKILL.md`
- **Action**: compare vi.json and en.json keys, report mismatches

## Map Testing
- **Trigger**: any of these files are modified:
  - `src/components/Map.tsx`
  - `src/components/MapboxMap.tsx`
  - `src/components/GoogleMap.tsx`
  - `src/lib/osrm.ts`
  - `src/lib/mapbox-directions.ts`
  - `src/lib/google-directions.ts`
  - `src/lib/polyline.ts`
  - `src/lib/polyline-simplify.ts`
  - `src/lib/map-utils.ts`
  - `src/lib/static-map.ts`
- **Skill**: `.claude/skills/map-testing/SKILL.md`
- **Action**: verify cross-provider compatibility

## API Review
- **Trigger**: any file in `src/app/api/**` is created or modified
- **Skill**: `.claude/skills/api-review/SKILL.md`
- **Action**: check validation, rate limiting, error handling, fallbacks

## Component Size Check
- **Trigger**: any `.tsx` file in `src/components/` is modified
- **Action**: check file line count. Flag if >600 lines. Block additions if >800 lines without extraction.
- **Current files near limit**:
  - `ShareButton.tsx` (574 lines)
  - `FeedbackModal.tsx` (572 lines)
  - `TripSummary.tsx` (543 lines)

## Route Algorithm Tests
- **Trigger**: any of these files are modified:
  - `src/lib/route-planner.ts`
  - `src/lib/station-ranker.ts`
  - `src/lib/station-finder.ts`
  - `src/lib/range-calculator.ts`
- **Action**: run `npx vitest run src/lib/route-planner.test.ts src/lib/station-finder.test.ts src/lib/range-calculator.test.ts`

## Database Schema Safety
- **Trigger**: `prisma/schema.prisma` is modified
- **Action**:
  1. Run `npx prisma validate` to check syntax
  2. Check for destructive changes (dropping columns, removing models)
  3. Verify indexes on coordinate fields, foreign keys, and frequently queried fields
  4. Confirm `binaryTargets` includes `["native", "rhel-openssl-3.0.x"]` (required for Vercel)
