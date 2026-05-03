/**
 * Compute a conservative expiry timestamp for a fresh cookie set.
 *
 * Used by `scripts/refresh-vinfast-cookies.ts` to decide when the
 * VinfastApiCookies row should be considered stale by the hourly poller.
 *
 * Rule: take the smallest non-expired explicit cookie expiry, capped at
 * 7 days from `now`. Session cookies (Playwright `expires === -1`) are
 * ignored — they don't bound staleness.
 *
 * Pure function with injected `now` so tests don't depend on Date.now().
 */
export interface ExpiringCookie {
  readonly expires: number; // Unix seconds; -1 for session cookies
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function computeCookieExpiry(
  cookies: readonly ExpiringCookie[],
  now: number = Date.now(),
): Date {
  const sevenDaysOut = now + SEVEN_DAYS_MS;
  let minExpiry = sevenDaysOut;
  for (const c of cookies) {
    if (c.expires > 0) {
      const expiryMs = c.expires * 1000;
      if (expiryMs > now && expiryMs < minExpiry) {
        minExpiry = expiryMs;
      }
    }
  }
  return new Date(minExpiry);
}
