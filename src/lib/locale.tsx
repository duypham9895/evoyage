'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Locale } from '@/types';

interface LocaleContextType {
  readonly locale: Locale;
  readonly toggleLocale: () => void;
  readonly t: (vi: string, en: string) => string;
}

const LocaleContext = createContext<LocaleContextType>({
  locale: 'vi',
  toggleLocale: () => {},
  t: (vi) => vi,
});

export function LocaleProvider({ children }: { readonly children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('vi');

  const toggleLocale = useCallback(() => {
    setLocale((prev) => (prev === 'vi' ? 'en' : 'vi'));
  }, []);

  const t = useCallback(
    (vi: string, en: string) => (locale === 'vi' ? vi : en),
    [locale],
  );

  return (
    <LocaleContext.Provider value={{ locale, toggleLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
