'use client';

import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useLocale } from '@/lib/locale';

// Lazy-load the modal — no SSR (decision #7)
const FeedbackModal = dynamic(() => import('./FeedbackModal'), { ssr: false });

interface FeedbackFABProps {
  /** Pre-fill for station data error triggered from station card */
  readonly stationContext?: {
    readonly stationId: string;
    readonly stationName: string;
  };
}

export default function FeedbackFAB({ stationContext }: FeedbackFABProps) {
  const { t } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [showPulse, setShowPulse] = useState(false);

  // Check localStorage after mount to avoid hydration mismatch
  useEffect(() => {
    const shouldPulse = !localStorage.getItem('evoyage-feedback-seen');
    if (!shouldPulse) return;
    setShowPulse(true);
    const timer = setTimeout(() => {
      setShowPulse(false);
      localStorage.setItem('evoyage-feedback-seen', '1');
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  const handleOpen = useCallback(() => {
    setShowPulse(false);
    localStorage.setItem('evoyage-feedback-seen', '1');
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <>
      {/* FAB button */}
      <button
        onClick={handleOpen}
        aria-label={t('feedback_title')}
        title={t('feedback_title')}
        className={`
          fixed z-50 right-4 bottom-[calc(55vh+12px)] lg:bottom-6
          w-12 h-12
          rounded-full
          bg-[var(--color-surface)] border border-[var(--color-surface-hover)]
          text-[var(--color-accent)]
          shadow-lg shadow-black/30
          transition-all duration-200 ease-out
          hover:scale-105 hover:bg-[var(--color-surface-hover)]
          active:scale-95
          flex items-center justify-center
          ${showPulse ? 'animate-[fabPulse_2s_ease-in-out_infinite]' : ''}
        `}
      >
        {/* Chat bubble with plus icon */}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <line x1="9" y1="10" x2="15" y2="10" />
          <line x1="12" y1="7" x2="12" y2="13" />
        </svg>
      </button>

      {/* Modal */}
      {isOpen && (
        <FeedbackModal
          isOpen={isOpen}
          onClose={handleClose}
          stationContext={stationContext}
        />
      )}
    </>
  );
}
