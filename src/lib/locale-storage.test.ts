// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { LOCALE_STORAGE_KEY, readStoredLocale, writeStoredLocale } from './locale-storage';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('locale storage', () => {
  it('round-trips a written locale', () => {
    writeStoredLocale('en');
    expect(readStoredLocale()).toBe('en');
  });

  it('returns null when nothing is stored', () => {
    expect(readStoredLocale()).toBeNull();
  });

  it('ignores a stored value that is not a supported locale', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'fr');
    expect(readStoredLocale()).toBeNull();
  });

  it('does not throw when storage is blocked (e.g. Safari private mode)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => writeStoredLocale('en')).not.toThrow();
    expect(readStoredLocale()).toBeNull();
  });
});
