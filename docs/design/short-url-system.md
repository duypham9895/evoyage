# Short URL System for Trip Sharing

**Author:** Senior Software Engineer
**Date:** 2026-03-19
**Status:** Draft
**Affects:** `ShareButton.tsx`, `useUrlState.ts`, `prisma/schema.prisma`, new API routes

---

## 1. Problem Statement

### 1.1 Current State

The ShareButton component (`src/components/ShareButton.tsx`) only shares trips as PNG images. While visually appealing, the recipient cannot interact with the trip -- they cannot modify the route, vehicle, or battery settings.

The `useUrlState` hook (`src/hooks/useUrlState.ts`) already syncs all trip parameters to URL search params (`start`, `end`, `slat`, `slng`, `elat`, `elng`, `wp`, `loop`, `vid`, `cv`, `bat`, `min`, `rsf`). This means the full trip state is already representable as a URL.

### 1.2 The Long URL Problem

A typical trip URL with two waypoints and a custom vehicle:

```
https://evoyage.app/plan?start=H%C3%A0%20N%E1%BB%99i&end=%C4%90%C3%A0%20N%E1%BA%B5ng
&slat=21.028511&slng=105.804817&elat=16.047079&elng=108.206230
&wp=[{"n":"Ninh B%C3%ACnh","lat":20.2506,"lng":105.9745},{"n":"Vinh","lat":18.6796,"lng":105.6813}]
&cv={"brand":"VinFast","model":"VF8","batteryCapacityKwh":87.7,"officialRangeKm":420,"chargingTimeDC_10to80_min":31}
&bat=90&min=10&rsf=0.75
```

This URL is 400-600+ characters. Consequences:

- **SMS/MMS**: Silently truncated at 160-320 chars by carriers
- **Zalo/Facebook Messenger**: URL preview generation fails on overly long URLs
- **Twitter/X**: Counts against character limit, often wraps incorrectly
- **QR codes**: Long URLs produce dense QR codes that are hard to scan
- **Copy-paste**: Users frequently copy partial URLs, losing trip state

### 1.3 Goal

Provide a short, shareable URL (e.g., `https://evoyage.app/s/Xk9mQ2`) that reliably restores the full trip state. The ShareButton should offer both the existing PNG share and a new link-sharing flow.

---

## 2. Database Model

### 2.1 Prisma Schema Addition

```prisma
model ShortUrl {
  id        String    @id @default(cuid())
  code      String    @unique          // 7-char nanoid, e.g., "Xk9mQ2p"
  params    String                     // Full URL search params string (not JSON)
  createdAt DateTime  @default(now())
  expiresAt DateTime?                  // Optional expiration
  accessCount Int     @default(0)      // Analytics: how many times resolved

  @@index([code])
  @@index([createdAt])
  @@index([expiresAt])
}
```

### 2.2 Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Store format | Raw URL search params string | Directly reconstructable as `?{params}`. No JSON parse needed. Matches existing `buildSearchParams` output exactly. |
| Code length | 7 characters | 62^7 = 3.5 trillion combinations. At 1000 URLs/day, collision probability stays negligible for decades. |
| Code alphabet | `[A-Za-z0-9]` (base62) | URL-safe without encoding. No ambiguous chars needed at 7-char length. |
| Expiration | Optional, default null (no expiry) | Shared trip links should remain valid indefinitely. Expiration available for future cleanup policies. |
| Deduplication | None (by design) | Same trip params can produce multiple short codes. Dedup would require indexing the full params string (expensive) and provides minimal benefit. |

### 2.3 Storage Estimate

Assuming 500 short URLs created per day:
- Each row: ~300 bytes (code + params + timestamps)
- Per year: ~55 MB
- Well within free-tier PostgreSQL limits on Supabase/Neon

---

## 3. API Design

### 3.1 POST /api/short-url -- Create Short URL

**Request:**
```typescript
// Body
{
  params: string  // URL search params string, e.g., "start=H%C3%A0+N%E1%BB%99i&end=..."
}
```

**Response (201):**
```typescript
{
  code: string    // "Xk9mQ2p"
  url: string     // "https://evoyage.app/s/Xk9mQ2p"
}
```

**Error Responses:**
- `400` -- Missing or empty `params`
- `400` -- `params` exceeds 4000 chars (safety limit)
- `429` -- Rate limited

**Implementation Notes:**
- Generate code using `nanoid` with custom base62 alphabet, 7 chars
- Retry up to 3 times on unique constraint violation (collision)
- Validate that `params` is a valid URL search params string (parseable by `URLSearchParams`)

### 3.2 GET /s/[code] -- Resolve Short URL

This is a Next.js page route (not an API route) that performs a server-side redirect.

**Route:** `src/app/s/[code]/page.tsx`

**Behavior:**
1. Look up `code` in the `ShortUrl` table
2. If found and not expired:
   - Increment `accessCount` (fire-and-forget, do not block redirect)
   - Redirect 307 to `/plan?{params}`
