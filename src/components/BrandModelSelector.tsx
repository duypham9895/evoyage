'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocale } from '@/lib/locale';
import type { EVVehicleData } from '@/types';

interface BrandModelSelectorProps {
  readonly selectedVehicle: EVVehicleData | null;
  readonly onSelect: (vehicle: EVVehicleData | null) => void;
  readonly onCustomCarClick: () => void;
}

export default function BrandModelSelector({
  selectedVehicle,
  onSelect,
  onCustomCarClick,
}: BrandModelSelectorProps) {
  const { t } = useLocale();
  const [vehicles, setVehicles] = useState<readonly EVVehicleData[]>([]);
  const [vietnamOnly, setVietnamOnly] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchVehicles = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        vietnamOnly: vietnamOnly.toString(),
      });
      if (searchQuery) {
        params.set('q', searchQuery);
      }

      const res = await fetch(`/api/vehicles?${params}`);
      const data = await res.json();
      setVehicles(data.vehicles ?? []);
    } catch (err) {
      console.error('Failed to fetch vehicles:', err);
    } finally {
      setIsLoading(false);
    }
  }, [vietnamOnly, searchQuery]);

  useEffect(() => {
    const timer = setTimeout(fetchVehicles, 300);
    return () => clearTimeout(timer);
  }, [fetchVehicles]);

  // Group vehicles by brand
  const grouped = vehicles.reduce<Record<string, EVVehicleData[]>>((acc, v) => {
    const brand = v.brand;
    if (!acc[brand]) acc[brand] = [];
    acc[brand].push(v);
    return acc;
  }, {});

  const displayName = (v: EVVehicleData) =>
    v.variant ? `${v.model} ${v.variant}` : v.model;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold font-[family-name:var(--font-heading)] text-[var(--color-muted)] uppercase tracking-wider">
        {t('select_vehicle')}
      </h2>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-[var(--color-background)] rounded-xl">
        <button
          onClick={() => setVietnamOnly(true)}
          className={`flex-1 px-3 py-2.5 text-sm rounded-lg transition-colors ${
            vietnamOnly
              ? 'bg-[var(--color-accent)] text-[var(--color-background)] font-semibold'
              : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)]'
          }`}
        >
          {t('vietnam_tab')}
        </button>
        <button
          onClick={() => setVietnamOnly(false)}
          className={`flex-1 px-3 py-2.5 text-sm rounded-lg transition-colors ${
            !vietnamOnly
              ? 'bg-[var(--color-accent)] text-[var(--color-background)] font-semibold'
              : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)]'
          }`}
        >
          {t('all_evs_tab')}
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder={t('search_vehicles')}
        className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-surface-hover)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)] transition-colors placeholder:text-[var(--color-muted)]"
      />

      {/* Vehicle list */}
      <div className="max-h-56 overflow-y-auto space-y-1 scrollbar-thin">
        {isLoading ? (
          <div className="text-center py-4 text-sm text-[var(--color-muted)]">
            {t('loading')}
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-center py-4 text-sm text-[var(--color-muted)]">
            {t('no_vehicles_found')}
          </div>
        ) : (
          Object.entries(grouped).map(([brand, models]) => (
            <div key={brand}>
              <div className="text-xs font-semibold text-[var(--color-muted)] px-2 py-1 sticky top-0 bg-[var(--color-surface)]">
                {brand}
              </div>
              {models.map((v) => (
                <button
                  key={v.id}
                  onClick={() => onSelect(v)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between transition-colors ${
                    selectedVehicle?.id === v.id
                      ? 'bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/30 text-[var(--color-accent)]'
                      : 'hover:bg-[var(--color-surface-hover)]'
                  }`}
                >
                  <span>
                    {displayName(v)}
                    {v.bodyType && (
                      <span className="text-xs text-[var(--color-muted)] ml-2">
                        {v.bodyType}
                      </span>
                    )}
                  </span>
                  <span className="text-xs font-[family-name:var(--font-mono)] text-[var(--color-muted)]">
                    {v.officialRangeKm}km
                  </span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Custom car button */}
      <button
        onClick={onCustomCarClick}
        className="w-full px-3 py-2 text-sm border border-dashed border-[var(--color-surface-hover)] rounded-lg text-[var(--color-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] transition-colors"
      >
        {t('car_not_listed')}
      </button>

      {/* Selected vehicle summary */}
      {selectedVehicle && (
        <div className="p-3 bg-[var(--color-background)] rounded-lg border border-[var(--color-surface-hover)]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold">
              {selectedVehicle.brand} {displayName(selectedVehicle)}
            </span>
            {selectedVehicle.priceVndMillions && (
              <span className="text-xs text-[var(--color-muted)]">
                {selectedVehicle.priceVndMillions}M VND
              </span>
            )}
          </div>
          <div className="flex gap-3 text-xs text-[var(--color-muted)]">
            <span className="font-[family-name:var(--font-mono)]">
              🔋 {selectedVehicle.batteryCapacityKwh} kWh
            </span>
            <span className="font-[family-name:var(--font-mono)]">
              📏 {selectedVehicle.officialRangeKm} km
            </span>
            {selectedVehicle.dcMaxChargingPowerKw && (
              <span className="font-[family-name:var(--font-mono)]">
                ⚡ {selectedVehicle.dcMaxChargingPowerKw} kW
              </span>
            )}
          </div>
          {selectedVehicle.brand !== 'VinFast' && (
            <div className="mt-2 text-xs text-[var(--color-warn)] bg-[var(--color-warn)]/10 px-2 py-1 rounded">
              {t('vinfast_warning')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
