# /qa — Full QA Checklist

Run a comprehensive quality assurance check on the eVoyage codebase.

## Steps (execute in order)

### 1. Test Suite
```bash
npx vitest run
```
Report: total tests, passed, failed, skipped.

### 2. TypeScript Type Check
```bash
npx tsc --noEmit
```
Report: pass/fail, list any type errors.

### 3. Locale Sync
- Read `src/locales/vi.json` and `src/locales/en.json`
- Compare key counts and list any mismatches
- Check interpolation param consistency (`{{param}}` in both files)
- Report: vi key count, en key count, missing keys in each direction

### 4. Secret Scan
- Search codebase for patterns: API keys, tokens, passwords, connection strings
- Patterns to check: `sk_`, `pk_`, `AKIA`, `ghp_`, `Bearer `, hardcoded URLs with credentials
- Exclude: `.env.example`, `*.md` documentation references
- Report: pass/fail, list any findings

### 5. Component File Sizes
- Check line counts of all `src/components/**/*.tsx` files
- Flag files exceeding 600 lines (warning) or 800 lines (critical)
- Current watchlist: ShareButton.tsx (574), FeedbackModal.tsx (572), TripSummary.tsx (543)
- Report: table of files >400 lines with line counts

### 6. Accessibility Basics
- Search for interactive elements without ARIA attributes:
  - `<button` without `aria-label` (when no visible text child)
  - `<input` without `aria-label` or associated `<label>`
  - `role="button"` without keyboard handler
- Report: list of components with potential a11y issues

### 7. API Rate Limiting Verification
- Check each route in `src/app/api/` for rate limiting imports
- Expected: route (10/min), vehicles (30/min), stations (30/min), feedback (3/min), short-url (3/min), share-card (3/min)
- Cron routes should use `cron-auth.ts` instead
- Report: table of routes with their rate limit status

### 8. Console.log Check
- Search for `console.log` in `src/` (excluding test files and `*.test.*`)
- `console.error` and `console.warn` are acceptable
- Report: list of files with console.log statements

## Output Format

```
eVoyage QA Report
==================

1. Tests: {passed}/{total} passed ({skipped} skipped)
2. TypeScript: {PASS/FAIL}
3. Locale sync: vi={N} keys, en={N} keys — {PASS/issues}
4. Secret scan: {PASS/FAIL}
5. Component sizes: {N files flagged}
6. Accessibility: {N issues found}
7. Rate limiting: {N}/{total} routes covered
8. Console.log: {N occurrences}

Overall: {PASS / N issues to address}
```
