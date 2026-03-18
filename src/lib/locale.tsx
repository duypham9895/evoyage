'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Locale } from '@/types';
import vi from '@/locales/vi.json';
import en from '@/locales/en.json';

type TranslationKey = keyof typeof vi;
type InterpolationParams = Record<string, string | number>;

const dictionaries: Record<Locale, Record<string, string>> = { vi, en };

/**
 * Replace `{{key}}` placeholders with values from params.
 * Returns the template unchanged for any missing keys.
 */
function interpolate(template: string, params?: InterpolationParams): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = params[key];
    return value !== undefined ? String(value) : match;
  });
}

interface LocaleContextType {
  readonly locale: Locale;
  readonly toggleLocale: () => void;
  /** Key-based translation: `t('plan_trip_button')` or `t('vehicle_at_battery', { vehicle, percent })` */
  readonly t: (key: TranslationKey, params?: InterpolationParams) => string;
  /** Pick the correct field from a bilingual object: `tBi({ messageVi, messageEn })` */
  readonly tBi: (obj: { readonly messageVi: string; readonly messageEn: string }) => string;
}

const LocaleContext = createContext<LocaleContextType>({
  locale: 'vi',
  toggleLocale: () => {},
  t: (key) => String(key),
  tBi: (obj) => obj.messageVi,
});

export function LocaleProvider({ children }: { readonly children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('vi');

  const toggleLocale = useCallback(() => {
    setLocale((prev) => (prev === 'vi' ? 'en' : 'vi'));
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: InterpolationParams): string => {
      const dict = dictionaries[locale];
      const template = dict[key];
      if (!template) {
        console.warn(`[i18n] Missing key: "${String(key)}" for locale "${locale}"`);
        return String(key);
      }
      return interpolate(template, params);
    },
    [locale],
  );

  const tBi = useCallback(
    (obj: { readonly messageVi: string; readonly messageEn: string }): string =>
      locale === 'vi' ? obj.messageVi : obj.messageEn,
    [locale],
  );

  return (
    <LocaleContext.Provider value={{ locale, toggleLocale, t, tBi }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
