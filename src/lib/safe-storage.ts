/**
 * Safe localStorage wrapper.
 * Returns fallback values instead of throwing when:
 * - localStorage is unavailable (SSR, private browsing)
 * - storage quota is exceeded
 * - stored value fails JSON parsing
 */

export function safeGetItem<T>(key: string, fallback: T): T {
  try {
    if (typeof window === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function safeSetItem(key: string, value: unknown): boolean {
  try {
    if (typeof window === 'undefined') return false;
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function safeRemoveItem(key: string): boolean {
  try {
    if (typeof window === 'undefined') return false;
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** Read a raw string (no JSON parsing). */
export function safeGetRaw(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Write a raw string (no JSON serialization). */
export function safeSetRaw(key: string, value: string): boolean {
  try {
    if (typeof window === 'undefined') return false;
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
