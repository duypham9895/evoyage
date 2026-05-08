'use client';

import { useEffect } from 'react';
import { useLandingLocale } from './LandingClient';
import vi from '@/locales/vi.json';
import en from '@/locales/en.json';

const dictionaries = { vi, en } as const;

export default function LandingTitleSync({ titleKey }: { readonly titleKey: string }) {
  const { locale } = useLandingLocale();

  useEffect(() => {
    const dict = dictionaries[locale] as Record<string, string>;
    document.title = dict[titleKey] ?? titleKey;
  }, [locale, titleKey]);

  return null;
}
