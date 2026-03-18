'use client';

import { useState, useCallback, useEffect } from 'react';
import { z } from 'zod';
import dynamic from 'next/dynamic';
import { LocaleProvider } from '@/lib/locale';
import { useLocale } from '@/lib/locale';
import { MapModeProvider, useMapMode } from '@/lib/map-mode';
import { useIsMobile } from '@/hooks/useIsMobile';
import Header from '@/components/Header';
import TripInput from '@/components/TripInput';
import BrandModelSelector from '@/components/BrandModelSelector';
import AddCustomVehicle from '@/components/AddCustomVehicle';
import BatteryStatusPanel from '@/components/BatteryStatusPanel';
import TripSummary from '@/components/TripSummary';
import ShareButton from '@/components/ShareButton';
import MobileBottomSheet from '@/components/MobileBottomSheet';
import MobileTabBar, { type MobileTab } from '@/components/MobileTabBar';
import type { EVVehicleData, CustomVehicleInput, TripPlan } from '@/types';
import type { NominatimResult } from '@/lib/nominatim';
import type { WaypointData } from '@/components/WaypointInput';
import {
  DEFAULT_RANGE_SAFETY_FACTOR,
  DEFAULT_CURRENT_BATTERY,
  DEFAULT_MIN_ARRIVAL,
} from '@/types';

// Both map components must be loaded client-side only (use window/document)
const LeafletMap = dynamic(() => import('@/components/Map'), { ssr: false });
const GoogleMap = dynamic(() => import('@/components/GoogleMap'), { ssr: false });
const MapboxMap = dynamic(() => import('@/components/MapboxMap'), { ssr: false });

