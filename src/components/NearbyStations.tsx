'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useLocale } from '@/lib/locale';
import { useGeolocation } from '@/hooks/useGeolocation';
import { haversineDistance } from '@/lib/routing/station-finder';
import { hapticLight } from '@/lib/haptics';
import type { ChargingStationData, LatLng } from '@/types';

// ── Types ──

interface NearbyStationsProps {
  readonly onNavigateToStation?: (station: ChargingStationData) => void;
}

interface StationWithDistance extends ChargingStationData {
  readonly distanceKm: number;
}

// ── Constants ──

const RADIUS_OPTIONS = [2, 5, 10, 25] as const;
type RadiusKm = (typeof RADIUS_OPTIONS)[number];

const SPEED_OPTIONS = [
  { value: 0, labelKey: 'nearby_all_speeds' as const },
  { value: 50, labelKey: null, label: '50+ kW' },
  { value: 100, labelKey: null, label: '100+ kW' },
  { value: 150, labelKey: null, label: '150+ kW' },
] as const;

const DEFAULT_RADIUS: RadiusKm = 5;

// ── Helpers ──

/**
 * Calculate bounding box from center point and radius in km.
 * 1 degree latitude ~ 111 km; 1 degree longitude varies by latitude.
 */
function boundsFromRadius(center: LatLng, radiusKm: number): string {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((center.lat * Math.PI) / 180));

  const lat1 = center.lat - latDelta;
  const lng1 = center.lng - lngDelta;
  const lat2 = center.lat + latDelta;
  const lng2 = center.lng + lngDelta;

  return `${lat1},${lng1},${lat2},${lng2}`;
}

function truncateAddress(address: string): string {
  const parts = address.split(',').map((p) => p.trim());
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
  }
  return parts[0] ?? address;
}

function getStatusKey(status: string | null): string {
  if (!status) return 'nearby_active';
  const lower = status.toLowerCase();
  if (lower.includes('available') || lower.includes('active') || lower === 'hoạt động') return 'nearby_active';
  if (lower.includes('busy') || lower.includes('in use') || lower === 'bận') return 'nearby_busy';
  return 'nearby_inactive';
}

function getStatusColor(statusKey: string): string {
  switch (statusKey) {
    case 'nearby_active': return 'text-green-500';
    case 'nearby_busy': return 'text-amber-500';
    case 'nearby_inactive': return 'text-red-400';
    default: return 'text-[var(--color-muted)]';
  }
}

