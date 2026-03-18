'use client';

import type { ChargingStationData } from '@/types';
import { useLocale } from '@/lib/locale';

interface StationInfoChipsProps {
  readonly station: ChargingStationData;
}

type StatusKey = 'ACTIVE' | 'BUSY' | 'UNAVAILABLE' | 'INACTIVE';

const STATUS_LOCALE_KEY: Record<StatusKey, string> = {
  ACTIVE: 'station_status_active',
  BUSY: 'station_status_busy',
  UNAVAILABLE: 'station_status_unavailable',
  INACTIVE: 'station_status_inactive',
};

const STATUS_STYLE: Record<StatusKey, string> = {
  ACTIVE: 'text-[color:var(--color-safe)] border-[color:var(--color-safe)]',
  BUSY: 'text-[color:var(--color-warn)] border-[color:var(--color-warn)]',
  UNAVAILABLE: 'text-[color:var(--color-danger)] border-[color:var(--color-danger)]',
  INACTIVE: 'text-[color:var(--color-muted)] border-[color:var(--color-muted)]',
};

function isStatusKey(val: string): val is StatusKey {
  return val in STATUS_LOCALE_KEY;
}

function BaseChip({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      role="listitem"
      className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-md border ${className}`}
    >
      {children}
    </span>
  );
}

export default function StationInfoChips({ station }: StationInfoChipsProps) {
  const { t } = useLocale();

  const {
    chargingStatus,
    maxPowerKw,
    connectorTypes,
    portCount,
    operatingHours,
    parkingFee,
  } = station;

  const normalizedStatus = chargingStatus?.toUpperCase() ?? null;

  return (
    <div
      role="list"
      aria-label="Station info"
      className="flex flex-wrap gap-1.5"
    >
      {/* Status badge */}
      {normalizedStatus !== null && isStatusKey(normalizedStatus) && (
        <span
          role="listitem"
          data-status={normalizedStatus}
          aria-label={`Status: ${t(STATUS_LOCALE_KEY[normalizedStatus] as Parameters<typeof t>[0])}`}
          className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border font-medium ${STATUS_STYLE[normalizedStatus]}`}
        >
          {t(STATUS_LOCALE_KEY[normalizedStatus] as Parameters<typeof t>[0])}
        </span>
      )}

      {/* Power chip */}
      <BaseChip
        className="text-[color:var(--color-accent)] border-[color:var(--color-accent)]"
      >
        <span aria-hidden="true">⚡</span>
        <span>{maxPowerKw} kW</span>
      </BaseChip>

      {/* Connectors chip */}
      {connectorTypes.length > 0 && (
        <BaseChip className="text-[color:var(--color-foreground)] border-[color:var(--color-surface-hover)]">
          {connectorTypes.join(' · ')}
        </BaseChip>
      )}

      {/* Port count chip */}
      <BaseChip className="text-[color:var(--color-foreground)] border-[color:var(--color-surface-hover)]">
        {t('station_ports', { count: String(portCount) })}
      </BaseChip>

      {/* Operating hours chip */}
      {operatingHours !== null && (
        operatingHours === '24/7' ? (
          <span
            role="listitem"
            aria-label="Operating hours: 24/7"
            className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border text-blue-400 border-blue-400 font-medium"
          >
            {t('station_hours_24h')}
          </span>
        ) : (
          <BaseChip className="text-[color:var(--color-foreground)] border-[color:var(--color-surface-hover)]">
            {operatingHours}
          </BaseChip>
        )
      )}

      {/* Parking chip */}
      {parkingFee !== null && (
        <BaseChip
          className={
            parkingFee === false
              ? 'text-[color:var(--color-safe)] border-[color:var(--color-safe)]'
              : 'text-[color:var(--color-warn)] border-[color:var(--color-warn)]'
          }
        >
          {parkingFee === false ? t('station_parking_free') : t('station_parking_paid')}
        </BaseChip>
      )}
    </div>
  );
}
