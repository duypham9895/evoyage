# eVoyage — Pre-Landing Review Checklist

Extends the global gstack review checklist with eVoyage-specific checks.

## Pass 1 (CRITICAL)

### SQL & Data Safety
- Prisma queries with user-supplied `where` clauses — verify no injection via string interpolation
- Station data writes — verify `scrapedAt` is always set

### API Input Validation
- All API routes (`/api/*`) must use Zod schema validation on request body
- Rate limiting must be applied to all public endpoints (`checkRateLimit`)
- VinFast API proxy endpoints must not expose internal error details to clients

### LLM Output Trust Boundary
- MiniMax M2.7 responses must be validated with Zod before use
- `<think>` tags must be stripped from AI responses before parsing
- Never trust AI-generated JSON structure without schema validation
- Suggestion text must be length-limited (max 40 chars) before rendering

### SSE Streaming Safety
- SSE endpoints (`vinfast-detail`) must handle abort signals
- SSE readers must handle partial chunks (buffer until `\n\n`)
- Client-side SSE consumers must have timeout and retry limits

## Pass 2 (INFORMATIONAL)

### Locale Consistency
- Every user-visible string must use `t('key')` from locale files
- No hardcoded Vietnamese or English strings in components
- New locale keys must exist in BOTH `en.json` and `vi.json`

### Mobile-First UX
- Touch targets must be at least 44x44px (`min-h-[44px] min-w-[44px]`)
- Expandable sections must not use `overflow-hidden` with fixed `max-h` without scroll
- Truncated text must have `title` attribute for hover access
- Disabled buttons must have `title` explaining why they're disabled
- Autocomplete dropdowns must be accessible on mobile (not clipped by parent containers)

### Component Patterns
- `'use client'` directive required for components using hooks
- No `localStorage` reads during SSR render (causes hydration mismatch)
- Error boundaries around components that fetch external APIs
- `useCallback` for event handlers passed as props
- Immutable state updates only (no mutation)

### Test Coverage
- New API endpoints need integration tests
- New hooks need unit tests
- New components need at least a render test
- Bug fixes need regression tests

## DO NOT flag

- Tailwind CSS class ordering
- Import ordering within a file
- Single-letter loop variables in clear contexts (`i`, `j`)
- Type assertions on well-typed external library returns
- `as Parameters<typeof t>[0]` casts for locale keys (known pattern)