3. If not found or expired:
   - Redirect to `/` with a toast-friendly query param: `/?error=link-expired`

**Why 307 (Temporary Redirect):**
- Allows the short URL to be re-resolved on each visit (for access counting)
- Prevents browsers from caching the redirect permanently
- If we ever need to invalidate a short URL, 307 respects that

**Why a page route, not API route:**
- Next.js `redirect()` in a Server Component handles the 307 cleanly
- No client-side JavaScript needed for the redirect
- Proper SEO handling (crawlers follow 307s correctly)

---

## 4. Short Code Generation

### 4.1 Algorithm

```
Library: nanoid (already popular, well-tested)
Alphabet: ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789
Length: 7
```

Collision probability analysis (birthday problem):
- At 1M total URLs: P(collision) ~ 1.4 * 10^-7
- At 10M total URLs: P(collision) ~ 1.4 * 10^-5
- Retry-on-collision makes this practically zero

### 4.2 Why nanoid over alternatives

| Option | Pros | Cons |
|--------|------|------|
| `nanoid` | Cryptographically random, configurable alphabet, tiny (130B), zero deps | Requires npm install |
| `crypto.randomUUID` + truncate | No deps | Not uniform distribution when truncated, longer minimum for safety |
| Sequential ID + base62 encode | No collisions, shorter codes initially | Predictable/enumerable, leaks creation order |
| Hash of params | Deterministic (natural dedup) | Long hash needed to avoid collisions, ties code to content |

**Recommendation:** `nanoid` with custom alphabet. Add as a dependency (~130 bytes gzipped).

---

## 5. ShareButton Enhancement

### 5.1 Updated User Flow

The share button currently opens a modal with the PNG preview. The enhanced flow adds a "link sharing" step before the image:

```
[User clicks Share button]
        |
        v
  ┌─────────────────────────────────────────┐
  │         Share Trip Modal                 │
  │                                          │
  │  ┌────────────┐  ┌────────────────────┐  │
  │  │  Copy Link  │  │  Share Link...     │  │
  │  └────────────┘  └────────────────────┘  │
  │                                          │
  │  ── or share as image ──                 │
  │                                          │
  │  ┌────────────────────────────────────┐  │
  │  │       [PNG Preview Card]           │  │
  │  │                                    │  │
  │  └────────────────────────────────────┘  │
  │                                          │
  │  [Share Image]  [Download]  [Copy Image] │
  └─────────────────────────────────────────┘
```

### 5.2 Component Changes

**New props for ShareButton:**
```typescript
interface ShareButtonProps {
  readonly tripPlan: TripPlan | null;
  readonly urlParams: string | null;  // Current URL search params from useUrlState
}
```

**New internal state:**
```typescript
type LinkState = 'idle' | 'creating' | 'copied' | 'error';
const [shortUrl, setShortUrl] = useState<string | null>(null);
const [linkState, setLinkState] = useState<LinkState>('idle');
```

**New behaviors:**
1. **Copy Link button**: Calls `POST /api/short-url`, then copies the resulting URL to clipboard. Shows "Copied!" feedback for 2 seconds.
2. **Share Link button** (Web Share API): Calls `POST /api/short-url`, then invokes `navigator.share({ url, title, text })`. Only visible when Web Share API is available.
3. **Lazy creation**: The short URL is created on-demand when the user clicks Copy/Share Link, not when the modal opens.
4. **Caching**: Once created for the current trip state, reuse the same short URL until trip params change.

### 5.3 Integration with page.tsx

The page component must pass the current URL params to ShareButton:

```typescript
// In page.tsx, derive current params string for ShareButton
const currentParams = typeof window !== 'undefined' ? window.location.search.slice(1) : null;

<ShareButton tripPlan={tripPlan} urlParams={currentParams} />
```

Alternatively, ShareButton can read `window.location.search` directly since it is already a client component.

---

## 6. Rate Limiting

### 6.1 Strategy

The project already depends on `@upstash/ratelimit` and `@upstash/redis`. Reuse the existing setup.

| Limit | Window | Max Requests | Scope |
|-------|--------|-------------|-------|
| Short URL creation | 1 minute | 10 | Per IP |
| Short URL creation | 1 hour | 50 | Per IP |
| Short URL resolution | N/A | No limit | Public redirect |

### 6.2 Implementation

Apply rate limiting in the `POST /api/short-url` handler using the existing Upstash Redis instance. Use the sliding window algorithm already configured in the project.

Resolution (GET `/s/[code]`) should not be rate-limited -- it is a simple redirect that must be fast and always work.

---

## 7. Validation & Security

### 7.1 Input Validation (POST /api/short-url)

```
1. params must be a non-empty string
2. params must be parseable by URLSearchParams (valid format)
3. params length must be <= 4000 characters (prevents abuse)
4. params must contain at least 'start' or 'end' key (basic sanity)
5. No script injection: params are stored as-is and only used in URL reconstruction
```