function openGoogleMapsDirections(lat: number, lng: number): void {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function getUniqueConnectorTypes(stations: readonly ChargingStationData[]): readonly string[] {
  const connectors = new Set<string>();
  for (const station of stations) {
    for (const ct of station.connectorTypes) {
      connectors.add(ct);
    }
  }
  return Array.from(connectors).sort();
}

function getUniqueProviders(stations: readonly ChargingStationData[]): readonly string[] {
  const providers = new Set<string>();
  for (const station of stations) {
    if (station.provider) {
      providers.add(station.provider);
    }
  }
  return Array.from(providers).sort();
}

// ── Sub-components ──

function RadiusSelector({
  radius,
  onRadiusChange,
}: {
  readonly radius: RadiusKm;
  readonly onRadiusChange: (r: RadiusKm) => void;
}) {
  const { t } = useLocale();

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-[var(--color-muted)]">{t('nearby_radius' as Parameters<typeof t>[0])}</p>
      <div className="flex gap-1.5">
        {RADIUS_OPTIONS.map((r) => (
          <button
            key={r}
            onClick={() => { hapticLight(); onRadiusChange(r); }}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
              radius === r
                ? 'bg-[var(--color-accent)] text-[var(--color-background)] font-semibold'
                : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-foreground)]'
            }`}
          >
            {r} km
          </button>
        ))}
      </div>
    </div>
  );
}

function FilterPanel({
  connectorTypes,
  selectedConnectors,
  onToggleConnector,
  minSpeed,
  onMinSpeedChange,
  providers,
  selectedProviders,
  onToggleProvider,
}: {
  readonly connectorTypes: readonly string[];
  readonly selectedConnectors: ReadonlySet<string>;
  readonly onToggleConnector: (ct: string) => void;
  readonly minSpeed: number;
  readonly onMinSpeedChange: (speed: number) => void;
  readonly providers: readonly string[];
  readonly selectedProviders: ReadonlySet<string>;
  readonly onToggleProvider: (provider: string) => void;
}) {
  const { t } = useLocale();
  const [isOpen, setIsOpen] = useState(false);

  const activeFilterCount =
    selectedConnectors.size + (minSpeed > 0 ? 1 : 0) + selectedProviders.size;

  return (
    <div className="space-y-2">
      <button
        onClick={() => { hapticLight(); setIsOpen((prev) => !prev); }}
        className="flex items-center gap-2 text-xs text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
      >
        <span>{t('nearby_filters' as Parameters<typeof t>[0])}</span>
        {activeFilterCount > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-[var(--color-accent)] text-[var(--color-background)] text-[10px] font-semibold">
            {activeFilterCount}
          </span>
        )}
        <span className="text-[10px]">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="space-y-3 p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-muted)]/10">
          {/* Connector types */}
          {connectorTypes.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-[var(--color-muted)]">
                {t('nearby_connector_type' as Parameters<typeof t>[0])}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {connectorTypes.map((ct) => (
                  <button
                    key={ct}
                    onClick={() => { hapticLight(); onToggleConnector(ct); }}
                    className={`px-2.5 py-1.5 rounded-full text-xs transition-all ${
                      selectedConnectors.has(ct)
                        ? 'bg-[var(--color-accent)] text-[var(--color-background)]'
                        : 'bg-[var(--color-background)] text-[var(--color-muted)] hover:text-[var(--color-foreground)] border border-[var(--color-muted)]/20'
                    }`}
                  >
                    {ct}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Min charging speed */}
          <div className="space-y-1.5">
            <p className="text-xs text-[var(--color-muted)]">kW</p>
            <div className="flex flex-wrap gap-1.5">
              {SPEED_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { hapticLight(); onMinSpeedChange(opt.value); }}
                  className={`px-2.5 py-1.5 rounded-full text-xs transition-all ${
                    minSpeed === opt.value
                      ? 'bg-[var(--color-accent)] text-[var(--color-background)]'
                      : 'bg-[var(--color-background)] text-[var(--color-muted)] hover:text-[var(--color-foreground)] border border-[var(--color-muted)]/20'
                  }`}
                >
                  {opt.labelKey ? t(opt.labelKey as Parameters<typeof t>[0]) : opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Providers */}
          {providers.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-[var(--color-muted)]">
                {t('nearby_provider' as Parameters<typeof t>[0])}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {providers.map((p) => (
                  <button
                    key={p}
                    onClick={() => { hapticLight(); onToggleProvider(p); }}
                    className={`px-2.5 py-1.5 rounded-full text-xs transition-all ${
                      selectedProviders.has(p)
                        ? 'bg-[var(--color-accent)] text-[var(--color-background)]'
                        : 'bg-[var(--color-background)] text-[var(--color-muted)] hover:text-[var(--color-foreground)] border border-[var(--color-muted)]/20'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StationCard({
  station,
  onNavigate,
}: {
  readonly station: StationWithDistance;
  readonly onNavigate: () => void;
}) {
  const { t } = useLocale();
  const statusKey = getStatusKey(station.chargingStatus);
  const statusColor = getStatusColor(statusKey);

  return (
    <div className="p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-muted)]/10 space-y-2.5">
      {/* Header: name + distance */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--color-foreground)] leading-tight">
            {station.name}
          </h3>
          <p className="text-xs text-[var(--color-muted)] mt-0.5" title={station.address}>
            {truncateAddress(station.address)}
          </p>
        </div>
        <span className="flex-shrink-0 text-xs font-medium text-[var(--color-accent)]">
          {t('nearby_km_away' as Parameters<typeof t>[0], { distance: station.distanceKm.toFixed(1) })}
        </span>
      </div>

      {/* Details row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-muted)]">
        <span>{station.provider}</span>
        <span>{station.maxPowerKw} kW</span>
        <span>{t('nearby_ports' as Parameters<typeof t>[0], { count: station.portCount })}</span>
        <span className={statusColor}>
          {t(statusKey as Parameters<typeof t>[0])}
        </span>
      </div>

      {/* Connector pills */}
      {station.connectorTypes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {station.connectorTypes.map((ct) => (
            <span
              key={ct}
              className="px-2 py-0.5 rounded-full text-[10px] bg-[var(--color-background)] text-[var(--color-muted)] border border-[var(--color-muted)]/15"
            >
              {ct}
            </span>
          ))}
        </div>
      )}

      {/* Navigate button */}
      <button
        onClick={onNavigate}
        className="w-full py-2.5 rounded-xl text-sm font-medium bg-[var(--color-accent)] text-[var(--color-background)] hover:opacity-90 active:scale-[0.98] transition-all"
      >
        {t('nearby_navigate' as Parameters<typeof t>[0])}
      </button>
    </div>
  );
}

// ── Main Component ──

export default function NearbyStations({ onNavigateToStation }: NearbyStationsProps) {
  const { t } = useLocale();
  const { latitude, longitude, loading: geoLoading, error: geoError, requestLocation, clearError } = useGeolocation();

  // State
  const [radius, setRadius] = useState<RadiusKm>(DEFAULT_RADIUS);
  const [stations, setStations] = useState<readonly ChargingStationData[]>([]);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters
  const [selectedConnectors, setSelectedConnectors] = useState<ReadonlySet<string>>(new Set());
  const [minSpeed, setMinSpeed] = useState(0);
  const [selectedProviders, setSelectedProviders] = useState<ReadonlySet<string>>(new Set());

  // Derived: unique filter options from raw data
  const connectorTypes = useMemo(() => getUniqueConnectorTypes(stations), [stations]);
  const providers = useMemo(() => getUniqueProviders(stations), [stations]);

  // Fetch stations when location + radius change
  useEffect(() => {
    if (latitude === null || longitude === null) return;

    const controller = new AbortController();
    const center: LatLng = { lat: latitude, lng: longitude };
    const bounds = boundsFromRadius(center, radius);

    setFetchLoading(true);
    setFetchError(null);

    fetch(`/api/stations?bounds=${bounds}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { stations: ChargingStationData[] }) => {
        setStations(data.stations);
      })
      .catch((err) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setFetchError(err instanceof Error ? err.message : 'Failed to fetch stations');
      })
      .finally(() => {
        setFetchLoading(false);
      });

    return () => controller.abort();
  }, [latitude, longitude, radius]);

  // Compute filtered + sorted stations with distance
  const filteredStations: readonly StationWithDistance[] = useMemo(() => {
    if (latitude === null || longitude === null) return [];
    const center: LatLng = { lat: latitude, lng: longitude };

    return stations
      .map((s) => ({
        ...s,
        distanceKm: haversineDistance(center, { lat: s.latitude, lng: s.longitude }),
      }))
      .filter((s) => s.distanceKm <= radius)
      .filter((s) => selectedConnectors.size === 0 || s.connectorTypes.some((ct) => selectedConnectors.has(ct)))
      .filter((s) => s.maxPowerKw >= minSpeed)
      .filter((s) => selectedProviders.size === 0 || selectedProviders.has(s.provider))
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [stations, latitude, longitude, radius, selectedConnectors, minSpeed, selectedProviders]);

  // Handlers
  const handleToggleConnector = useCallback((ct: string) => {
    setSelectedConnectors((prev) => {
      const next = new Set(prev);
      if (next.has(ct)) {
        next.delete(ct);
      } else {
        next.add(ct);
      }
      return next;
    });
  }, []);

  const handleToggleProvider = useCallback((provider: string) => {
    setSelectedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) {
        next.delete(provider);
      } else {
        next.add(provider);
      }
      return next;
    });
  }, []);

  const handleNavigate = useCallback((station: ChargingStationData) => {
    hapticLight();
    onNavigateToStation?.(station);
    openGoogleMapsDirections(station.latitude, station.longitude);
  }, [onNavigateToStation]);

  const handleRadiusChange = useCallback((r: RadiusKm) => {
    setRadius(r);
  }, []);

  const isLoading = geoLoading || fetchLoading;
  const hasLocation = latitude !== null && longitude !== null;

  // Geolocation error messages
  const geoErrorMessage = useMemo(() => {
    if (!geoError) return null;
    return t('nearby_location_denied' as Parameters<typeof t>[0]);
  }, [geoError, t]);

  return (
    <div className="space-y-4">
      {/* Title */}
      <h2 className="text-base font-bold font-[family-name:var(--font-heading)] text-[var(--color-foreground)]">
        {t('nearby_title' as Parameters<typeof t>[0])}
      </h2>

      {/* Location request button (shown when no location yet) */}
      {!hasLocation && !isLoading && (
        <div className="space-y-3">
          <button
            onClick={() => { hapticLight(); clearError(); requestLocation(); }}
            className="w-full py-3.5 rounded-xl font-bold font-[family-name:var(--font-heading)] text-sm bg-[var(--color-accent)] text-[var(--color-background)] hover:opacity-90 active:scale-[0.98] transition-all"
          >
            {t('nearby_find' as Parameters<typeof t>[0])}
          </button>

          {geoErrorMessage && (
            <div className="p-3 rounded-lg bg-[var(--color-danger)]/10 text-[var(--color-danger)] text-sm">
              {geoErrorMessage}
            </div>
          )}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <span className="w-4 h-4 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
            {t('nearby_searching' as Parameters<typeof t>[0])}
          </div>
        </div>
      )}

      {/* Main content (after location acquired) */}
      {hasLocation && !isLoading && (
        <div className="space-y-4">
          {/* Radius selector */}
          <RadiusSelector radius={radius} onRadiusChange={handleRadiusChange} />

          {/* Filters */}
          <FilterPanel
            connectorTypes={connectorTypes}
            selectedConnectors={selectedConnectors}
            onToggleConnector={handleToggleConnector}
            minSpeed={minSpeed}
            onMinSpeedChange={setMinSpeed}
            providers={providers}
            selectedProviders={selectedProviders}
            onToggleProvider={handleToggleProvider}
          />

          {/* Fetch error */}
          {fetchError && (
            <div className="p-3 rounded-lg bg-[var(--color-danger)]/10 text-[var(--color-danger)] text-sm">
              {fetchError}
            </div>
          )}

          {/* Results count */}
          {!fetchError && (
            <p className="text-xs text-[var(--color-muted)]">
              {filteredStations.length === 0
                ? t('nearby_no_results' as Parameters<typeof t>[0], { radius: String(radius) })
                : t('nearby_results_count' as Parameters<typeof t>[0], { count: String(filteredStations.length) })}
            </p>
          )}

          {/* Station list */}
          <div className="space-y-3">
            {filteredStations.map((station) => (
              <StationCard
                key={station.id}
                station={station}
                onNavigate={() => handleNavigate(station)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
