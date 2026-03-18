'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toPng } from 'html-to-image';
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
      chargeTimeMin: Math.round(stop.selected.estimatedChargeTimeMin),
    };
  }
  return {
    name: stop.station.name,
    powerKw: stop.station.maxPowerKw,
    chargeTimeMin: stop.estimatedChargingTimeMin,
  };
}

function formatDur(min: number, locale: string): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}${locale === 'vi' ? ' phút' : 'min'}`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
}

function trunc(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max).trimEnd() + '...';
}

export default function ShareButton({ tripPlan }: ShareButtonProps) {
  const { t, locale } = useLocale();
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<ShareState>('idle');
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tripPlan) { setVisible(false); return; }
    const timer = setTimeout(() => setVisible(true), 1000);
    return () => clearTimeout(timer);
  }, [tripPlan]);

  useEffect(() => {
    return () => { if (imageUrl) URL.revokeObjectURL(imageUrl); };
  }, [imageUrl]);

  const handleGenerate = useCallback(async () => {
    if (!tripPlan || !cardRef.current) return;

    setState('loading');
    setErrorMessage(null);

    try {
      // Wait for card to render
      await new Promise(r => setTimeout(r, 100));

      const dataUrl = await toPng(cardRef.current, {
        width: 1200, height: 630, pixelRatio: 2,
        backgroundColor: '#0d1117',
      });

      // Convert data URL to Blob without fetch (avoids CSP connect-src restriction)
      const base64 = dataUrl.split(',')[1];
      const byteString = atob(base64);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: 'image/png' });
      const url = URL.createObjectURL(blob);

      setImageBlob(blob);
      setImageUrl(url);
      setState('preview');
    } catch (err) {
      console.error('Card generation failed:', err);
      setErrorMessage(t('share_error'));
      setState('error');
    }
  }, [tripPlan, t]);

  const handleShare = useCallback(async () => {
    if (!imageBlob) return;
    try {
      const file = new File([imageBlob], 'evoyage-trip.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') console.error('Share failed:', err);
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
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') handleCloseModal(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state, handleCloseModal]);

  const supportsWebShare = typeof navigator !== 'undefined' && !!navigator.share;

  if (!tripPlan) return null;

  const stops = tripPlan.chargingStops.map(getStopInfo);
  const totalTime = tripPlan.totalDurationMin + tripPlan.totalChargingTimeMin;
  const startBattery = tripPlan.batterySegments[0]?.startBatteryPercent ?? 80;
  const stopsLabel = locale === 'vi' ? `${stops.length} điểm sạc` : `${stops.length} stops`;

  // Truncate for display
  const displayStops = stops.length > 6
    ? [...stops.slice(0, 2), { name: locale === 'vi' ? `+${stops.length - 4} điểm dừng khác` : `+${stops.length - 4} more stops`, powerKw: 0, chargeTimeMin: 0, isMore: true as const }, ...stops.slice(-2)]
    : stops;

  return (
    <>
      {/* Hidden card for rendering */}
      <div
        ref={cardRef}
        style={{
          position: 'fixed', left: '-9999px', top: 0,
          width: 1200, height: 630, fontFamily: 'system-ui, -apple-system, sans-serif',
          backgroundColor: '#0d1117', color: '#e6edf3', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Map placeholder */}
        <div style={{
          width: '100%', height: 380, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, #161b22, #0d1117)', borderBottom: '1px solid #30363d',
          fontSize: 28, color: '#484f58',
        }}>
          {trunc(tripPlan.startAddress, 25)} → {trunc(tripPlan.endAddress, 25)}
        </div>

        {/* Info area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 24px', gap: 8 }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            {trunc(tripPlan.startAddress, 50)} → {trunc(tripPlan.endAddress, 50)}
          </div>

          <div style={{ display: 'flex', gap: 24, fontSize: 15, color: '#8b949e' }}>
            <span>📏 {tripPlan.totalDistanceKm} km</span>
            <span>⏱️ {formatDur(totalTime, locale)}</span>
            <span>🔋 {stopsLabel}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, borderTop: '1px solid #21262d', paddingTop: 8, flex: 1 }}>
            {/* Start */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 20, textAlign: 'center', fontWeight: 700, fontSize: 13, color: '#22c55e' }}>A</span>
              <span style={{ flex: 1, color: '#c9d1d9' }}>{trunc(tripPlan.startAddress, 50)}</span>
              <span style={{ color: '#8b949e', fontSize: 13 }}>🔋 {Math.round(startBattery)}%</span>
            </div>

            {/* Stops */}
            {displayStops.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 20, textAlign: 'center', fontWeight: 700, fontSize: 13, color: 'isMore' in s ? '#8b949e' : '#eab308' }}>
                  {'isMore' in s ? '···' : '⚡'}
                </span>
                <span style={{ flex: 1, color: '#c9d1d9' }}>{trunc(s.name, 50)}</span>
                <span style={{ color: '#8b949e', fontSize: 13 }}>
                  {'isMore' in s ? '' : `${s.powerKw}kW · ${s.chargeTimeMin}m`}
                </span>
              </div>
            ))}

            {/* End */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 20, textAlign: 'center', fontWeight: 700, fontSize: 13, color: '#ef4444' }}>B</span>
              <span style={{ flex: 1, color: '#c9d1d9' }}>{trunc(tripPlan.endAddress, 50)}</span>
              <span style={{ color: '#8b949e', fontSize: 13 }}>🔋 {Math.round(tripPlan.arrivalBatteryPercent)}%</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #21262d', paddingTop: 6 }}>
            <div>
              <div style={{ fontSize: 13, color: '#58a6ff', fontWeight: 600 }}>evoyage.app</div>
              <div style={{ fontSize: 11, color: '#484f58' }}>EV Road Trip Planner 🇻🇳</div>
            </div>
          </div>
        </div>
      </div>

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
        ) : t('share_button')}
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
          role="dialog" aria-modal="true" aria-label="Share card preview"
        >
          <div className="bg-[var(--color-surface)] rounded-2xl overflow-hidden max-w-lg w-full shadow-2xl relative">
            <button
              onClick={handleCloseModal}
              aria-label="Close"
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors z-10"
            >✕</button>

            <div className="p-4">
              <img src={imageUrl} alt="Trip share card" className="w-full rounded-lg" />
            </div>

            <div className="flex items-center gap-2 p-4 pt-0">
              {supportsWebShare && (
                <button onClick={handleShare} aria-label={t('share_share')}
                  className="flex-1 py-2.5 rounded-xl bg-[var(--color-accent)] text-[var(--color-background)] font-semibold text-sm hover:opacity-90 transition-opacity">
                  {t('share_share')}
                </button>
              )}
              <button onClick={handleDownload} aria-label={t('share_download')}
                className="flex-1 py-2.5 rounded-xl bg-[var(--color-surface-hover)] text-[var(--color-foreground)] font-semibold text-sm hover:opacity-80 transition-opacity">
                {t('share_download')}
              </button>
              <button onClick={handleCopy} aria-label={t('share_copy')}
                className="flex-1 py-2.5 rounded-xl bg-[var(--color-surface-hover)] text-[var(--color-foreground)] font-semibold text-sm hover:opacity-80 transition-opacity">
                {t('share_copy')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
