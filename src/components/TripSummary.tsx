'use client';

import { useLocale } from '@/lib/locale';
import type { TripPlan } from '@/types';

interface TripSummaryProps {
  readonly tripPlan: TripPlan | null;
  readonly isLoading: boolean;
}

export default function TripSummary({ tripPlan, isLoading }: TripSummaryProps) {
  const { t } = useLocale();

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
        {t('Tóm tắt hành trình', 'Trip Summary')}
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
              {t('Khoảng cách', 'Distance')}
            </div>
            <div className="text-xl font-bold font-[family-name:var(--font-mono)] text-[var(--color-foreground)]">
              {tripPlan.totalDistanceKm} km
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--color-muted)]">
              {t('Tổng thời gian', 'Total time')}
            </div>
            <div className="text-xl font-bold font-[family-name:var(--font-mono)] text-[var(--color-foreground)]">
              {hours}h{minutes > 0 ? `${minutes}m` : ''}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--color-muted)]">
              {t('Lái xe', 'Driving')}
            </div>
            <div className="text-sm font-[family-name:var(--font-mono)]">
              {driveHours}h{driveMinutes > 0 ? `${driveMinutes}m` : ''}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--color-muted)]">
              {t('Sạc pin', 'Charging')}
            </div>
            <div className="text-sm font-[family-name:var(--font-mono)]">
              {tripPlan.totalChargingTimeMin}m ({tripPlan.chargingStops.length}{' '}
              {t('điểm', 'stops')})
            </div>
          </div>
        </div>

        {/* Battery journey bar */}
        <div>
          <div className="text-xs text-[var(--color-muted)] mb-2">
            {t('Hành trình pin', 'Battery journey')}
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
              {t('Xuất phát', 'Start')}{' '}
              {tripPlan.batterySegments[0]?.startBatteryPercent}%
            </span>
            <span>
              {t('Đến', 'Arrive')} {tripPlan.arrivalBatteryPercent}%
            </span>
          </div>
        </div>

        {/* No charging needed */}
        {tripPlan.chargingStops.length === 0 && tripPlan.warnings.length === 0 && (
          <div className="p-3 bg-[var(--color-safe)]/10 text-[var(--color-safe)] rounded-lg text-sm">
            {t(
              '✅ Không cần sạc! Bạn đủ pin cho chuyến đi.',
              '✅ No charging needed! You have enough range.',
            )}
          </div>
        )}

        {/* Warnings */}
        {tripPlan.warnings.map((w, i) => (
          <div
            key={i}
            className="p-3 bg-[var(--color-warn)]/10 text-[var(--color-warn)] rounded-lg text-sm"
          >
            {t(w.messageVi, w.messageEn)}
          </div>
        ))}
      </div>

      {/* Charging stops list */}
      {tripPlan.chargingStops.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">
            {t('Điểm sạc', 'Charging Stops')}
          </h3>
          {tripPlan.chargingStops.map((stop, i) => (
            <div
              key={i}
              className="p-3 bg-[var(--color-surface)] rounded-lg border border-[var(--color-surface-hover)]"
            >
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[var(--color-accent)] text-[var(--color-background)] text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-sm font-semibold">{stop.station.name}</span>
                </div>
                <span className="text-xs text-[var(--color-muted)]">
                  {Math.round(stop.distanceFromStartKm)} km
                </span>
              </div>
              <div className="ml-8 space-y-1">
                <div className="text-xs text-[var(--color-muted)]">
                  {stop.station.address}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-[family-name:var(--font-mono)] text-[var(--color-danger)]">
                    {stop.arrivalBatteryPercent}%
                  </span>
                  <span className="text-[var(--color-muted)]">→</span>
                  <span className="font-[family-name:var(--font-mono)] text-[var(--color-safe)]">
                    {stop.departureBatteryPercent}%
                  </span>
                  <span className="text-[var(--color-muted)]">
                    ~{stop.estimatedChargingTimeMin}min
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
                  <span>⚡ {stop.station.maxPowerKw}kW</span>
                  <span>|</span>
                  <span>{stop.station.connectorTypes.join(', ')}</span>
                  <span>|</span>
                  <span
                    className={
                      stop.station.provider === 'VinFast'
                        ? 'text-[var(--color-safe)]'
                        : 'text-[var(--color-accent)]'
                    }
                  >
                    {stop.station.provider}
                  </span>
                </div>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${stop.station.latitude},${stop.station.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-1 px-3 py-1 text-xs bg-[var(--color-accent)] text-[var(--color-background)] rounded-md font-semibold hover:opacity-90 transition-opacity"
                >
                  {t('Chỉ đường', 'Navigate')}
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <div className="text-[10px] text-[var(--color-muted)] leading-relaxed p-2">
        {t(
          'Quãng đường thực tế có thể thay đổi tùy vào tốc độ, điều hòa, địa hình và tải trọng. Ứng dụng sử dụng 80% quãng đường công bố của nhà sản xuất để đảm bảo an toàn.',
          'Real-world range varies based on speed, AC, terrain, and load. App uses 80% of manufacturer\'s published range for safety.',
        )}
      </div>
    </div>
  );
}
