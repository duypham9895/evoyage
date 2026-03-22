'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useLocale } from '@/lib/locale';
import type { ChargingStationData } from '@/types';

type GeolocationErrorType = 'permission_denied' | 'position_unavailable' | 'timeout';

interface NearbyStationWithDistance extends ChargingStationData {
  readonly distanceKm: number;
}

interface MapLocateButtonProps {
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly loading: boolean;
  readonly error: GeolocationErrorType | null;
  readonly geolocationSupported: boolean;
  readonly onRequestLocation: () => void;
  readonly onStationsFound: (stations: readonly NearbyStationWithDistance[]) => void;
  readonly onSwitchToStationsTab: () => void;
}

type ButtonState = 'default' | 'loading' | 'located' | 'error';

export default function MapLocateButton({
  latitude,
  longitude,
  loading,
  error,
  geolocationSupported,
  onRequestLocation,
  onStationsFound,
  onSwitchToStationsTab,
}: MapLocateButtonProps) {
  const { t } = useLocale();
  const [buttonState, setButtonState] = useState<ButtonState>('default');
  const [infoBar, setInfoBar] = useState<{
    count: number;
    radius: number;
  } | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hide button if geolocation not supported
  if (!geolocationSupported) return null;

  const handleTap = useCallback(() => {
    setFetchError(false);
    setInfoBar(null);
    onRequestLocation();
  }, [onRequestLocation]);

  // When location is acquired, fetch nearby stations
  useEffect(() => {
    if (loading) {
      setButtonState('loading');
      return;
    }

    if (error) {
      setButtonState('error');
      // Auto-reset error state after 5s
      const timer = setTimeout(() => setButtonState('default'), 5000);
      return () => clearTimeout(timer);
    }

    if (latitude == null || longitude == null) return;

    setButtonState('located');

    // Fetch stations
    const radius = 5;
    const degBuffer = radius / 80;
    const bounds = [
      latitude - degBuffer,
      longitude - degBuffer,
      latitude + degBuffer,
      longitude + degBuffer,
    ].join(',');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    fetch(`/api/stations?bounds=${bounds}`, { signal: controller.signal })
      .then((res) => {
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error('Fetch failed');
        return res.json();
      })
      .then((data) => {
        const stations = (data.stations ?? []) as ChargingStationData[];
        // Compute distance and filter by radius
        const withDistance: NearbyStationWithDistance[] = stations
          .map((s) => {
            const dLat = ((s.latitude - latitude) * Math.PI) / 180;
            const dLng = ((s.longitude - longitude) * Math.PI) / 180;
            const a =
              Math.sin(dLat / 2) ** 2 +
              Math.cos((latitude * Math.PI) / 180) *
                Math.cos((s.latitude * Math.PI) / 180) *
                Math.sin(dLng / 2) ** 2;
            const distanceKm = 2 * 6371 * Math.asin(Math.sqrt(a));
            return { ...s, distanceKm: Math.round(distanceKm * 10) / 10 };
          })
          .filter((s) => s.distanceKm <= radius)
          .sort((a, b) => a.distanceKm - b.distanceKm);

        onStationsFound(withDistance);
        setInfoBar({ count: withDistance.length, radius });
        setFetchError(false);

        // Auto-dismiss info bar after 10s
        if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
        autoDismissRef.current = setTimeout(() => setInfoBar(null), 10000);
      })
      .catch(() => {
        setFetchError(true);
        onStationsFound([]);
      });

    // Reset located state after 3s
    const locatedTimer = setTimeout(() => setButtonState('default'), 3000);

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
      clearTimeout(locatedTimer);
      if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    };
  }, [latitude, longitude, loading, error, onStationsFound]);

  const borderColor =
    buttonState === 'located'
      ? 'border-[#5B9BFF]'
      : buttonState === 'error' || fetchError
        ? 'border-[var(--color-danger)]'
        : 'border-[var(--color-accent)]';

  // GPS error toasts
  const errorMessage =
    error === 'permission_denied'
      ? t('nearby_gps_denied')
      : error === 'position_unavailable'
        ? t('nearby_gps_unavailable')
        : error === 'timeout'
          ? t('nearby_gps_timeout')
          : null;

  return (
    <>
      {/* Locate button */}
      <button
        onClick={handleTap}
        disabled={loading}
        aria-label={t('nearby_locate_button')}
        className={`absolute bottom-20 right-4 z-10 w-11 h-11 rounded-xl bg-[var(--color-surface)] border-[1.5px] ${borderColor} flex items-center justify-center transition-all active:scale-95 shadow-lg`}
      >
        {buttonState === 'loading' ? (
          <span className="w-5 h-5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke={buttonState === 'located' ? '#5B9BFF' : 'var(--color-accent)'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          </svg>
        )}
      </button>

      {/* GPS error toast */}
      {errorMessage && (
        <div className="absolute bottom-32 right-4 left-4 z-10 p-3 bg-[var(--color-surface)] border border-[var(--color-danger)] rounded-xl text-sm text-[var(--color-text-secondary)] shadow-lg flex items-center justify-between gap-2">
          <span>{errorMessage}</span>
          <button
            onClick={handleTap}
            className="text-[var(--color-accent)] text-sm font-medium whitespace-nowrap"
          >
            {t('nearby_gps_unavailable').includes('Thử') ? 'Thử lại' : 'Retry'}
          </button>
        </div>
      )}

      {/* Fetch error toast */}
      {fetchError && !errorMessage && (
        <div className="absolute bottom-32 right-4 left-4 z-10 p-3 bg-[var(--color-surface)] border border-[var(--color-danger)] rounded-xl text-sm text-[var(--color-text-secondary)] shadow-lg flex items-center justify-between gap-2">
          <span>{t('nearby_fetch_error')}</span>
          <button
            onClick={handleTap}
            className="text-[var(--color-accent)] text-sm font-medium whitespace-nowrap"
          >
            {t('nearby_fetch_error').includes('Thử') ? 'Thử lại' : 'Retry'}
          </button>
        </div>
      )}

      {/* Info bar at bottom of map */}
      {infoBar && (
        <div className="absolute bottom-0 left-0 right-0 z-10 px-4 py-3 bg-[var(--color-surface)]/85 backdrop-blur-md flex items-center justify-between">
          <span className="text-sm text-[var(--color-text)]">
            {infoBar.count > 0
              ? t('nearby_info_bar')
                  .replace('{{count}}', String(infoBar.count))
                  .replace('{{radius}}', String(infoBar.radius))
              : t('nearby_info_bar_empty').replace('{{radius}}', String(infoBar.radius))}
          </span>
          <div className="flex items-center gap-3">
            {infoBar.count > 0 && (
              <button
                onClick={onSwitchToStationsTab}
                className="text-sm text-[var(--color-accent)] font-medium"
              >
                {t('nearby_info_bar_link')}
              </button>
            )}
            <button
              onClick={() => setInfoBar(null)}
              className="text-[var(--color-muted)] hover:text-[var(--color-text)]"
              aria-label="Close"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
