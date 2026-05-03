'use client';

import { useState, useSyncExternalStore } from 'react';
import { useLocale } from '@/lib/locale';

const subscribe = (callback: () => void) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('popstate', callback);
  return () => window.removeEventListener('popstate', callback);
};

const getSnapshot = (): string | null => {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('error');
};

const getServerSnapshot = (): string | null => null;

export default function ErrorBanner() {
  const { t } = useLocale();
  const urlError = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [dismissed, setDismissed] = useState(false);

  if (!urlError || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.delete('error');
    const search = url.searchParams.toString();
    window.history.replaceState(null, '', search ? `${url.pathname}?${search}` : url.pathname);
  };

  return (
    <div
      role="alert"
      className="bg-[var(--color-warn)]/10 border-l-4 border-[var(--color-warn)] px-4 py-3 flex items-start gap-3"
    >
      <p className="flex-1 text-sm text-[var(--color-foreground)]">{t('share_expired')}</p>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={t('dismiss')}
        className="text-[var(--color-muted)] hover:text-[var(--color-foreground)] text-lg leading-none p-1 -m-1 transition-colors"
      >
        ×
      </button>
    </div>
  );
}
