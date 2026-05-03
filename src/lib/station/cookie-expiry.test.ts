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
});
