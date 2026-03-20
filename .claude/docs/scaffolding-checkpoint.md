# Scaffolding Checkpoint

Before creating new code artifacts, run through these checks. The goal is to prevent unnecessary complexity.

## Before Adding an npm Dependency

1. Is there a built-in browser/Node API that does this? (e.g., `fetch`, `crypto.randomUUID`, `structuredClone`)
2. Does an existing dependency already cover this? Check `package.json`.
3. What is the bundle size? Check on bundlephobia.com. Flag anything >50KB gzipped.
4. Is there a lighter alternative? (e.g., `date-fns` instead of `moment`, `clsx` instead of `classnames`)
5. Is it actively maintained? Check last publish date and open issues.

## Before Creating a New API Route

1. Can this be done entirely client-side? (Geocoding, simple calculations, localStorage operations)
2. Does an existing route already handle this? Check `src/app/api/` — there are currently 7 route directories: `cron`, `feedback`, `route`, `share-card`, `short-url`, `stations`, `vehicles`.
3. Can an existing route be extended with a query parameter instead?
4. Have you defined: Zod validation schema, rate limit, error handling, coordinate validation (if geo)?

## Before Creating a New Component

1. Does a similar component already exist? Check `src/components/` (24 component files currently).
2. Can an existing component accept a new prop instead of creating a new one?
3. Will the parent component still be under 600 lines after this addition?
4. Does this component need to work on mobile? Check `useIsMobile` hook usage pattern.

## Before Adding a New Database Model

1. Can existing models accommodate this with a new field? (Check `prisma/schema.prisma`)
2. Will this model be queried frequently? Plan indexes upfront.
3. Does the new model need a Vercel-compatible binary target? (`rhel-openssl-3.0.x` is already configured)
4. Is there a migration path for existing data?

## Before Adding a New Map Feature

1. Does it work with Leaflet/OSM (the default provider)?
2. Does it compile with MapboxMap (fallback provider)?
3. Does it compile with GoogleMap (hidden but must not break)?
4. Is the feature abstracted in `src/lib/map-utils.ts` or does it need provider-specific code in each renderer?

## Before Adding a New Locale Key

1. Is there an existing key that covers this meaning? Search both `vi.json` and `en.json`.
2. Does the key follow `snake_case` naming convention?
3. Have you added the key to BOTH locale files?
4. If the key uses interpolation `{{param}}`, are the params identical in both files?

## Before Adding a New Hook

1. Check existing hooks: `useUrlState.ts` (URL sync), `useIsMobile.ts` (breakpoint detection).
2. Is this state truly global, or can it be local component state?
3. If it's shareable state, should it go through `useUrlState` instead?
4. If it's a preference, should it use localStorage directly?
