'use client';

import { useState } from 'react';
import { useLocale } from '@/lib/locale';
import type { VinFastDetailResponse, VinFastStationDetailData } from '@/types';

interface VinFastDetailPanelProps {
  readonly stationId: string;
  readonly stationProvider: string;
}

const STATUS_COLORS: Record<string, string> = {
  Available: 'text-[var(--color-safe)] bg-[var(--color-safe)]/10',
  ACTIVE: 'text-[var(--color-safe)] bg-[var(--color-safe)]/10',
  Busy: 'text-[var(--color-warn)] bg-[var(--color-warn)]/10',
  BUSY: 'text-[var(--color-warn)] bg-[var(--color-warn)]/10',
  Unavailable: 'text-[var(--color-danger)] bg-[var(--color-danger)]/10',
  UNAVAILABLE: 'text-[var(--color-danger)] bg-[var(--color-danger)]/10',
  INACTIVE: 'text-[var(--color-muted)] bg-[var(--color-surface-hover)]',
};

function StatusBadge({ status }: { status: string }) {
  const { t } = useLocale();
  const colorClass = STATUS_COLORS[status] ?? 'text-[var(--color-muted)] bg-[var(--color-surface-hover)]';
  const label =
    status === 'Available' || status === 'ACTIVE' ? t('vinfast_status_available')
    : status === 'Busy' || status === 'BUSY' ? t('vinfast_status_busy')
    : t('vinfast_status_unavailable');

  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${colorClass}`}>
      {label}
    </span>
  );
}

function DetailContent({ detail }: { detail: VinFastStationDetailData }) {
  const { t } = useLocale();

  return (
    <div className="space-y-2 text-xs">
      {/* Status + 24h */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[var(--color-muted)]">{t('vinfast_status')}:</span>
        <StatusBadge status={detail.depotStatus} />
        {detail.is24h && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-[var(--color-accent)] bg-[var(--color-accent)]/10">
            {t('vinfast_24h')}
          </span>
        )}
      </div>

      {/* Ports */}
      <div className="text-[var(--color-muted)]">
        {t('vinfast_ports', { count: String(detail.portCount) })}
        {' · '}
        {detail.parkingFee ? t('vinfast_parking_fee') : t('vinfast_no_parking_fee')}
      </div>

      {/* Connectors per EVSE */}
      {detail.evses.length > 0 && (
        <div className="space-y-1">
          {detail.evses.map((evse, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-[var(--color-surface-hover)] text-[10px] font-bold flex items-center justify-center">
                {i + 1}
              </span>
              {evse.connectors.map((c, j) => (
                <span key={j} className="text-[var(--color-foreground)]">
                  {t('vinfast_connector', {
                    type: c.standard.replace('IEC_62196_', ''),
                    power: String(Math.round(c.max_electric_power / 1000)),
                  })}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Hardware info */}
      {detail.hardwareStations.length > 0 && (
        <div className="text-[var(--color-muted)]">
          {t('vinfast_hardware', {
            vendor: detail.hardwareStations[0].vendor,
            model: detail.hardwareStations[0].modelCode,
          })}
        </div>
      )}

      {/* Address breakdown */}
      {detail.commune && (
        <div className="text-[var(--color-muted)]">
          {[detail.commune, detail.district, detail.province].filter(Boolean).join(', ')}
        </div>
      )}

      {/* Images */}
      {detail.images.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pt-1">
          {detail.images.slice(0, 3).map((img, i) => (
            <img
              key={i}
              src={img.url}
              alt={`Station photo ${i + 1}`}
              className="w-20 h-14 object-cover rounded"
              loading="lazy"
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function VinFastDetailPanel({ stationId, stationProvider }: VinFastDetailPanelProps) {
  const { t } = useLocale();
  const [detail, setDetail] = useState<VinFastStationDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [error, setError] = useState(false);

  // Only show for VinFast stations
  if (stationProvider !== 'VinFast') return null;

  const handleFetchDetail = async () => {
    if (fetched || loading) return;
    setLoading(true);
    setError(false);

    try {
      const res = await fetch(`/api/stations/${stationId}/vinfast-detail`);
      if (!res.ok) {
        setError(true);
        return;
      }

      const data: VinFastDetailResponse = await res.json();
      setDetail(data.detail ?? null);
      if (!data.detail) setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setFetched(true);
    }
  };

  if (!fetched) {
    return (
      <button
        onClick={handleFetchDetail}
        disabled={loading}
        className="mt-1 text-[10px] text-[var(--color-accent)] hover:underline disabled:opacity-50"
      >
        {loading ? t('vinfast_detail_loading') : t('vinfast_detail')}
      </button>
    );
  }

  if (error || !detail) {
    return (
      <div className="mt-1 text-[10px] text-[var(--color-muted)]">
        {t('vinfast_detail_unavailable')}
      </div>
    );
  }

  return (
    <div className="mt-2 p-2 bg-[var(--color-surface-hover)]/50 rounded">
      <DetailContent detail={detail} />
    </div>
  );
}
