'use client';

import { useEffect } from 'react';
import { useLocale } from '@/lib/locale';

export default function LocaleTitleSync({ titleKey }: { readonly titleKey: string }) {
  const { t } = useLocale();

  useEffect(() => {
    document.title = t(titleKey as Parameters<typeof t>[0]);
  }, [t, titleKey]);

  return null;
}
