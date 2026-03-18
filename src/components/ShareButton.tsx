'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocale } from '@/lib/locale';
import type { TripPlan } from '@/types';

interface ShareButtonProps {
  readonly tripPlan: TripPlan | null;
}

type ShareState = 'idle' | 'loading' | 'preview' | 'error';

function getStopInfo(stop: TripPlan['chargingStops'][number]) {
  if ('selected' in stop) {
    return {
      name: stop.selected.station.name,
      powerKw: stop.selected.station.maxPowerKw,
      chargeTimeMin: stop.selected.estimatedChargeTimeMin,
      lat: stop.selected.station.latitude,
      lng: stop.selected.station.longitude,
    };
  }
  return {
    name: stop.station.name,
    powerKw: stop.station.maxPowerKw,
    chargeTimeMin: stop.estimatedChargingTimeMin,
    lat: stop.station.latitude,
    lng: stop.station.longitude,
  };
}

export default function ShareButton({ tripPlan }: ShareButtonProps) {
  const { t, locale } = useLocale();
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<ShareState>('idle');
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tripPlan) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), 1000);
    return () => clearTimeout(timer);
  }, [tripPlan]);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const handleGenerate = useCallback(async () => {
    if (!tripPlan) return;

    setState('loading');
    setErrorMessage(null);

    try {
      const startBattery = tripPlan.batterySegments[0]?.startBatteryPercent ?? 80;

      const response = await fetch('/api/share-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locale,
          startAddress: tripPlan.startAddress,
          endAddress: tripPlan.endAddress,
          totalDistanceKm: tripPlan.totalDistanceKm,
          totalDurationMin: tripPlan.totalDurationMin,
          totalChargingTimeMin: tripPlan.totalChargingTimeMin,
          arrivalBatteryPercent: tripPlan.arrivalBatteryPercent,
          startBatteryPercent: startBattery,
          chargingStops: tripPlan.chargingStops.map(getStopInfo),
          polyline: tripPlan.polyline,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const msg = typeof errorData?.error === 'string' ? errorData.error.slice(0, 200) : t('share_error');
        throw new Error(msg);
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
  }, [tripPlan, locale, t]);

  const handleShare = useCallback(async () => {
    if (!imageBlob) return;
    try {
      const file = new File([imageBlob], 'evoyage-trip.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      }
    } catch (err) {
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
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': imageBlob })]);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  }, [imageBlob]);

  const handleCloseModal = useCallback(() => {
    setState('idle');
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageBlob(null);
    setImageUrl(null);
  }, [imageUrl]);

  useEffect(() => {
    if (state !== 'preview') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseModal();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state, handleCloseModal]);

  const supportsWebShare = typeof navigator !== 'undefined' && !!navigator.share;

  if (!tripPlan) return null;

  return (
    <>
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

      {state === 'error' && errorMessage && (
        <div className="fixed z-50 bottom-32 lg:bottom-16 right-4 max-w-xs p-3 bg-[var(--color-danger)]/90 text-white text-sm rounded-lg shadow-lg">
          {errorMessage}
        </div>
      )}

      {state === 'preview' && imageUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) handleCloseModal(); }}
          role="dialog"
          aria-modal="true"
          aria-label="Share card preview"
        >
          <div ref={modalRef} className="bg-[var(--color-surface)] rounded-2xl overflow-hidden max-w-lg w-full shadow-2xl relative">
            <button
              onClick={handleCloseModal}
              aria-label="Close"
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors z-10"
            >
              ✕
            </button>

            <div className="p-4">
              <img src={imageUrl} alt="Trip share card" className="w-full rounded-lg" />
            </div>

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
          </div>
        </div>
      )}
    </>
  );
}
