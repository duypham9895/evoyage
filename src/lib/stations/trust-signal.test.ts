/**
 * Tests for the station trust-signal classifier.
 *
 * Covers tier boundaries (24h, 7 days), null/future inputs, and ISO strings.
 */

import { describe, it, expect } from 'vitest';
import { classifyTrustSignal, type TrustTier } from './trust-signal';

const NOW = new Date('2026-05-01T12:00:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

describe('classifyTrustSignal', () => {
  describe('null / undefined / invalid input', () => {
    it('returns "none" tier when lastVerifiedAt is null', () => {
      const result = classifyTrustSignal(null, NOW);
      expect(result.tier).toBe('none' satisfies TrustTier);
      expect(result.minutesAgo).toBeNull();
    });

    it('returns "none" tier when lastVerifiedAt is undefined', () => {
      const result = classifyTrustSignal(undefined, NOW);
      expect(result.tier).toBe('none');
      expect(result.minutesAgo).toBeNull();
    });

    it('returns "none" tier when ISO string is unparseable', () => {
      const result = classifyTrustSignal('not-a-date', NOW);
      expect(result.tier).toBe('none');
      expect(result.minutesAgo).toBeNull();
    });

    it('returns "none" tier when timestamp is in the future', () => {
      const future = new Date(NOW.getTime() + 60_000);
      const result = classifyTrustSignal(future, NOW);
      expect(result.tier).toBe('none');
      expect(result.minutesAgo).toBeNull();
    });
  });

  describe('"recent" tier (within last 24h)', () => {
    it('classifies just-now as recent', () => {
      const result = classifyTrustSignal(NOW, NOW);
      expect(result.tier).toBe('recent');
      expect(result.minutesAgo).toBe(0);
    });

    it('classifies 5 minutes ago as recent', () => {
      const result = classifyTrustSignal(minutesAgo(5), NOW);
      expect(result.tier).toBe('recent');
      expect(result.minutesAgo).toBe(5);
    });

    it('classifies 23 hours 59 min ago as recent (boundary)', () => {
      const result = classifyTrustSignal(minutesAgo(24 * 60 - 1), NOW);
      expect(result.tier).toBe('recent');
    });
  });

  describe('"older" tier (24h–7 days)', () => {
    it('classifies exactly 24h ago as older (boundary)', () => {
      const result = classifyTrustSignal(hoursAgo(24), NOW);
      expect(result.tier).toBe('older');
    });

    it('classifies 3 days ago as older', () => {
      const result = classifyTrustSignal(daysAgo(3), NOW);
      expect(result.tier).toBe('older');
    });

    it('classifies 6 days 23h ago as older (just inside boundary)', () => {
      const result = classifyTrustSignal(hoursAgo(6 * 24 + 23), NOW);
      expect(result.tier).toBe('older');
    });
  });

  describe('"none" tier (older than 7 days)', () => {
    it('classifies exactly 7 days ago as none (boundary)', () => {
      const result = classifyTrustSignal(daysAgo(7), NOW);
      expect(result.tier).toBe('none');
    });

    it('classifies 30 days ago as none', () => {
      const result = classifyTrustSignal(daysAgo(30), NOW);
      expect(result.tier).toBe('none');
    });
  });

  describe('input format flexibility', () => {
    it('accepts ISO 8601 strings', () => {
      const iso = minutesAgo(10).toISOString();
      const result = classifyTrustSignal(iso, NOW);
      expect(result.tier).toBe('recent');
      expect(result.minutesAgo).toBe(10);
    });

    it('accepts Date objects', () => {
      const result = classifyTrustSignal(minutesAgo(10), NOW);
      expect(result.tier).toBe('recent');
      expect(result.minutesAgo).toBe(10);
    });
  });
});
