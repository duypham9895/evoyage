'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocale } from '@/lib/locale';
import type { VinFastStationDetail } from '@/lib/vinfast-client';
import StationDetailSkeleton from './StationDetailSkeleton';

interface StationDetailExpanderProps {
  readonly stationId: string;
  readonly stationProvider: string;
}

type Stage = 'idle' | 'connecting' | 'fetching' | 'retrying' | 'parsing' | 'done' | 'error';

const STAGE_PROGRESS: Record<Stage, number> = {
  idle: 0,
  connecting: 10,
  fetching: 30,
  retrying: 50,
  parsing: 80,
  done: 100,
  error: 0,
};

const RETRY_COOLDOWN_MS = 30_000;

function formatStaleAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function ConnectorSection({ evses }: { evses: VinFastStationDetail['evses'] }) {
  const { t } = useLocale();
  if (evses.length === 0) return null;

  return (
    <div className="space-y-1 animate-fadeIn">
      <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] font-semibold">
        {t('station_section_connectors')}
      </p>
      {evses.map((evse, i) => (
        <div
          key={i}
          className="flex items-center gap-2 bg-[var(--color-surface)] rounded px-2 py-1 animate-fadeIn"
          style={{ animationDelay: `${i * 50}ms` }}
        >
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
  hardwareStations: VinFastStationDetail['hardwareStations'];
}) {
  const { t } = useLocale();
  if (hardwareStations.length === 0) return null;

  return (
    <div className="text-[var(--color-muted)] animate-fadeIn">
      {hardwareStations.map((hw, i) => (
        <div key={i}>
          {t('station_hardware', { vendor: hw.vendor, model: hw.modelCode })}
        </div>
      ))}
    </div>
  );
}

function ImagesSection({ images }: { images: VinFastStationDetail['images'] }) {
  const { t } = useLocale();
  if (images.length === 0) return null;

  return (
    <div className="space-y-1 animate-fadeIn" style={{ animationDelay: '100ms' }}>
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
    try { return new Date(fetchedAt).toLocaleString(); }
    catch { return fetchedAt; }
  })();

  return (
    <div className="text-[10px] text-[var(--color-muted)] animate-fadeIn">
      {t('station_last_updated', { time: formatted })}
    </div>
  );
}

function DetailContent({
  detail,
  isStale,
  isBasic,
  staleAge,
}: {
  detail: VinFastStationDetail;
  isStale: boolean;
  isBasic: boolean;
  staleAge: number;
}) {
  const { t } = useLocale();

  return (
    <div className="space-y-2 text-xs">
      {isStale && (
        <div className="text-[10px] px-2 py-0.5 bg-yellow-500/10 text-yellow-600 rounded inline-block">
          {t('station_detail_stale', { time: formatStaleAge(staleAge) })}
        </div>
      )}
      {isBasic && (
        <div className="text-[10px] px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded inline-block">
          {t('station_detail_basic_info')}
        </div>
      )}
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
  const [stage, setStage] = useState<Stage>('idle');
  const [message, setMessage] = useState('');
  const [detail, setDetail] = useState<VinFastStationDetail | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [isBasic, setIsBasic] = useState(false);
  const [staleAge, setStaleAge] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  if (stationProvider !== 'VinFast') return null;

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) { setStage('idle'); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  const isStreaming = stage === 'connecting' || stage === 'fetching' || stage === 'retrying' || stage === 'parsing';

  const handleToggle = useCallback(async () => {
    if (expanded && stage === 'done') { setExpanded(false); return; }
    if (detail !== null && stage === 'done') { setExpanded(true); return; }
    if (isStreaming) return;
    if (stage === 'error' && cooldownRemaining > 0) return;

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStage('connecting');
    setMessage(t('station_detail_connecting'));
    setExpanded(true);

    try {
      const res = await fetch(`/api/stations/${stationId}/vinfast-detail`, {
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        setStage('error');
        setMessage(t('station_detail_temp_unavailable'));
        setCooldownRemaining(RETRY_COOLDOWN_MS / 1000);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const match = line.match(/^data: (.+)$/m);
          if (!match) continue;

          try {
            const event = JSON.parse(match[1]);

            if (event.stage) {
              setStage(event.stage as Stage);
              const stageMessages: Record<string, string> = {
                connecting: t('station_detail_connecting'),
                fetching: t('station_detail_fetching'),
                retrying: t('station_detail_retrying'),
                parsing: t('station_detail_parsing'),
                error: t('station_detail_temp_unavailable'),
              };
              const msg = stageMessages[event.stage as string];
              if (msg) setMessage(msg);
            }

            if (event.detail) {
              setDetail(event.detail as VinFastStationDetail);
              setIsStale(!!event.stale);
              setIsBasic(!!event.basic);
              setStaleAge(event.staleAgeMs ?? 0);
            }

            if (event.stage === 'error') {
              setCooldownRemaining(RETRY_COOLDOWN_MS / 1000);
            }
          } catch {
            // skip malformed events
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setStage('error');
        setMessage(t('station_detail_temp_unavailable'));
        setCooldownRemaining(RETRY_COOLDOWN_MS / 1000);
      }
    }
  }, [stationId, expanded, stage, detail, isStreaming, cooldownRemaining, t]);

  const buttonLabel = isStreaming
    ? t('station_detail_loading')
    : expanded && stage === 'done'
      ? t('station_detail_collapse')
      : t('station_detail_expand');

  const isButtonDisabled = isStreaming || (stage === 'error' && cooldownRemaining > 0);

  return (
    <div>
      <div className="inline-flex items-center gap-2">
        <button
          onClick={handleToggle}
          disabled={isButtonDisabled}
          className="text-[10px] px-2 py-0.5 rounded bg-[var(--color-surface-hover)] text-[var(--color-accent)] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {buttonLabel}
        </button>

        {stage === 'error' && cooldownRemaining > 0 && (
          <span className="text-[10px] text-[var(--color-danger)]/60 italic">
            {t('station_detail_retry_after', { seconds: String(cooldownRemaining) })}
          </span>
        )}
      </div>

      {expanded && (
        <div className="mt-2 p-2 bg-[var(--color-surface-hover)]/50 rounded">
          {isStreaming && (
            <StationDetailSkeleton
              message={message}
              progress={STAGE_PROGRESS[stage]}
            />
          )}
          {stage === 'done' && detail !== null && (
            <DetailContent detail={detail} isStale={isStale} isBasic={isBasic} staleAge={staleAge} />
          )}
          {stage === 'error' && !detail && (
            <div className="text-[10px] text-[var(--color-danger)]/60 italic p-2">
              {message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
