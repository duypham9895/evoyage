/**
 * Compute a conservative expiry timestamp for a fresh cookie set.
 *
 * Used by `scripts/refresh-vinfast-cookies.ts` to decide when the
 * VinfastApiCookies row should be considered stale by the hourly poller.
 *
 * Rule: take the smallest cookie expiry that is at least 1 hour out,
 * capped at 7 days from `now`. Short-lived cookies (CSRF tokens, request
 * IDs that expire within seconds) are ignored — they're not load-bearing
 * for the get-locators API call, which depends on cf_clearance and
 * session identity cookies that have longer TTLs.
 *
 * Session cookies (Playwright `expires === -1`) are also ignored — they
 * don't carry an explicit expiry signal.
 *
 * Pure function with injected `now` so tests don't depend on Date.now().
 *
 * Discovery context: first production run on 2026-05-03 returned an
 * expiresInDays of -0.1 because some upstream cookie expired within
 * 53 seconds. Filtering by minimum-useful-lifetime fixes this without
 * hardcoding cookie names that may change upstream.
 */
export interface ExpiringCookie {
  readonly expires: number; // Unix seconds; -1 for session cookies
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function computeCookieExpiry(
  cookies: readonly ExpiringCookie[],
  now: number = Date.now(),
): Date {
  const sevenDaysOut = now + SEVEN_DAYS_MS;
  const minUsefulExpiry = now + ONE_HOUR_MS;
  let minExpiry = sevenDaysOut;
  for (const c of cookies) {
    if (c.expires > 0) {
      const expiryMs = c.expires * 1000;
      if (expiryMs >= minUsefulExpiry && expiryMs < minExpiry) {
        minExpiry = expiryMs;
      }
    }
  }
  return new Date(minExpiry);
}
