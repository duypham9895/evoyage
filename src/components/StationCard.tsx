'use client';

import { useCallback } from 'react';
import { useLocale } from '@/lib/locale';
import { hapticLight } from '@/lib/haptics';
import { emitStationHighlight } from '@/lib/events/station-events';
import { trackStationTapped } from '@/lib/analytics';
import type { NearbyStationInfo } from '@/lib/evi/types';

// ── Status Color Mapping ──

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'text-[var(--color-safe)]',
  active: 'text-[var(--color-safe)]',
  BUSY: 'text-[var(--color-warn)]',
  busy: 'text-[var(--color-warn)]',
  UNAVAILABLE: 'text-[var(--color-muted)]',
  unavailable: 'text-[var(--color-muted)]',
  INACTIVE: 'text-[var(--color-muted)]',
  inactive: 'text-[var(--color-muted)]',
};

const STATUS_KEYS: Record<string, string> = {
  ACTIVE: 'nearby_active',
  active: 'nearby_active',
  BUSY: 'nearby_busy',
  busy: 'nearby_busy',
  UNAVAILABLE: 'nearby_inactive',
  unavailable: 'nearby_inactive',
  INACTIVE: 'nearby_inactive',
  inactive: 'nearby_inactive',
};

// ── Component ──

interface StationCardProps {
  readonly station: NearbyStationInfo;
}

export default function StationCard({ station }: StationCardProps) {
  const { t } = useLocale();

  const handleShowOnMap = useCallback(() => {
    hapticLight();
    const stationId = `${station.latitude}-${station.longitude}`;
    emitStationHighlight({
      stationId,
      latitude: station.latitude,
      longitude: station.longitude,
    });
    // Analytics: opaque ID + provider category only — no coords, no name.
    try {
      trackStationTapped(stationId, station.provider);
    } catch { /* analytics never breaks the flow */ }
  }, [station.latitude, station.longitude, station.provider]);

  const statusColor = station.chargingStatus
    ? (STATUS_COLORS[station.chargingStatus] ?? 'text-[var(--color-muted)]')
    : 'text-[var(--color-muted)]';

  const statusKey = station.chargingStatus
    ? (STATUS_KEYS[station.chargingStatus] ?? 'map_status_unknown')
    : 'map_status_unknown';

  const statusLabel = t(statusKey as Parameters<typeof t>[0]);

  return (
    <div className="rounded-xl p-3 bg-[var(--color-background)] border border-[var(--color-border)] space-y-2">
      {/* Header: name + distance */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--color-foreground)] leading-tight">
          {station.name}
        </span>
        <span className="text-xs text-[var(--color-accent)] whitespace-nowrap flex-shrink-0">
          {station.distanceKm} km
        </span>
      </div>

      {/* Details row */}
      <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
        <span>{station.maxPowerKw} kW</span>
        <span className={statusColor}>{statusLabel}</span>
        {station.estimatedChargeTimeMin != null && (
          <span>~{station.estimatedChargeTimeMin} min</span>
        )}
      </div>

      {/* Compatibility */}
      {station.isCompatible !== null && station.isCompatible !== undefined && (
        <div className={`text-xs ${station.isCompatible ? 'text-[var(--color-safe)]' : 'text-[var(--color-danger)]'}`}>
          {station.isCompatible
            ? t('nearby_compatible' as Parameters<typeof t>[0])
            : t('nearby_not_compatible' as Parameters<typeof t>[0])}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleShowOnMap}
          className="flex-1 py-1.5 px-3 rounded-lg text-xs font-medium bg-[var(--color-accent-subtle)] border border-[var(--color-accent)]/20 text-[var(--color-accent)] hover:bg-[rgba(0,212,170,0.25)] transition-colors"
        >
          {t('evi_show_on_map' as Parameters<typeof t>[0])}
        </button>
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 py-1.5 px-3 rounded-lg text-xs font-medium text-center bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
        >
          {t('nearby_navigate' as Parameters<typeof t>[0])}
        </a>
      </div>
    </div>
  );
}
