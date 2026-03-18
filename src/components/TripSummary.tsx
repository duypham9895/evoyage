'use client';

import { useState } from 'react';
import { useLocale } from '@/lib/locale';
import type { TripPlan, ChargingStop, RankedStation } from '@/types';
import VinFastDetailPanel from './VinFastDetailPanel';

interface TripSummaryProps {
  readonly tripPlan: TripPlan | null;
  readonly isLoading: boolean;
  readonly onSelectAlternativeStation?: (stopIndex: number, station: RankedStation) => void;
}

export default function TripSummary({ tripPlan, isLoading, onSelectAlternativeStation }: TripSummaryProps) {
  const { t, tBi } = useLocale();
  const [expandedStops, setExpandedStops] = useState<Set<number>>(new Set());

  const toggleExpanded = (index: number) => {
    setExpandedStops(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="p-4 bg-[var(--color-surface)] rounded-lg animate-pulse">
        <div className="h-4 bg-[var(--color-surface-hover)] rounded w-3/4 mb-3" />
        <div className="h-8 bg-[var(--color-surface-hover)] rounded w-1/2 mb-2" />
        <div className="h-4 bg-[var(--color-surface-hover)] rounded w-full" />
      </div>
    );
  }

  if (!tripPlan) return null;

  const totalTimeMin = tripPlan.totalDurationMin + tripPlan.totalChargingTimeMin;
  const hours = Math.floor(totalTimeMin / 60);
  const minutes = totalTimeMin % 60;
  const driveHours = Math.floor(tripPlan.totalDurationMin / 60);
  const driveMinutes = tripPlan.totalDurationMin % 60;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold font-[family-name:var(--font-heading)] text-[var(--color-muted)] uppercase tracking-wider">
        {t('trip_summary')}
      </h2>

      <div className="p-4 bg-[var(--color-surface)] rounded-lg space-y-3">
        {/* Route */}
        <div className="text-sm text-[var(--color-muted)]">
          {tripPlan.startAddress} → {tripPlan.endAddress}
        </div>

        {/* Key stats */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-[var(--color-muted)]">
              {t('distance')}
            </div>
            <div className="text-xl font-bold font-[family-name:var(--font-mono)] text-[var(--color-foreground)]">
              {tripPlan.totalDistanceKm} km
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--color-muted)]">
              {t('total_time')}
            </div>
            <div className="text-xl font-bold font-[family-name:var(--font-mono)] text-[var(--color-foreground)]">
              {hours}h{minutes > 0 ? `${minutes}m` : ''}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--color-muted)]">
              {t('driving')}
            </div>
            <div className="text-sm font-[family-name:var(--font-mono)]">
              {driveHours}h{driveMinutes > 0 ? `${driveMinutes}m` : ''}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--color-muted)]">
              {t('charging')}
            </div>
            <div className="text-sm font-[family-name:var(--font-mono)]">
              {tripPlan.totalChargingTimeMin}m ({tripPlan.chargingStops.length}{' '}
              {t('stops')})
            </div>
          </div>
        </div>

        {/* Battery journey bar */}
        <div>
          <div className="text-xs text-[var(--color-muted)] mb-2">
            {t('battery_journey')}
          </div>
          <div className="flex h-7 rounded-full overflow-hidden bg-[var(--color-surface-hover)]">
            {tripPlan.batterySegments.map((seg, i) => {
              const widthPercent =
                ((seg.endKm - seg.startKm) / tripPlan.totalDistanceKm) * 100;
              const avgBattery = (seg.startBatteryPercent + seg.endBatteryPercent) / 2;
              const color =
                avgBattery > 50
                  ? 'bg-[var(--color-safe)]'
                  : avgBattery > 25
                    ? 'bg-[var(--color-warn)]'
                    : 'bg-[var(--color-danger)]';

              return (
                <div
                  key={i}
                  className={`${color} flex items-center justify-center text-[10px] font-bold text-[var(--color-background)] border-r border-[var(--color-background)] last:border-r-0`}
                  style={{ width: `${widthPercent}%` }}
                  title={seg.label}
                >
                  {widthPercent > 10 && `${Math.round(seg.endBatteryPercent)}%`}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-[var(--color-muted)] mt-1">
            <span>
              {t('start')}{' '}
              {tripPlan.batterySegments[0]?.startBatteryPercent}%
            </span>
            <span>
              {t('arrive')} {tripPlan.arrivalBatteryPercent}%
            </span>
          </div>
        </div>

        {/* No charging needed */}
        {tripPlan.chargingStops.length === 0 && tripPlan.warnings.length === 0 && (
          <div className="p-3 bg-[var(--color-safe)]/10 text-[var(--color-safe)] rounded-lg text-sm">
            {t('no_charging_needed')}
          </div>
        )}

        {/* Warnings */}
        {tripPlan.warnings.map((w, i) => (
          <div
            key={i}
            className="p-3 bg-[var(--color-warn)]/10 text-[var(--color-warn)] rounded-lg text-sm"
          >
            {tBi(w)}
          </div>
        ))}
      </div>

      {/* Charging stops list */}
      {tripPlan.chargingStops.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">
            {t('charging_stops')}
          </h3>
          {tripPlan.chargingStops.map((stop, i) => {
            // Support both old ChargingStop and new ChargingStopWithAlternatives
            const hasAlternatives = 'selected' in stop;
            const station = hasAlternatives ? stop.selected.station : stop.station;
            const arrivalBattery = hasAlternatives ? stop.batteryPercentAtArrival : stop.arrivalBatteryPercent;
            const departureBattery = hasAlternatives ? stop.batteryPercentAfterCharge : stop.departureBatteryPercent;
            const chargeTime = hasAlternatives ? stop.selected.estimatedChargeTimeMin : stop.estimatedChargingTimeMin;
            const distanceKm = hasAlternatives ? stop.distanceAlongRouteKm : stop.distanceFromStartKm;
            const rank = hasAlternatives ? stop.selected.rank : undefined;
            const alternatives = hasAlternatives ? stop.alternatives : [];
            const isExpanded = expandedStops.has(i);

            const rankLabel = rank === 'best' ? t('stations_best')
              : rank === 'ok' ? t('stations_ok')
              : rank === 'slow' ? t('stations_slow')
              : null;

            const rankColor = rank === 'best' ? 'text-[var(--color-safe)] bg-[var(--color-safe)]/10'
              : rank === 'ok' ? 'text-[var(--color-warn)] bg-[var(--color-warn)]/10'
              : rank === 'slow' ? 'text-[var(--color-danger)] bg-[var(--color-danger)]/10'
              : '';

            return (
              <div key={i} className="bg-[var(--color-surface)] rounded-lg border border-[var(--color-surface-hover)] overflow-hidden">
                <div className="p-3">
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[var(--color-accent)] text-[var(--color-background)] text-xs font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <span className="text-sm font-semibold">{station.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {rankLabel && (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${rankColor}`}>
                          {rankLabel}
                        </span>
                      )}
                      <span className="text-xs text-[var(--color-muted)]">
                        {Math.round(distanceKm)} km
                      </span>
                    </div>
                  </div>
                  <div className="ml-8 space-y-1">
                    <div className="text-xs text-[var(--color-muted)]">
                      {station.address}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-[family-name:var(--font-mono)] text-[var(--color-danger)]">
                        {Math.round(arrivalBattery)}%
                      </span>
                      <span className="text-[var(--color-muted)]">→</span>
                      <span className="font-[family-name:var(--font-mono)] text-[var(--color-safe)]">
                        {Math.round(departureBattery)}%
                      </span>
                      <span className="text-[var(--color-muted)]">
                        ~{Math.round(chargeTime)}min
                      </span>
                    </div>
                    {hasAlternatives && stop.selected.detourDriveTimeSec > 0 && (
                      <div className="text-xs text-[var(--color-muted)]">
                        {t('stations_detour', { time: String(Math.round(stop.selected.detourDriveTimeSec * 2 / 60)) })}
                        {' · '}
                        {t('stations_total_time', { time: String(Math.round(stop.selected.totalStopTimeMin)) })}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
                      <span>⚡ {station.maxPowerKw}kW</span>
                      <span>|</span>
                      <span>{station.connectorTypes.join(', ')}</span>
                      <span>|</span>
                      <span
                        className={
                          station.provider === 'VinFast'
                            ? 'text-[var(--color-safe)]'
                            : 'text-[var(--color-accent)]'
                        }
                      >
                        {station.provider}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block px-3 py-1 text-xs bg-[var(--color-accent)] text-[var(--color-background)] rounded-md font-semibold hover:opacity-90 transition-opacity"
                      >
                        {t('navigate')}
                      </a>
                    </div>
                    <VinFastDetailPanel stationId={station.id} stationProvider={station.provider} />
                  </div>
                </div>

                {/* Expandable alternatives */}
                {alternatives.length > 0 && (
                  <>
                    <button
                      onClick={() => toggleExpanded(i)}
                      className="w-full px-3 py-2 text-xs text-[var(--color-accent)] hover:bg-[var(--color-surface-hover)] transition-colors border-t border-[var(--color-surface-hover)] flex items-center justify-center gap-1"
                    >
                      <span>{isExpanded ? '▲' : '▼'}</span>
                      <span>{t('stations_view_alternatives', { count: String(alternatives.length) })}</span>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-[var(--color-surface-hover)]">
                        {alternatives.map((alt, j) => {
                          const altRankLabel = alt.rank === 'ok' ? t('stations_ok') : t('stations_slow');
                          const altRankColor = alt.rank === 'ok'
                            ? 'text-[var(--color-warn)] bg-[var(--color-warn)]/10'
                            : 'text-[var(--color-danger)] bg-[var(--color-danger)]/10';

                          return (
                            <button
                              key={j}
                              onClick={() => onSelectAlternativeStation?.(i, alt)}
                              className="w-full p-3 text-left hover:bg-[var(--color-surface-hover)] transition-colors border-b border-[var(--color-surface-hover)] last:border-b-0"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm">{alt.station.name}</span>
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${altRankColor}`}>
                                  {altRankLabel}
                                </span>
                              </div>
                              <div className="text-xs text-[var(--color-muted)] mt-1">
                                {t('stations_detour', { time: String(Math.round(alt.detourDriveTimeSec * 2 / 60)) })}
                                {' · '}
                                {alt.station.connectorTypes.join(', ')}
                                {' · '}
                                {alt.station.maxPowerKw}kW
                                {' · '}
                                {t('stations_total_time', { time: String(Math.round(alt.totalStopTimeMin)) })}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Disclaimer */}
      <div className="text-[10px] text-[var(--color-muted)] leading-relaxed p-2">
        {t('disclaimer')}
      </div>
    </div>
  );
}
