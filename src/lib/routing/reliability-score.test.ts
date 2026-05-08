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
});