function HomeContent() {
  const { mode } = useMapMode();
  const { t, locale } = useLocale();
  const isMobile = useIsMobile();

  // Mobile tab state
  const [activeTab, setActiveTab] = useState<MobileTab>('route');

  // Trip inputs
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  // Store coordinates from Nominatim for Google mode
  const [startCoords, setStartCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [endCoords, setEndCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Waypoints
  const [waypoints, setWaypoints] = useState<WaypointData[]>([]);
  const [isLoopTrip, setIsLoopTrip] = useState(false);

  // Vehicle
  const [selectedVehicle, setSelectedVehicle] = useState<EVVehicleData | null>(null);
  const [customVehicle, setCustomVehicle] = useState<CustomVehicleInput | null>(null);
  const [showCustomForm, setShowCustomForm] = useState(false);

  // Battery
  const [currentBattery, setCurrentBattery] = useState(DEFAULT_CURRENT_BATTERY);
  const [minArrival, setMinArrival] = useState(DEFAULT_MIN_ARRIVAL);
  const [rangeSafetyFactor, setRangeSafetyFactor] = useState(DEFAULT_RANGE_SAFETY_FACTOR);

  // Trip result
  const [tripPlan, setTripPlan] = useState<TripPlan | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load persisted state from localStorage
  useEffect(() => {
    const savedRSF = localStorage.getItem('ev-planner-rsf');
    if (savedRSF) {
      const val = parseFloat(savedRSF);
      if (!isNaN(val) && val >= 0.5 && val <= 1.0) {
        setRangeSafetyFactor(val);
      }
    }

    const savedCustom = localStorage.getItem('ev-planner-custom-vehicle');
    if (savedCustom) {
      const customSchema = z.object({
        brand: z.string().min(1).max(100),
        model: z.string().min(1).max(100),
        batteryCapacityKwh: z.number().positive().max(300),
        officialRangeKm: z.number().positive().max(2000),
        chargingTimeDC_10to80_min: z.number().positive().optional(),
        chargingPortType: z.string().optional(),
      });
      try {
        const result = customSchema.safeParse(JSON.parse(savedCustom));
        if (result.success) {
          setCustomVehicle(result.data);
        }
      } catch { /* ignore invalid JSON */ }
    }
  }, []);

  // Persist RSF to localStorage
  const handleRSFChange = useCallback((val: number) => {
    setRangeSafetyFactor(val);
    localStorage.setItem('ev-planner-rsf', val.toString());
  }, []);

  // Save custom vehicle
  const handleSaveCustomVehicle = useCallback((vehicle: CustomVehicleInput) => {
    setCustomVehicle(vehicle);
    setSelectedVehicle(null);
    localStorage.setItem('ev-planner-custom-vehicle', JSON.stringify(vehicle));
  }, []);

  // Select DB vehicle (clears custom)
  const handleSelectVehicle = useCallback((vehicle: EVVehicleData | null) => {
    setSelectedVehicle(vehicle);
    setCustomVehicle(null);
  }, []);

  // Capture coordinates from Nominatim selection
  const handleStartSelect = useCallback((result: NominatimResult) => {
    setStartCoords({ lat: result.lat, lng: result.lng });
  }, []);

  const handleEndSelect = useCallback((result: NominatimResult) => {
    setEndCoords({ lat: result.lat, lng: result.lng });
  }, []);

  // Clear coords when text input changes manually
  const handleStartChange = useCallback((value: string) => {
    setStart(value);
    setStartCoords(null);
  }, []);

  const handleEndChange = useCallback((value: string) => {
    setEnd(value);
    setEndCoords(null);
  }, []);

  // Waypoint handlers
  const handleAddWaypoint = useCallback((afterIndex: number) => {
    setWaypoints(prev => {
      const next = [...prev];
      next.splice(afterIndex + 1, 0, { name: '', coords: null });
      return next;
    });
  }, []);

  const handleRemoveWaypoint = useCallback((index: number) => {
    setWaypoints(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpdateWaypoint = useCallback((index: number, name: string, coords: { lat: number; lng: number } | null) => {
    setWaypoints(prev => prev.map((wp, i) => i === index ? { name, coords } : wp));
  }, []);

  const handleReorderWaypoints = useCallback((fromIndex: number, toIndex: number) => {
    setWaypoints(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const handleToggleLoop = useCallback(() => {
    setIsLoopTrip(prev => {
      if (!prev && start) {
        // When enabling loop, set end to start
        setEnd(start);
        setEndCoords(startCoords);
      }
      return !prev;
    });
  }, [start, startCoords]);

  // Plan trip — POST to /api/route
  const handlePlanTrip = useCallback(async () => {
    if (!start || !end) {
      setError('Please enter start and end locations');
      return;
    }
    if (!selectedVehicle && !customVehicle) {
      setError('Please select a vehicle');
      return;
    }

    setIsPlanning(true);
    setError(null);
    setTripPlan(null);

    try {
      const response = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: isLoopTrip ? start : start,
          end: isLoopTrip ? start : end,
          startLat: startCoords?.lat,
          startLng: startCoords?.lng,
          endLat: isLoopTrip ? startCoords?.lat : endCoords?.lat,
          endLng: isLoopTrip ? startCoords?.lng : endCoords?.lng,
          vehicleId: selectedVehicle?.id ?? null,
          customVehicle: selectedVehicle ? null : customVehicle,
          currentBatteryPercent: currentBattery,
          minArrivalPercent: minArrival,
          rangeSafetyFactor,
          provider: mode === 'google' ? 'google' : mode === 'mapbox' ? 'mapbox' : 'osrm',
          waypoints: waypoints
            .filter(wp => wp.coords)
            .map(wp => ({
              lat: wp.coords!.lat,
              lng: wp.coords!.lng,
              name: wp.name,
            })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? 'Route calculation failed');
      }

      setTripPlan(data as TripPlan);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsPlanning(false);
    }
  }, [start, end, startCoords, endCoords, selectedVehicle, customVehicle, currentBattery, minArrival, rangeSafetyFactor, mode]);

  const activeVehicle = selectedVehicle ?? customVehicle;
  const canPlan = Boolean(start && end && activeVehicle && !isPlanning);

  // Shared controls content
  const planButton = (
    <button
      onClick={handlePlanTrip}
      disabled={!canPlan}
      className={`w-full py-3.5 rounded-xl font-bold font-[family-name:var(--font-heading)] text-base transition-all ${
        canPlan
          ? 'bg-[var(--color-accent)] text-[var(--color-background)] hover:opacity-90 active:scale-[0.98]'
          : 'bg-[var(--color-surface-hover)] text-[var(--color-muted)] cursor-not-allowed'
      }`}
    >
      {isPlanning ? (
        <span className="flex items-center justify-center gap-2">
          <span className="w-4 h-4 border-2 border-[var(--color-background)] border-t-transparent rounded-full animate-spin" />
          {t('planning')}
        </span>
      ) : (
        t('plan_trip_button')
      )}
    </button>
  );

  const errorDisplay = error ? (
    <div className="p-3 bg-[var(--color-danger)]/10 text-[var(--color-danger)] rounded-lg text-sm">
      {error}
    </div>
  ) : null;

  // Map component
  const mapContent = (
    <>
      {mode === 'google' ? (
        <GoogleMap tripPlan={tripPlan} />
      ) : mode === 'mapbox' ? (
        <MapboxMap tripPlan={tripPlan} />
      ) : (
        <LeafletMap tripPlan={tripPlan} />
      )}
    </>
  );

  // ─── Mobile Layout ─────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="h-[100dvh] flex flex-col relative">
        <Header />

        {/* Full-screen map — isolate stacking context so Leaflet z-indexes don't escape */}
        <main className="flex-1 relative isolate z-0">
          {mapContent}
        </main>

        {/* Bottom sheet with tabbed controls */}
        <MobileBottomSheet initialSnap="half">
          <MobileTabBar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            hasVehicle={Boolean(activeVehicle)}
            hasRoute={Boolean(start && end)}
          />

          {/* Tab content */}
          <div className="space-y-4">
            {activeTab === 'route' && (
              <>
                <TripInput
                  start={start}
                  end={end}
                  onStartChange={handleStartChange}
                  onEndChange={handleEndChange}
                  onStartSelect={handleStartSelect}
                  onEndSelect={handleEndSelect}
                  isLoaded={true}
                  waypoints={waypoints}
                  onAddWaypoint={handleAddWaypoint}
                  onRemoveWaypoint={handleRemoveWaypoint}
                  onUpdateWaypoint={handleUpdateWaypoint}
                  onReorderWaypoints={handleReorderWaypoints}
                  isLoopTrip={isLoopTrip}
                  onToggleLoop={handleToggleLoop}
                />
                {tripPlan && <TripSummary tripPlan={tripPlan} isLoading={isPlanning} />}
              </>
            )}

            {activeTab === 'vehicle' && (
              <BrandModelSelector
                selectedVehicle={selectedVehicle}
                onSelect={handleSelectVehicle}
                onCustomCarClick={() => setShowCustomForm(true)}
              />
            )}

            {activeTab === 'battery' && (
              <BatteryStatusPanel
                vehicle={activeVehicle}
                currentBattery={currentBattery}
                minArrival={minArrival}
                rangeSafetyFactor={rangeSafetyFactor}
                onCurrentBatteryChange={setCurrentBattery}
                onMinArrivalChange={setMinArrival}
                onRangeSafetyFactorChange={handleRSFChange}
              />
            )}

            {/* Plan button always visible */}
            {planButton}
            {errorDisplay}
          </div>
        </MobileBottomSheet>

        {/* Share button */}
        <ShareButton tripPlan={tripPlan} />

        {/* Custom vehicle modal */}
        <AddCustomVehicle
          isOpen={showCustomForm}
          onClose={() => setShowCustomForm(false)}
          onSave={handleSaveCustomVehicle}
        />
      </div>
    );
  }

  // ─── Desktop Layout (unchanged) ───────────────────────────
  return (
    <div className="h-screen flex flex-col">
      <Header />

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Sidebar — inputs + summary */}
        <aside className="w-full lg:w-[380px] lg:min-w-[380px] overflow-y-auto bg-[var(--color-surface)] p-4 space-y-4 border-r border-[var(--color-surface-hover)]">
          <TripInput
            start={start}
            end={end}
            onStartChange={handleStartChange}
            onEndChange={handleEndChange}
            onStartSelect={handleStartSelect}
            onEndSelect={handleEndSelect}
            isLoaded={true}
            waypoints={waypoints}
            onAddWaypoint={handleAddWaypoint}
            onRemoveWaypoint={handleRemoveWaypoint}
            onUpdateWaypoint={handleUpdateWaypoint}
            onReorderWaypoints={handleReorderWaypoints}
            isLoopTrip={isLoopTrip}
            onToggleLoop={handleToggleLoop}
          />

          <BrandModelSelector
            selectedVehicle={selectedVehicle}
            onSelect={handleSelectVehicle}
            onCustomCarClick={() => setShowCustomForm(true)}
          />

          <BatteryStatusPanel
            vehicle={activeVehicle}
            currentBattery={currentBattery}
            minArrival={minArrival}
            rangeSafetyFactor={rangeSafetyFactor}
            onCurrentBatteryChange={setCurrentBattery}
            onMinArrivalChange={setMinArrival}
            onRangeSafetyFactorChange={handleRSFChange}
          />

          {planButton}
          {errorDisplay}

          {/* Trip results */}
          <TripSummary tripPlan={tripPlan} isLoading={isPlanning} />
        </aside>

        {/* Map pane */}
        <main className="flex-1 relative min-h-[300px]">
          {mapContent}
        </main>
      </div>

      {/* Share button */}
      <ShareButton tripPlan={tripPlan} />

      {/* Custom vehicle modal */}
      <AddCustomVehicle
        isOpen={showCustomForm}
        onClose={() => setShowCustomForm(false)}
        onSave={handleSaveCustomVehicle}
      />
    </div>
  );
}

export default function Home() {
  return (
    <LocaleProvider>
      <MapModeProvider>
        <HomeContent />
      </MapModeProvider>
    </LocaleProvider>
  );
}
