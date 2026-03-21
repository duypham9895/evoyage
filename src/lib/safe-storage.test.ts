// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { safeGetItem, safeSetItem, safeRemoveItem, safeGetRaw, safeSetRaw } from './safe-storage';

describe('safe-storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('safeGetItem', () => {
    it('returns parsed JSON value when key exists', () => {
      localStorage.setItem('test', JSON.stringify({ a: 1 }));
      expect(safeGetItem('test', null)).toEqual({ a: 1 });
    });

    it('returns fallback when key does not exist', () => {
      expect(safeGetItem('missing', 'default')).toBe('default');
    });

    it('returns fallback when value is invalid JSON', () => {
      localStorage.setItem('bad', 'not-json{');
      expect(safeGetItem('bad', 42)).toBe(42);
    });

    it('returns fallback when localStorage throws', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('Access denied');
      });
      expect(safeGetItem('key', 'fallback')).toBe('fallback');
    });
  });

  describe('safeSetItem', () => {
    it('stores JSON-serialized value and returns true', () => {
      const result = safeSetItem('key', { x: 10, y: 20 });
      expect(result).toBe(true);
      expect(localStorage.getItem('key')).toBe('{"x":10,"y":20}');
    });

    it('returns false when localStorage throws (quota exceeded)', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });
      expect(safeSetItem('key', 'value')).toBe(false);
    });
  });

  describe('safeRemoveItem', () => {
    it('removes key and returns true', () => {
      localStorage.setItem('key', 'val');
      expect(safeRemoveItem('key')).toBe(true);
      expect(localStorage.getItem('key')).toBeNull();
    });

    it('returns false when localStorage throws', () => {
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new DOMException('Access denied');
      });
      expect(safeRemoveItem('key')).toBe(false);
    });
  });

  describe('safeGetRaw', () => {
    it('returns raw string without JSON parsing', () => {
      localStorage.setItem('raw', '1');
      expect(safeGetRaw('raw')).toBe('1');
    });

    it('returns null when key missing', () => {
      expect(safeGetRaw('missing')).toBeNull();
    });

    it('returns null when localStorage throws', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('Access denied');
      });
      expect(safeGetRaw('key')).toBeNull();
    });
  });

  describe('safeSetRaw', () => {
    it('stores raw string and returns true', () => {
      expect(safeSetRaw('key', 'hello')).toBe(true);
      expect(localStorage.getItem('key')).toBe('hello');
    });

    it('returns false when localStorage throws', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });
      expect(safeSetRaw('key', 'val')).toBe(false);
    });
  });
});
