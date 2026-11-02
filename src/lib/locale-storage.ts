import type { Locale } from '@/types';

/**
 * One persisted locale shared by the landing page (LandingWrapper) and /plan
 * (LocaleProvider). Read it after mount only: the server always renders 'vi',
 * so reading it during the first render would cause a hydration mismatch.
 */
export const LOCALE_STORAGE_KEY = 'evoyage-locale';

export function readStoredLocale(): Locale | null {
  try {
    const value = localStorage.getItem(LOCALE_STORAGE_KEY);
    return value === 'vi' || value === 'en' ? value : null;
  } catch {
    return null;
  }
}

export function writeStoredLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage blocked (private mode): the choice lasts for this page only.
  }
}
