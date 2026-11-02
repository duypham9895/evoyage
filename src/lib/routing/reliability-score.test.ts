import { describe, it, expect } from 'vitest';
import { reliabilityMultiplier } from './reliability-score';

describe('reliabilityMultiplier', () => {
  it('returns 1.0 (no penalty) when record is null', () => {
    expect(reliabilityMultiplier(null)).toBe(1.0);
  });

  it('returns 1.0 when record is undefined', () => {
    expect(reliabilityMultiplier(undefined)).toBe(1.0);
  });

  it('returns 1.0 (gated) when observationCount is below threshold', () => {
    expect(reliabilityMultiplier({ reliability: 0.5, observationCount: 99 })).toBe(1.0);
  });

  it('applies multiplier exactly at the 100-observation threshold', () => {
    expect(reliabilityMultiplier({ reliability: 0.5, observationCount: 100 })).toBe(1.5);
  });

  it('returns 1.0 multiplier for reliability=1.0 (no penalty)', () => {
    expect(reliabilityMultiplier({ reliability: 1.0, observationCount: 200 })).toBe(1.0);
  });

  it('returns 1.5 multiplier for reliability=0.5', () => {
    expect(reliabilityMultiplier({ reliability: 0.5, observationCount: 200 })).toBe(1.5);
  });

  it('returns 2.0 multiplier for reliability=0.0 (max penalty)', () => {
    expect(reliabilityMultiplier({ reliability: 0.0, observationCount: 200 })).toBe(2.0);
  });

  // BUG(p2-cron-silent-noops-and-observability): the gate checks observationCount only, so a reliability row frozen for a year still penalises the station. Fixer: change it.fails -> it once fixed, and carry computedAt through ReliabilityRecord and the map built in src/app/api/route/route.ts:440-447. See docs/bugs/2026-11-01-p2-cron-silent-noops-and-observability.md
  it.fails('returns 1.0 (no penalty) when the reliability row was computed a year ago', () => {
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    // Spread keeps this compiling while ReliabilityRecord has no computedAt field.
    const staleRecord = { reliability: 0.2, observationCount: 500, ...{ computedAt: oneYearAgo } };
    expect(reliabilityMultiplier(staleRecord)).toBe(1.0);
  });
});
