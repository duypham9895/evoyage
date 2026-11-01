import { describe, it, expect } from 'vitest';
import { hasEnoughStatusCoverage } from './status-coverage';

function rows(withStatusCount: number, withoutStatusCount: number) {
  return [
    ...Array.from({ length: withStatusCount }, () => ({ charging_status: 'ACTIVE' })),
    ...Array.from({ length: withoutStatusCount }, () => ({ charging_status: '' })),
  ];
}

describe('hasEnoughStatusCoverage', () => {
  it('passes when exactly half the rows carry a non-empty charging_status', () => {
    expect(hasEnoughStatusCoverage(rows(2, 2))).toBe(true);
  });

  it('fails when under half the rows carry a non-empty charging_status', () => {
    expect(hasEnoughStatusCoverage(rows(1, 3))).toBe(false);
  });

  it('passes for an empty array (vacuously enough coverage)', () => {
    expect(hasEnoughStatusCoverage([])).toBe(true);
  });

  it('passes when all rows carry a non-empty charging_status', () => {
    expect(hasEnoughStatusCoverage(rows(4, 0))).toBe(true);
  });

  it('fails when none of the rows carry a non-empty charging_status', () => {
    expect(hasEnoughStatusCoverage(rows(0, 4))).toBe(false);
  });

  it('treats a missing charging_status field the same as empty', () => {
    expect(hasEnoughStatusCoverage([{}, {}, { charging_status: 'ACTIVE' }])).toBe(false);
  });
});
