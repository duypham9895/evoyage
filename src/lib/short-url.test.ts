import { describe, it, expect } from 'vitest';
import { validateParams } from './short-url';

describe('short-url', () => {
  describe('validateParams', () => {
    describe('valid inputs', () => {
      it('accepts params with start parameter', () => {
        const result = validateParams('start=10.775,106.700');
        expect(result).toEqual({ valid: true, params: 'start=10.775,106.700' });
      });

      it('accepts params with end parameter', () => {
        const result = validateParams('end=21.028,105.854');
        expect(result).toEqual({ valid: true, params: 'end=21.028,105.854' });
      });

      it('accepts params with both start and end', () => {
        const result = validateParams('start=10.775,106.700&end=21.028,105.854');
        expect(result).toEqual({
          valid: true,
          params: 'start=10.775,106.700&end=21.028,105.854',
        });
      });

      it('accepts params with additional query parameters', () => {
        const params = 'start=10.775,106.700&end=21.028,105.854&vehicle=vinfast';
        const result = validateParams(params);
        expect(result).toEqual({ valid: true, params });
      });
    });

    describe('invalid inputs', () => {
      it('rejects non-string input', () => {
        const result = validateParams(123);
        expect(result).toEqual({ valid: false, error: 'params must be a non-empty string' });
      });

      it('rejects null input', () => {
        const result = validateParams(null);
        expect(result).toEqual({ valid: false, error: 'params must be a non-empty string' });
      });

      it('rejects undefined input', () => {
        const result = validateParams(undefined);
        expect(result).toEqual({ valid: false, error: 'params must be a non-empty string' });
      });

      it('rejects empty string', () => {
        const result = validateParams('');
        expect(result).toEqual({ valid: false, error: 'params must be a non-empty string' });
      });

      it('rejects params exceeding maximum length', () => {
        const longParams = 'start=1&' + 'x'.repeat(4001);
        const result = validateParams(longParams);
        expect(result).toEqual({
          valid: false,
          error: 'params exceeds maximum length of 4000 characters',
        });
      });

      it('rejects params without start or end', () => {
        const result = validateParams('vehicle=vinfast&battery=80');
        expect(result).toEqual({
          valid: false,
          error: 'params must contain at least start or end',
        });
      });

      it('rejects params with only unrelated keys', () => {
        const result = validateParams('foo=bar');
        expect(result).toEqual({
          valid: false,
          error: 'params must contain at least start or end',
        });
      });
    });

    describe('edge cases', () => {
      it('accepts exactly at the 4000 character limit', () => {
        const padding = 'x'.repeat(4000 - 'start=1&'.length);
        const params = `start=1&${padding}`;
        const result = validateParams(params);
        expect(result).toEqual({ valid: true, params });
      });

      it('rejects at 4001 characters', () => {
        const padding = 'x'.repeat(4001 - 'start=1&'.length);
        const params = `start=1&${padding}`;
        const result = validateParams(params);
        expect(result.valid).toBe(false);
      });

      it('returns the original params string on success', () => {
        const original = 'start=10.5,106.7&end=21.0,105.8';
        const result = validateParams(original);
        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.params).toBe(original);
        }
      });
    });
  });
});
