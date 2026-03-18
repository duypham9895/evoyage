'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocale } from '@/lib/locale';

interface ShareButtonProps {
  readonly tripId?: string;
  readonly locale: 'vi' | 'en';
}

type ShareState = 'idle' | 'loading' | 'preview' | 'error';

export default function ShareButton({ tripId, locale }: ShareButtonProps) {
  const { t } = useLocale();
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<ShareState>('idle');
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Slide-up animation after 1s delay
  useEffect(() => {
    if (!tripId) {
      setVisible(false);
      return;
    }

    const timer = setTimeout(() => setVisible(true), 1000);
    return () => clearTimeout(timer);
  }, [tripId]);

  // Clean up object URL on unmount or when imageUrl changes
  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  const handleGenerate = useCallback(async () => {
    if (!tripId) return;

    setState('loading');
    setErrorMessage(null);

    try {
      const response = await fetch('/api/share-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId, locale }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error ?? t('share_error'));
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      setImageBlob(blob);
      setImageUrl(url);
      setState('preview');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('share_error'));
      setState('error');
    }
  }, [tripId, locale, t]);

  const handleShare = useCallback(async () => {
    if (!imageBlob) return;

    try {
      const file = new File([imageBlob], 'evoyage-trip.png', { type: 'image/png' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      }
    } catch (err) {
      // User cancelled share or share failed — not an error to display
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    }
  }, [imageBlob]);

  const handleDownload = useCallback(() => {
    if (!imageUrl) return;

    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = 'evoyage-trip.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [imageUrl]);

  const handleCopy = useCallback(async () => {
    if (!imageBlob) return;

    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': imageBlob }),
      ]);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  }, [imageBlob]);

  const handleCloseModal = useCallback(() => {
    setState('idle');
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
    }
    setImageBlob(null);
    setImageUrl(null);
  }, [imageUrl]);

  // Close modal on Escape key
  useEffect(() => {
    if (state !== 'preview') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseModal();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state, handleCloseModal]);

  const supportsWebShare = typeof navigator !== 'undefined' && !!navigator.share;

  if (!tripId) return null;

  return (
    <>
      {/* Floating share button */}
      <button
        onClick={handleGenerate}
        disabled={state === 'loading'}
        aria-label={t('share_button')}
        className={`
          fixed z-50 right-4 bottom-20 lg:bottom-6
          px-4 py-2.5 rounded-full
          bg-[var(--color-accent)] text-[var(--color-background)]
          font-semibold text-sm
          shadow-lg shadow-[var(--color-accent)]/25
          transition-all duration-300 ease-out
          hover:opacity-90 active:scale-95
          ${visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0 pointer-events-none'}
        `}
      >
        {state === 'loading' ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-[var(--color-background)] border-t-transparent rounded-full animate-spin" />
            {t('share_generating')}
          </span>
        ) : (
          t('share_button')
        )}
      </button>

      {/* Error toast */}
      {state === 'error' && errorMessage && (
        <div className="fixed z-50 bottom-32 lg:bottom-16 right-4 max-w-xs p-3 bg-[var(--color-danger)]/90 text-white text-sm rounded-lg shadow-lg">
          {errorMessage}
        </div>
      )}

      {/* Preview modal */}
      {state === 'preview' && imageUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseModal();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Share card preview"
        >
          <div
            ref={modalRef}
            className="bg-[var(--color-surface)] rounded-2xl overflow-hidden max-w-lg w-full shadow-2xl"
          >
            {/* Card preview */}
            <div className="p-4">
              <img
                src={imageUrl}
                alt={`Trip share card`}
                className="w-full rounded-lg"
              />
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 p-4 pt-0">
              {supportsWebShare && (
                <button
                  onClick={handleShare}
                  aria-label={t('share_share')}
                  className="flex-1 py-2.5 rounded-xl bg-[var(--color-accent)] text-[var(--color-background)] font-semibold text-sm hover:opacity-90 transition-opacity"
                >
                  {t('share_share')}
                </button>
              )}
              <button
                onClick={handleDownload}
                aria-label={t('share_download')}
                className="flex-1 py-2.5 rounded-xl bg-[var(--color-surface-hover)] text-[var(--color-foreground)] font-semibold text-sm hover:opacity-80 transition-opacity"
              >
                {t('share_download')}
              </button>
              <button
                onClick={handleCopy}
                aria-label={t('share_copy')}
                className="flex-1 py-2.5 rounded-xl bg-[var(--color-surface-hover)] text-[var(--color-foreground)] font-semibold text-sm hover:opacity-80 transition-opacity"
              >
                {t('share_copy')}
              </button>
            </div>

            {/* Close button */}
            <button
              onClick={handleCloseModal}
              aria-label="Close"
              className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
            >
              X
            </button>
          </div>
        </div>
      )}
    </>
  );
}
