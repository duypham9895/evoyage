'use client';

import { useState } from 'react';
import { useLocale } from '@/lib/locale';
import type { VinFastDetailResponse, VinFastStationDetailData } from '@/types';

interface StationDetailExpanderProps {
  readonly stationId: string;
  readonly stationProvider: string;
}

type FetchState = 'idle' | 'loading' | 'done' | 'no-data' | 'error';

function ConnectorSection({ evses }: { evses: VinFastStationDetailData['evses'] }) {
  const { t } = useLocale();

  if (evses.length === 0) return null;

  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] font-semibold">
        {t('station_section_connectors')}
      </p>
      {evses.map((evse, i) => (
        <div key={i} className="flex items-center gap-2 bg-[var(--color-surface)] rounded px-2 py-1">
          <span className="w-4 h-4 rounded bg-[var(--color-surface-hover)] text-[10px] font-bold flex items-center justify-center shrink-0">
            {i + 1}
          </span>
          <div className="flex flex-wrap gap-1">
            {evse.connectors.map((c, j) => (
              <span key={j} className="text-[var(--color-foreground)]">
                {t('station_connector', {
                  type: c.standard.replace('IEC_62196_', ''),
                  power: String(Math.round(c.max_electric_power / 1000)),
                })}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function HardwareSection({
  hardwareStations,
}: {
  hardwareStations: VinFastStationDetailData['hardwareStations'];
}) {
  const { t } = useLocale();

  if (hardwareStations.length === 0) return null;

  const hw = hardwareStations[0];

  return (
    <div className="text-[var(--color-muted)]">
      {t('station_hardware', { vendor: hw.vendor, model: hw.modelCode })}
    </div>
  );
}

function ImagesSection({ images }: { images: VinFastStationDetailData['images'] }) {
  const { t } = useLocale();

  if (images.length === 0) return null;

  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] font-semibold">
        {t('station_section_images')}
      </p>
      <div className="flex gap-2 overflow-x-auto">
        {images.slice(0, 3).map((img, i) => (
          <img
            key={i}
            src={img.url}
            alt={`Station photo ${i + 1}`}
            className="w-20 h-14 object-cover rounded shrink-0"
            loading="lazy"
          />
        ))}
      </div>
    </div>
  );
}

function LastUpdatedRow({ fetchedAt }: { fetchedAt: string }) {
  const { t } = useLocale();

  const formatted = (() => {
    try {
      return new Date(fetchedAt).toLocaleString();
    } catch {
      return fetchedAt;
    }
  })();

  return (
    <div className="text-[10px] text-[var(--color-muted)]">
      {t('station_last_updated', { time: formatted })}
    </div>
  );
}

function DetailContent({ detail }: { detail: VinFastStationDetailData }) {
  return (
    <div className="space-y-2 text-xs">
      <ConnectorSection evses={detail.evses} />
      <HardwareSection hardwareStations={detail.hardwareStations} />
      <ImagesSection images={detail.images} />
      <LastUpdatedRow fetchedAt={detail.fetchedAt} />
    </div>
  );
}

export default function StationDetailExpander({
  stationId,
  stationProvider,
}: StationDetailExpanderProps) {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [detail, setDetail] = useState<VinFastStationDetailData | null>(null);

  // Only render for VinFast stations
  if (stationProvider !== 'VinFast') return null;

  const handleToggle = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }

    // Reuse cached data if already fetched successfully
    if (detail !== null) {
      setExpanded(true);
      return;
    }

    // Don't retry if we already know there's no data
    if (fetchState === 'no-data' || fetchState === 'error') {
      return;
    }

    setFetchState('loading');

    try {
      const res = await fetch(`/api/stations/${stationId}/vinfast-detail`);
      if (!res.ok) {
        setFetchState('error');
        return;
      }

      const data: VinFastDetailResponse = await res.json();

      if (!data.detail) {
        // API returned 200 but no detail (fallback) — not a real error
        setFetchState('no-data');
        return;
      }

      setDetail(data.detail);
      setFetchState('done');
      setExpanded(true);
    } catch {
      setFetchState('error');
    }
  };

  const isLoading = fetchState === 'loading';
  const isNoData = fetchState === 'no-data';
  const isError = fetchState === 'error';

  const buttonLabel = isLoading
    ? t('station_detail_loading')
    : expanded
      ? t('station_detail_collapse')
      : t('station_detail_expand');

  return (
    <div>
      <div className="inline-flex items-center gap-2">
        <button
          onClick={handleToggle}
          disabled={isLoading || isNoData || isError}
          className="text-[10px] px-2 py-0.5 rounded bg-[var(--color-surface-hover)] text-[var(--color-accent)] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {buttonLabel}
        </button>

        {isNoData && (
          <span className="text-[10px] text-[var(--color-muted)] italic">
            {t('station_detail_no_data')}
          </span>
        )}

        {isError && (
          <span className="text-[10px] text-[var(--color-danger)]/60 italic">
            {t('station_detail_temp_unavailable')}
          </span>
        )}
      </div>

      {expanded && detail !== null && (
        <div className="mt-2 p-2 bg-[var(--color-surface-hover)]/50 rounded">
          <DetailContent detail={detail} />
        </div>
      )}
    </div>
  );
}