### 7.2 Security Considerations

| Threat | Mitigation |
|--------|-----------|
| Enumeration attack (brute-force codes) | 62^7 keyspace makes enumeration infeasible. No sensitive data in trip params. |
| Stored XSS via params | Params are never rendered as HTML. They are passed through `URLSearchParams` which handles encoding. |
| Denial of service (mass creation) | Rate limiting (Section 6). Max params length cap. |
| Open redirect abuse | Redirect target is always `/{path}?{params}` on the same domain. Never redirect to external URLs. |
| Data exfiltration | Trip params contain only location names, coordinates, and vehicle settings. No PII. |

---

## 8. Error Handling

### 8.1 Creation Errors

| Scenario | User-facing behavior |
|----------|---------------------|
| Rate limited | Toast: "Too many links created. Please try again later." |
| Database error | Toast: "Could not create share link. Try again." Fallback: copy full URL to clipboard. |
| Network error | Same as database error. |
| Code collision (all 3 retries fail) | Extremely unlikely. Treat as database error. |

### 8.2 Resolution Errors

| Scenario | Behavior |
|----------|----------|
| Code not found | Redirect to `/?error=link-not-found` |
| Code expired | Redirect to `/?error=link-expired` |
| Database error | Render a minimal error page with a "Go to homepage" link |

### 8.3 Fallback Strategy

If short URL creation fails for any reason, ShareButton should fall back to copying the full long URL to the clipboard. This ensures sharing always works, even if the short URL service is down.

---

## 9. File Structure

```
prisma/
  schema.prisma                          # Add ShortUrl model

src/
  app/
    api/
      short-url/
        route.ts                         # POST handler: create short URL
    s/
      [code]/
        page.tsx                         # Server Component: resolve + redirect

  components/
    ShareButton.tsx                      # Enhanced with link sharing UI

  lib/
    short-url.ts                         # Code generation, DB operations
```

New files: 3 (`route.ts`, `page.tsx`, `short-url.ts`)
Modified files: 2 (`schema.prisma`, `ShareButton.tsx`)

---

## 10. Dependencies

| Package | Purpose | Size | Already installed? |
|---------|---------|------|--------------------|
| `nanoid` | Short code generation | ~130B gzip | No -- add as dependency |
| `@upstash/ratelimit` | Rate limiting | -- | Yes |
| `@upstash/redis` | Redis client for rate limiting | -- | Yes |
| `@prisma/client` | Database access | -- | Yes |

---

## 11. Migration Plan

### 11.1 Database Migration

```bash
# Add ShortUrl model to schema.prisma, then:
npx prisma db push
```

No data migration needed -- this is a new table.

### 11.2 Rollout Phases

**Phase 1: Backend (API + redirect)**
- Add `ShortUrl` model to Prisma schema
- Implement `POST /api/short-url` with validation and rate limiting
- Implement `GET /s/[code]` redirect page
- Unit tests for code generation, validation, and redirect logic

**Phase 2: Frontend (ShareButton enhancement)**
- Add "Copy Link" and "Share Link" buttons to ShareButton modal
- Wire up short URL creation API call
- Add loading/success/error states
- Keep existing PNG share flow intact

**Phase 3: Analytics (optional, future)**
- Dashboard for short URL access counts
- Click-through tracking
- Geographic distribution of shared links

---

## 12. Testing Strategy

### 12.1 Unit Tests

- `short-url.ts`: Code generation produces valid 7-char base62 strings
- `short-url.ts`: Collision retry logic works correctly
- `POST /api/short-url`: Validates params format, rejects empty/oversized input
- `POST /api/short-url`: Returns 429 when rate limited

### 12.2 Integration Tests

- Create short URL via API, then resolve it -- verify redirect target matches
- Verify `accessCount` increments on resolution
- Verify expired URLs redirect to error page
- Verify unknown codes redirect to error page

### 12.3 E2E Tests

- Plan a trip, click Share, click "Copy Link", paste into new tab -- trip state restores
- Plan a trip with waypoints + custom vehicle, share link -- all params survive round-trip
- Share via Web Share API on mobile -- verify URL is the short form

---

## 13. Open Questions

1. **Cleanup policy**: Should we add a cron job to delete short URLs older than N months? The storage cost is negligible, but stale data accumulates. Recommendation: defer until storage becomes a concern.

2. **QR code generation**: The project already has `qrcode` as a dependency. Should the share modal include a QR code for the short URL? This would be useful for in-person sharing (e.g., showing a trip plan to a passenger). Recommendation: include in Phase 2 as a low-effort addition.

3. **OG meta tags**: When someone pastes `evoyage.app/s/Xk9mQ2p` into a chat, should the link preview show trip details (route, distance, stops)? This requires the `/s/[code]` page to render OG tags before redirecting. Recommendation: defer to Phase 3 -- requires generating dynamic OG images per trip.
