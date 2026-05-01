'use client';

import { useState, useCallback } from 'react';
import { useLocale } from '@/lib/locale';

const SESSION_KEY = 'evi_nudge_shown';

// Hardcoded copy — pending orchestrator integration into en.json/vi.json.
const COPY = {
  vi: {
    headline: 'Bí ý tưởng? Hỏi eVi nhé.',
    body: "Ví dụ: 'gợi ý chuyến đi cuối tuần'",
    cta: 'Mở eVi',
    dismiss: 'Để sau',
    closeAria: 'Đóng',
  },
  en: {
    headline: 'Stuck? Ask eVi.',
    body: "Try: 'suggest a weekend trip'",
    cta: 'Open eVi',
    dismiss: 'Later',
    closeAria: 'Close',
  },
} as const;

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
  const { locale } = useLocale();
  const copy = COPY[locale === 'en' ? 'en' : 'vi'];

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
      className="fixed bottom-20 right-3 lg:bottom-24 lg:right-6 z-[700] max-w-xs w-[calc(100vw-1.5rem)] sm:w-auto rounded-lg p-3 pr-2 shadow-lg shadow-black/40 border border-[var(--color-accent-dim)] bg-[var(--color-accent-subtle)] backdrop-blur-sm animate-fadeIn"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-[family-name:var(--font-heading)] font-semibold text-sm text-[var(--color-accent)]">
            {copy.headline}
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
            {copy.body}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpen}
              className="px-3 py-1.5 rounded-md bg-[var(--color-accent)] text-[var(--color-background)] text-xs font-semibold font-[family-name:var(--font-heading)] hover:opacity-90 active:scale-[0.98] transition-all"
            >
              {copy.cta}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="px-2 py-1.5 rounded-md text-xs text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
            >
              {copy.dismiss}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={copy.closeAria}
          className="shrink-0 -mt-0.5 -mr-0.5 w-6 h-6 rounded-md text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)] transition-colors flex items-center justify-center"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
