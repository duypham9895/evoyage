import { describe, it, expect } from 'vitest';
import { isValidCoordinate } from './coordinate-validation';

describe('isValidCoordinate', () => {
  it('accepts Ho Chi Minh City', () => {
    expect(isValidCoordinate(10.762, 106.660)).toBe(true);
  });

  it('accepts Hanoi', () => {
    expect(isValidCoordinate(21.028, 105.854)).toBe(true);
  });

  it('accepts Phnom Penh (cross-border SE Asia)', () => {
    expect(isValidCoordinate(11.556, 104.928)).toBe(true);
  });

  it('accepts Da Nang', () => {
    expect(isValidCoordinate(16.047, 108.206)).toBe(true);
  });

  it('rejects Antarctica', () => {
    expect(isValidCoordinate(-75.0, 0.0)).toBe(false);
  });

  it('rejects New York', () => {
    expect(isValidCoordinate(40.712, -74.006)).toBe(false);
  });

  it('rejects too far north', () => {
    expect(isValidCoordinate(45.0, 106.0)).toBe(false);
  });

  it('rejects too far west', () => {
    expect(isValidCoordinate(10.0, 80.0)).toBe(false);
  });

  it('rejects too far east', () => {
    expect(isValidCoordinate(10.0, 120.0)).toBe(false);
  });

  it('accepts boundary values', () => {
    expect(isValidCoordinate(0, 95)).toBe(true);
    expect(isValidCoordinate(30, 115)).toBe(true);
  });
});
