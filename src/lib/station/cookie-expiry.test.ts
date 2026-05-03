import { describe, it, expect } from 'vitest';
import { computeCookieExpiry } from './cookie-expiry';

const NOW = 1_700_000_000_000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

describe('computeCookieExpiry', () => {
  it('returns now + 7 days when no cookies have explicit expiry', () => {
    expect(computeCookieExpiry([{ expires: -1 }], NOW).getTime()).toBe(NOW + SEVEN_DAYS_MS);
  });

  it('returns now + 7 days when cookie list is empty', () => {
    expect(computeCookieExpiry([], NOW).getTime()).toBe(NOW + SEVEN_DAYS_MS);
  });

  it('uses the smallest cookie expiry when one is sooner than 7 days', () => {
    const threeDaysFromNow = (NOW + 3 * 24 * 60 * 60 * 1000) / 1000;
    const tenDaysFromNow = (NOW + 10 * 24 * 60 * 60 * 1000) / 1000;
    const result = computeCookieExpiry(
      [{ expires: threeDaysFromNow }, { expires: tenDaysFromNow }],
      NOW,
    );
    expect(result.getTime()).toBe(threeDaysFromNow * 1000);
  });

  it('caps at 7 days even when all cookies expire later', () => {
    const tenDaysFromNow = (NOW + 10 * 24 * 60 * 60 * 1000) / 1000;
    expect(computeCookieExpiry([{ expires: tenDaysFromNow }], NOW).getTime()).toBe(
      NOW + SEVEN_DAYS_MS,
    );
  });

  it('ignores cookies that are already expired', () => {
    const oneHourAgo = (NOW - 3600 * 1000) / 1000;
    const fiveDaysFromNow = (NOW + 5 * 24 * 60 * 60 * 1000) / 1000;
    const result = computeCookieExpiry(
      [{ expires: oneHourAgo }, { expires: fiveDaysFromNow }],
      NOW,
    );
    expect(result.getTime()).toBe(fiveDaysFromNow * 1000);
  });

  it('ignores cookies with very short TTL (CSRF tokens etc.) — regression for prod bug 2026-05-03', () => {
    // Production scenario: VinFast served a CSRF-style cookie expiring 53 seconds out.
    // Old logic capped expiry at 53 seconds → polling endpoint returned cookies_expired
    // immediately. New rule: ignore cookies expiring in less than 1 hour.
    const fiftyThreeSecondsFromNow = (NOW + 53 * 1000) / 1000;
    const fiveDaysFromNow = (NOW + 5 * 24 * 60 * 60 * 1000) / 1000;
    const result = computeCookieExpiry(
      [{ expires: fiftyThreeSecondsFromNow }, { expires: fiveDaysFromNow }],
      NOW,
    );
    expect(result.getTime()).toBe(fiveDaysFromNow * 1000);
  });

  it('ignores cookies expiring within 1 hour even when other cookies are very long', () => {
    const thirtyMinutesFromNow = (NOW + 30 * 60 * 1000) / 1000;
    // Only short-TTL cookie present → fall back to 7-day cap
    const result = computeCookieExpiry([{ expires: thirtyMinutesFromNow }], NOW);
    expect(result.getTime()).toBe(NOW + SEVEN_DAYS_MS);
  });
});
