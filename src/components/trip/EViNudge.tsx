'use client';

import { useState, useCallback } from 'react';
import { useLocale } from '@/lib/locale';

const SESSION_KEY = 'evi_nudge_shown';

function safeGetSession(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetSession(key: string, value: string): void {
  try {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(key, value);
  } catch {
    // Private mode or quota exceeded — fail silently. The nudge may re-fire
    // this session, but we won't break the page.
  }
}

interface EViNudgeProps {
  readonly shouldShow: boolean;
  readonly onOpenEvi: () => void;
  readonly onDismiss: () => void;
}

export default function EViNudge({ shouldShow, onOpenEvi, onDismiss }: EViNudgeProps) {
  const { t } = useLocale();

  // Track whether sessionStorage already says "shown" so we never render after
  // the user has dismissed once this session, even if the parent re-mounts us.
  // The lazy initializer reads sessionStorage synchronously on first render —
  // safe in client components and cheaper than a post-mount effect.
  const [alreadyShown, setAlreadyShown] = useState<boolean>(() =>
    safeGetSession(SESSION_KEY) === '1',
  );

  const markShown = useCallback(() => {
    safeSetSession(SESSION_KEY, '1');
    setAlreadyShown(true);
  }, []);

  const handleOpen = useCallback(() => {
    onOpenEvi();
    markShown();
  }, [onOpenEvi, markShown]);

  const handleDismiss = useCallback(() => {
    onDismiss();
    markShown();
  }, [onDismiss, markShown]);

  if (!shouldShow || alreadyShown) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[calc(55vh+132px)] right-3 lg:bottom-36 lg:right-6 z-[700] max-w-xs w-[calc(100vw-1.5rem)] sm:w-auto rounded-lg p-3 shadow-lg shadow-black/40 border border-[var(--color-accent-dim)] bg-[var(--color-surface)] animate-fadeIn"
    >
      <p className="font-[family-name:var(--font-heading)] font-semibold text-sm text-[var(--color-accent)]">
        {t('evi_nudge_headline')}
      </p>
      <p className="mt-0.5 text-xs text-[var(--color-muted)]">
        {t('evi_nudge_body')}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={handleOpen}
          className="px-3 py-1.5 rounded-md bg-[var(--color-accent)] text-[var(--color-background)] text-xs font-semibold font-[family-name:var(--font-heading)] hover:opacity-90 active:scale-[0.98] transition-all"
        >
          {t('evi_nudge_cta')}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="px-2 py-1.5 rounded-md text-xs text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
        >
          {t('evi_nudge_dismiss')}
        </button>
      </div>
    </div>
  );
}
