'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toPng } from 'html-to-image';
import QRCode from 'qrcode';
import { useLocale } from '@/lib/locale';
import { trackShareClicked } from '@/lib/analytics';
import type { TripPlan } from '@/types';

interface ShareButtonProps {
  readonly tripPlan: TripPlan | null;
}

type ModalState = 'closed' | 'share' | 'generating-image' | 'image-preview';
type LinkState = 'idle' | 'creating' | 'copied' | 'error';

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

/** Get current URL params string from the browser URL bar. */
function getCurrentParams(): string {
  if (typeof window === 'undefined') return '';
  return window.location.search.slice(1); // Remove leading '?'
}

/** Build the full long URL for fallback sharing. */
function getFullUrl(): string {
  if (typeof window === 'undefined') return '';
  return window.location.href;
}

export default function ShareButton({ tripPlan }: ShareButtonProps) {
  const { t, locale } = useLocale();
  const [visible, setVisible] = useState(false);
  const [modalState, setModalState] = useState<ModalState>('closed');
  const [linkState, setLinkState] = useState<LinkState>('idle');
  const [shortUrl, setShortUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const lastParamsRef = useRef<string>('');
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalContentRef = useRef<HTMLDivElement>(null);

  // Show button after trip plan loads
  useEffect(() => {
    if (!tripPlan) { setVisible(false); return; }
    const timer = setTimeout(() => setVisible(true), 1000);
    return () => clearTimeout(timer);
  }, [tripPlan]);

  // Revoke previous image URL when it changes, and on unmount
  const prevImageUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevImageUrlRef.current && prevImageUrlRef.current !== imageUrl) {
      URL.revokeObjectURL(prevImageUrlRef.current);
    }
    prevImageUrlRef.current = imageUrl;
    return () => { if (imageUrl) URL.revokeObjectURL(imageUrl); };
  }, [imageUrl]);

  // Cleanup copied timer on unmount
  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  // Invalidate cached short URL when params change
  useEffect(() => {
    const currentParams = getCurrentParams();
    if (currentParams !== lastParamsRef.current) {
      lastParamsRef.current = currentParams;
      setShortUrl(null);
      setQrDataUrl(null);
      setLinkState('idle');
    }
  });

  /** Create or reuse a short URL for current trip params. */
  const getOrCreateShortUrl = useCallback(async (): Promise<string> => {
    // Return cached short URL if params haven't changed
    if (shortUrl) return shortUrl;

    const params = getCurrentParams();
    if (!params) throw new Error('No trip params in URL');

    const response = await fetch('/api/short-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ params }),
    });

    if (response.status === 429) {
      throw new Error('rate-limited');
    }

    if (!response.ok) {
      throw new Error('creation-failed');
    }

    const data = await response.json();
    const url = data.url as string;

    setShortUrl(url);
    lastParamsRef.current = params;

    // Generate QR code from short URL
    try {
      const qr = await QRCode.toDataURL(url, {
        width: 200,
        margin: 2,
        color: { dark: '#e6edf3', light: '#0d1117' },
      });
      setQrDataUrl(qr);
    } catch {
      // QR code generation is non-critical
    }

    return url;
  }, [shortUrl]);

  /** Handle "Copy Link" click. */
  const handleCopyLink = useCallback(async () => {
    setLinkState('creating');
    setErrorMessage(null);

    try {
      const url = await getOrCreateShortUrl();
      await navigator.clipboard.writeText(url);
      // Analytics: just the share method category — no URL, no params.
      try { trackShareClicked('link'); } catch { /* analytics never breaks the flow */ }
      setLinkState('copied');

      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setLinkState('idle'), 2000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '';

      if (errorMsg === 'rate-limited') {
        setErrorMessage(t('share_rate_limited'));
        setLinkState('error');
        return;
      }

      // Fallback: copy full long URL
      try {
        await navigator.clipboard.writeText(getFullUrl());
        setErrorMessage(t('share_link_error'));
      } catch {
        setErrorMessage(t('share_link_error'));
      }
      setLinkState('error');
    }
  }, [getOrCreateShortUrl, t]);

  /** Handle "Share Link" click (Web Share API). */
  const handleShareLink = useCallback(async () => {
    setLinkState('creating');
    setErrorMessage(null);

    try {
      const url = await getOrCreateShortUrl();

      if (navigator.share) {
        await navigator.share({
          title: tripPlan
            ? `${trunc(tripPlan.startAddress, 30)} → ${trunc(tripPlan.endAddress, 30)}`
            : 'eVoyage Trip',
          text: tripPlan
            ? `${tripPlan.totalDistanceKm}km · ${tripPlan.chargingStops.length} charging stops`
            : undefined,
          url,
        });
      }

      setLinkState('idle');
    } catch (err) {
      // User cancelled share dialog
      if (err instanceof Error && err.name === 'AbortError') {
        setLinkState('idle');
        return;
      }

      const errorMsg = err instanceof Error ? err.message : '';
      if (errorMsg === 'rate-limited') {
        setErrorMessage(t('share_rate_limited'));
        setLinkState('error');
        return;
      }

      // Fallback: copy full URL
      try {
        await navigator.clipboard.writeText(getFullUrl());
        setErrorMessage(t('share_link_error'));
      } catch {
        setErrorMessage(t('share_link_error'));
      }
      setLinkState('error');
    }
  }, [getOrCreateShortUrl, tripPlan, t]);

  /** Generate PNG image for sharing. */
  const handleGenerateImage = useCallback(async () => {
    if (!tripPlan || !cardRef.current) return;

    setModalState('generating-image');
    setErrorMessage(null);

    try {
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
      setModalState('image-preview');
    } catch (err) {
      console.error('Card generation failed:', err);
      setErrorMessage(t('share_error'));
      setModalState('share');
    }
  }, [tripPlan, t]);

  /** Share the generated image via Web Share API. */
  const handleShareImage = useCallback(async () => {
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

  const handleDownloadImage = useCallback(() => {
    if (!imageUrl) return;
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = 'evoyage-trip.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [imageUrl]);

  const handleCopyImage = useCallback(async () => {
    if (!imageBlob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': imageBlob })]);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  }, [imageBlob]);

  /** Open the share modal. */
  const handleOpenModal = useCallback(() => {
    setModalState('share');
    setErrorMessage(null);
    setLinkState('idle');
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalState('closed');
    setErrorMessage(null);
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageBlob(null);
    setImageUrl(null);
  }, [imageUrl]);

  // Escape key closes modal + focus trap
  useEffect(() => {
    if (modalState === 'closed') return;
    // Move focus into modal on open
    requestAnimationFrame(() => {
      const firstBtn = modalContentRef.current?.querySelector<HTMLElement>('button');
      firstBtn?.focus();
    });
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { handleCloseModal(); return; }
      if (e.key === 'Tab' && modalContentRef.current) {
        const focusable = modalContentRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modalState, handleCloseModal]);

  const supportsWebShare = typeof navigator !== 'undefined' && !!navigator.share;

  if (!tripPlan) return null;

  const stops = tripPlan.chargingStops.map(getStopInfo);
  const totalTime = tripPlan.totalDurationMin + tripPlan.totalChargingTimeMin;
  const startBattery = tripPlan.batterySegments[0]?.startBatteryPercent ?? 80;
  const stopsLabel = locale === 'vi' ? `${stops.length} điểm sạc` : `${stops.length} stops`;

  const displayStops = stops.length > 6
    ? [...stops.slice(0, 2), { name: locale === 'vi' ? `+${stops.length - 4} điểm dừng khác` : `+${stops.length - 4} more stops`, powerKw: 0, chargeTimeMin: 0, isMore: true as const }, ...stops.slice(-2)]
    : stops;

  return (
    <>
      {/* Hidden card for PNG rendering */}
      <div
        ref={cardRef}
        style={{
          position: 'fixed', left: '-9999px', top: 0,
          width: 1200, height: 630, fontFamily: 'system-ui, -apple-system, sans-serif',
          backgroundColor: '#0d1117', color: '#e6edf3', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{
          width: '100%', height: 380, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, #161b22, #0d1117)', borderBottom: '1px solid #30363d',
          fontSize: 28, color: '#484f58',
        }}>
          {trunc(tripPlan.startAddress, 25)} → {trunc(tripPlan.endAddress, 25)}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 24px', gap: 8 }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            {trunc(tripPlan.startAddress, 50)} → {trunc(tripPlan.endAddress, 50)}
          </div>

          <div style={{ display: 'flex', gap: 24, fontSize: 15, color: '#8b949e' }}>
            <span>{tripPlan.totalDistanceKm} km</span>
            <span>{formatDur(totalTime, locale)}</span>
            <span>{stopsLabel}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, borderTop: '1px solid #21262d', paddingTop: 8, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 20, textAlign: 'center', fontWeight: 700, fontSize: 13, color: '#22c55e' }}>A</span>
              <span style={{ flex: 1, color: '#c9d1d9' }}>{trunc(tripPlan.startAddress, 50)}</span>
              <span style={{ color: '#8b949e', fontSize: 13 }}>{Math.round(startBattery)}%</span>
            </div>

            {displayStops.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 20, textAlign: 'center', fontWeight: 700, fontSize: 13, color: 'isMore' in s ? '#8b949e' : '#eab308' }}>
                  {'isMore' in s ? '...' : '#'}
                </span>
                <span style={{ flex: 1, color: '#c9d1d9' }}>{trunc(s.name, 50)}</span>
                <span style={{ color: '#8b949e', fontSize: 13 }}>
                  {'isMore' in s ? '' : `${s.powerKw}kW | ${s.chargeTimeMin}m`}
                </span>
              </div>
            ))}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 20, textAlign: 'center', fontWeight: 700, fontSize: 13, color: '#ef4444' }}>B</span>
              <span style={{ flex: 1, color: '#c9d1d9' }}>{trunc(tripPlan.endAddress, 50)}</span>
              <span style={{ color: '#8b949e', fontSize: 13 }}>{Math.round(tripPlan.arrivalBatteryPercent)}%</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #21262d', paddingTop: 6 }}>
            <div>
              <div style={{ fontSize: 13, color: '#58a6ff', fontWeight: 600 }}>evoyage.app</div>
              <div style={{ fontSize: 11, color: '#484f58' }}>EV Road Trip Planner</div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: inline share button */}
      {visible && (
        <button
          onClick={handleOpenModal}
          aria-label={t('share_button')}
          className="w-full py-3 rounded-xl font-semibold text-sm border border-[var(--color-accent)]/30 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 transition-all lg:hidden"
        >
          {t('share_button')}
        </button>
      )}

      {/* Desktop: floating share button */}
      <button
        onClick={handleOpenModal}
        aria-label={t('share_button')}
        className={`
          hidden lg:fixed lg:block z-50 right-4 lg:bottom-6
          px-4 py-2.5 rounded-full
          bg-[var(--color-accent)] text-[var(--color-background)]
          font-semibold text-sm
          shadow-lg shadow-[var(--color-accent)]/25
          transition-all duration-300 ease-out
          hover:opacity-90 active:scale-95
          ${visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0 pointer-events-none'}
        `}
      >
        {t('share_button')}
      </button>

      {/* Share Modal */}
      {modalState !== 'closed' && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) handleCloseModal(); }}
          role="dialog" aria-modal="true" aria-label="Share trip"
        >
          <div ref={modalContentRef} className="bg-[var(--color-surface)] rounded-2xl overflow-hidden max-w-lg w-full shadow-2xl relative max-h-[90vh] overflow-y-auto">
            {/* Close button */}
            <button
              onClick={handleCloseModal}
              aria-label="Close"
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors z-10"
            >
              x
            </button>

            <div className="p-4 space-y-4">
              {/* ===== Link Sharing Section ===== */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-[var(--color-foreground)]">
                  {t('share_button')}
                </h3>

                {/* Copy Link + Share Link buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={handleCopyLink}
                    disabled={linkState === 'creating'}
                    title={linkState === 'creating' ? t('share_creating_link') : undefined}
                    className={`
                      flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all
                      ${linkState === 'copied'
                        ? 'bg-green-600 text-white'
                        : 'bg-[var(--color-accent)] text-[var(--color-background)] hover:opacity-90'
                      }
                      disabled:opacity-60
                    `}
                  >
                    {linkState === 'creating' ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        {t('share_creating_link')}
                      </span>
                    ) : linkState === 'copied' ? (
                      t('share_link_copied')
                    ) : (
                      t('share_copy_link')
                    )}
                  </button>

                  {supportsWebShare && (
                    <button
                      onClick={handleShareLink}
                      disabled={linkState === 'creating'}
                      className="flex-1 py-2.5 rounded-xl bg-[var(--color-surface-hover)] text-[var(--color-foreground)] font-semibold text-sm hover:opacity-80 transition-opacity disabled:opacity-60"
                    >
                      {t('share_link')}
                    </button>
                  )}
                </div>

                {/* Error message */}
                {linkState === 'error' && errorMessage && (
                  <div className="p-2.5 bg-[var(--color-danger)]/10 text-[var(--color-danger)] rounded-lg text-xs">
                    {errorMessage}
                  </div>
                )}

                {/* QR Code */}
                {qrDataUrl && (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <img
                      src={qrDataUrl}
                      alt={t('share_qr_code')}
                      className="w-32 h-32 rounded-lg"
                    />
                    <span className="text-xs text-[var(--color-muted)]">{t('share_qr_code')}</span>
                  </div>
                )}
              </div>

              {/* ===== Divider ===== */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-[var(--color-surface-hover)]" />
                <span className="text-xs text-[var(--color-muted)]">{t('share_or_image')}</span>
                <div className="flex-1 h-px bg-[var(--color-surface-hover)]" />
              </div>

              {/* ===== Image Sharing Section ===== */}
              {modalState === 'image-preview' && imageUrl ? (
                <>
                  <div>
                    <img src={imageUrl} alt="Trip share card" className="w-full rounded-lg" />
                  </div>
                  <div className="flex items-center gap-2">
                    {supportsWebShare && (
                      <button onClick={handleShareImage} aria-label={t('share_share')}
                        className="flex-1 py-2.5 rounded-xl bg-[var(--color-accent)] text-[var(--color-background)] font-semibold text-sm hover:opacity-90 transition-opacity">
                        {t('share_share')}
                      </button>
                    )}
                    <button onClick={handleDownloadImage} aria-label={t('share_download')}
                      className="flex-1 py-2.5 rounded-xl bg-[var(--color-surface-hover)] text-[var(--color-foreground)] font-semibold text-sm hover:opacity-80 transition-opacity">
                      {t('share_download')}
                    </button>
                    <button onClick={handleCopyImage} aria-label={t('share_copy')}
                      className="flex-1 py-2.5 rounded-xl bg-[var(--color-surface-hover)] text-[var(--color-foreground)] font-semibold text-sm hover:opacity-80 transition-opacity">
                      {t('share_copy')}
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={handleGenerateImage}
                  disabled={modalState === 'generating-image'}
                  title={modalState === 'generating-image' ? t('share_generating') : undefined}
                  className="w-full py-2.5 rounded-xl bg-[var(--color-surface-hover)] text-[var(--color-foreground)] font-semibold text-sm hover:opacity-80 transition-opacity disabled:opacity-60"
                >
                  {modalState === 'generating-image' ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      {t('share_generating')}
                    </span>
                  ) : (
                    t('share_download')
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
