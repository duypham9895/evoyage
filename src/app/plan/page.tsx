'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { z } from 'zod';
import dynamic from 'next/dynamic';
import { hapticLight } from '@/lib/haptics';
import { LocaleProvider } from '@/lib/locale';
import { useLocale } from '@/lib/locale';
import { MapModeProvider, useMapMode } from '@/lib/map-mode';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useDesktopSidebarTab } from '@/hooks/useDesktopSidebarTab';
import { useUrlState, parseUrlState } from '@/hooks/useUrlState';
import Header from '@/components/layout/Header';
import TripInput from '@/components/trip/TripInput';
import BrandModelSelector from '@/components/trip/BrandModelSelector';
import AddCustomVehicle from '@/components/trip/AddCustomVehicle';
import BatteryStatusPanel from '@/components/trip/BatteryStatusPanel';
import TripSummary from '@/components/trip/TripSummary';
import ShareButton from '@/components/trip/ShareButton';
import EVi from '@/components/EVi';
import NearbyStations from '@/components/NearbyStations';
import type { EViTripParams } from '@/lib/evi/types';
import { useGeolocation } from '@/hooks/useGeolocation';
import MapLocateButton from '@/components/map/MapLocateButton';
import FeedbackFAB from '@/components/feedback/FeedbackFAB';
import MobileBottomSheet from '@/components/layout/MobileBottomSheet';
import MobileTabBar, { type MobileTab } from '@/components/layout/MobileTabBar';
import DesktopTabBar from '@/components/layout/DesktopTabBar';
import type { EVVehicleData, CustomVehicleInput, TripPlan, ChargingStationData } from '@/types';
import type { RankedStation, ChargingStopWithAlternatives } from '@/types';
import type { NominatimResult } from '@/lib/geo/nominatim';
import type { WaypointData } from '@/components/trip/WaypointInput';
import {
  DEFAULT_RANGE_SAFETY_FACTOR,
  DEFAULT_CURRENT_BATTERY,
  DEFAULT_MIN_ARRIVAL,
} from '@/types';

// Both map components must be loaded client-side only (use window/document)
const LeafletMap = dynamic(() => import('@/components/map/Map'), { ssr: false });
const MapboxMap = dynamic(() => import('@/components/map/MapboxMap'), { ssr: false });

function HomeContent() {
  const { mode } = useMapMode();
  const { t } = useLocale();
  const isMobile = useIsMobile();

  // Geolocation (lifted — shared between MapLocateButton and NearbyStations)
  const geo = useGeolocation();
  const [nearbyStations, setNearbyStations] = useState<readonly (ChargingStationData & { distanceKm: number })[] | null>(null);
  const handleStationsFound = useCallback((stations: readonly (ChargingStationData & { distanceKm: number })[]) => {
    setNearbyStations(stations);
  }, []);

  // Mobile tab state
  const [activeTab, setActiveTab] = useState<MobileTab>('evi');

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

  // Auto-snap bottom sheet to half when results load
  const [bottomSheetSnap, setBottomSheetSnap] = useState<{ point: 'peek' | 'half' | 'full'; trigger: number } | undefined>(undefined);

  // URL state sync
  const { syncToUrl } = useUrlState();
  const urlInitialized = useRef(false);

  // Load state: URL params take priority, then localStorage fallback
  useEffect(() => {
    const urlState = parseUrlState();
    const hasUrlParams = Object.keys(urlState).length > 0;

    // Restore from URL if present
    if (hasUrlParams) {
      if (urlState.start) setStart(urlState.start);
      if (urlState.end) setEnd(urlState.end);
      if (urlState.startLat != null && urlState.startLng != null) {
        setStartCoords({ lat: urlState.startLat, lng: urlState.startLng });
      }
      if (urlState.endLat != null && urlState.endLng != null) {
        setEndCoords({ lat: urlState.endLat, lng: urlState.endLng });
      }
      if (urlState.waypoints) setWaypoints([...urlState.waypoints]);
      if (urlState.isLoopTrip) setIsLoopTrip(true);
      if (urlState.currentBattery != null) setCurrentBattery(urlState.currentBattery);
      if (urlState.minArrival != null) setMinArrival(urlState.minArrival);
      if (urlState.rangeSafetyFactor != null) setRangeSafetyFactor(urlState.rangeSafetyFactor);
      if (urlState.customVehicle) {
        setCustomVehicle(urlState.customVehicle);
        setSelectedVehicle(null);
      }

      // Fetch vehicle by ID from URL
      if (urlState.vehicleId) {
        fetch(`/api/vehicles?id=${encodeURIComponent(urlState.vehicleId)}`)
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data) {
              setSelectedVehicle(data);
              setCustomVehicle(null);
            }
          })
          .catch(() => { /* vehicle not found, user can pick manually */ });
      }
    }

    // localStorage fallback (only if URL didn't provide these)
    if (!hasUrlParams || urlState.rangeSafetyFactor == null) {
      const savedRSF = localStorage.getItem('ev-planner-rsf');
      if (savedRSF) {
        const val = parseFloat(savedRSF);
        if (!isNaN(val) && val >= 0.5 && val <= 1.0) {
          setRangeSafetyFactor(val);
        }
      }
    }

    if (!hasUrlParams) {
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
    }

    urlInitialized.current = true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync state → URL whenever inputs change
  useEffect(() => {
    if (!urlInitialized.current) return;
    syncToUrl({
      start,
      end,
      startLat: startCoords?.lat ?? null,
      startLng: startCoords?.lng ?? null,
      endLat: endCoords?.lat ?? null,
      endLng: endCoords?.lng ?? null,
      waypoints,
      isLoopTrip,
      vehicleId: selectedVehicle?.id ?? null,
      customVehicle,
      currentBattery,
      minArrival,
      rangeSafetyFactor,
    });
  }, [start, end, startCoords, endCoords, waypoints, isLoopTrip, selectedVehicle, customVehicle, currentBattery, minArrival, rangeSafetyFactor, syncToUrl]);

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

  // Desktop sidebar: tab switcher (eVi chat vs Plan Trip vs Stations)
  const { activeTab: desktopSidebarTab, setTab: handleDesktopTabChange } = useDesktopSidebarTab();

  // Flag to auto-trigger planning after eVi fills the form
  const [autoPlanPending, setAutoPlanPending] = useState(false);

  // eVi: AI fills form state from parsed trip
  const fillFormFromEVi = useCallback((params: EViTripParams) => {
    if (params.start) setStart(params.start);
    if (params.startLat != null && params.startLng != null) {
      setStartCoords({ lat: params.startLat, lng: params.startLng });
    }
    if (params.end) setEnd(params.end);
    if (params.endLat != null && params.endLng != null) {
      setEndCoords({ lat: params.endLat, lng: params.endLng });
    }
    if (params.vehicleData) {
      setSelectedVehicle(params.vehicleData);
      setCustomVehicle(null);
    }
    if (params.currentBattery != null) setCurrentBattery(params.currentBattery);
    if (params.minArrival != null) setMinArrival(params.minArrival);
    if (params.rangeSafetyFactor != null) setRangeSafetyFactor(params.rangeSafetyFactor);
  }, []);

  // "Edit" — fill form and expand sheet so user can see & modify inputs
  const handleTripParsed = useCallback((params: EViTripParams) => {
    fillFormFromEVi(params);
    setActiveTab('route');
    handleDesktopTabChange('planTrip'); // Desktop: switch sidebar to form view so user can edit inputs
    setBottomSheetSnap({ point: 'half', trigger: Date.now() });
  }, [fillFormFromEVi]);

  // "Plan Trip" — fill form and auto-trigger route planning
  const handleEViPlanTrip = useCallback((params: EViTripParams) => {
    fillFormFromEVi(params);
    setActiveTab('route');
    handleDesktopTabChange('planTrip'); // Desktop: switch sidebar to form view so TripSummary is visible
    setBottomSheetSnap({ point: 'half', trigger: Date.now() });
    setAutoPlanPending(true);
  }, [fillFormFromEVi]);

  // "Back to eVi" — return to chat from trip detail view
  const handleBackToChat = useCallback(() => {
    setActiveTab('evi'); // Mobile: switch tab
    handleDesktopTabChange('evi'); // Desktop: switch sidebar back to EVi chat
    setBottomSheetSnap({ point: 'full', trigger: Date.now() });
  }, []);

  // "Find nearby stations" — switch to stations tab on both mobile and desktop
  const handleFindNearbyStations = useCallback(() => {
    setActiveTab('stations');
    handleDesktopTabChange('stations');
    setBottomSheetSnap({ point: 'half', trigger: Date.now() });
  }, [handleDesktopTabChange]);

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

  // Swipe gesture handlers for mobile tab switching
  const handleSwipeLeft = useCallback(() => {
    hapticLight();
    setActiveTab(prev => prev === 'evi' ? 'route' : prev === 'route' ? 'vehicle' : prev === 'vehicle' ? 'battery' : prev === 'battery' ? 'stations' : prev);
  }, []);

  const handleSwipeRight = useCallback(() => {
    hapticLight();
    setActiveTab(prev => prev === 'stations' ? 'battery' : prev === 'battery' ? 'vehicle' : prev === 'vehicle' ? 'route' : prev === 'route' ? 'evi' : prev);
  }, []);

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
          provider: mode === 'mapbox' ? 'mapbox' : 'osrm',
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
      // Auto-expand bottom sheet fully and switch to route tab to show charging details
      setActiveTab('route');
      setBottomSheetSnap({ point: 'full', trigger: Date.now() });
      // Save to recent trips
      try {
        const recentTrip = {
          start, end, startCoords, endCoords,
          vehicleId: selectedVehicle?.id ?? null,
          vehicleName: selectedVehicle ? `${selectedVehicle.brand} ${selectedVehicle.model}` : null,
          timestamp: Date.now(),
        };
        const saved = JSON.parse(localStorage.getItem('ev-recent-trips') ?? '[]');
        const updated = [recentTrip, ...saved.filter((t: { start: string; end: string }) => t.start !== start || t.end !== end)].slice(0, 5);
        localStorage.setItem('ev-recent-trips', JSON.stringify(updated));
      } catch { /* localStorage unavailable */ }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsPlanning(false);
    }
  }, [start, end, startCoords, endCoords, selectedVehicle, customVehicle, currentBattery, minArrival, rangeSafetyFactor, mode, waypoints, isLoopTrip]);

  // Auto-plan after eVi fills form (state updates need a render cycle)
  useEffect(() => {
    if (autoPlanPending) {
      setAutoPlanPending(false);
      handlePlanTrip();
    }
  }, [autoPlanPending, handlePlanTrip]);

  // Handle alternative station selection: swap selected ↔ clicked alternative immutably
  const handleSelectAlternativeStation = useCallback(
    (stopIndex: number, station: RankedStation) => {
      setTripPlan((prev) => {
        if (!prev) return prev;
        const stop = prev.chargingStops[stopIndex] as ChargingStopWithAlternatives | undefined;
        if (!stop || !('selected' in stop)) return prev;

        const updatedStop: ChargingStopWithAlternatives = {
          selected: station,
          alternatives: [
            ...stop.alternatives.filter((alt) => alt.station.id !== station.station.id),
            stop.selected,
          ],
          distanceAlongRouteKm: stop.distanceAlongRouteKm,
          batteryPercentAtArrival: stop.batteryPercentAtArrival,
          batteryPercentAfterCharge: stop.batteryPercentAfterCharge,
        };

        const updatedStops = prev.chargingStops.map((s, i) =>
          i === stopIndex ? updatedStop : s,
        );

        return { ...prev, chargingStops: updatedStops };
      });
    },
    [],
  );

  const activeVehicle = selectedVehicle ?? customVehicle;
  const canPlan = Boolean(start && end && activeVehicle && !isPlanning);

  // Shared controls content
  const disabledReason = !start || !end
    ? t('plan_disabled_route')
    : !activeVehicle
      ? t('plan_disabled_vehicle')
      : null;

  const planButton = (
    <div>
      <button
        onClick={handlePlanTrip}
        disabled={!canPlan}
        title={disabledReason ?? undefined}
        className={`w-full py-3.5 rounded-xl font-bold font-[family-name:var(--font-heading)] text-base transition-all ${
          canPlan
            ? 'bg-[var(--color-accent)] text-[var(--color-background)] hover:opacity-90 active:scale-[0.98]'
            : 'bg-[var(--color-surface-hover)] text-[var(--color-muted)] cursor-not-allowed opacity-60'
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
      {!canPlan && !isPlanning && disabledReason && (
        <p className="text-xs text-[var(--color-muted)] text-center mt-1.5">{disabledReason}</p>
      )}
    </div>
  );

  const errorDisplay = error ? (
    <div className="p-3 bg-[var(--color-danger)]/10 text-[var(--color-danger)] rounded-lg text-sm">
      {error}
    </div>
  ) : null;

  // Waypoint markers for map components
  const waypointMarkers = waypoints
    .filter(wp => wp.coords)
    .map((wp, i) => ({
      lat: wp.coords!.lat,
      lng: wp.coords!.lng,
      label: String(i + 1),
    }));

  // User location for map markers
  const userLocationForMap = geo.latitude != null && geo.longitude != null
    ? { lat: geo.latitude, lng: geo.longitude }
    : null;

  // Clear nearby stations when a trip plan is loaded
  useEffect(() => {
    if (tripPlan) setNearbyStations(null);
  }, [tripPlan]);

  // Mobile: auto-request geolocation when Stations tab is active (300ms debounce)
  useEffect(() => {
    if (activeTab !== 'stations') return;
    if (geo.latitude != null || geo.loading) return; // Already have location or loading

    const timer = setTimeout(() => {
      geo.requestLocation();
    }, 300);

    return () => clearTimeout(timer);
  }, [activeTab, geo.latitude, geo.loading, geo.requestLocation]);

  // Map component
  const mapContent = (
    <>
      {mode === 'mapbox' ? (
        <MapboxMap tripPlan={tripPlan} waypoints={waypointMarkers} />
      ) : (
        <LeafletMap
          tripPlan={tripPlan}
          waypoints={waypointMarkers}
          nearbyStations={nearbyStations}
          userLocation={userLocationForMap}
          onSwitchToEVi={() => { setActiveTab('evi'); handleDesktopTabChange('evi'); }}
        />
      )}
    </>
  );

  // MapLocateButton overlay (shared between mobile and desktop)
  const locateButton = (
    <MapLocateButton
      latitude={geo.latitude}
      longitude={geo.longitude}
      loading={geo.loading}
      error={geo.error as 'permission_denied' | 'position_unavailable' | 'timeout' | null}
      geolocationSupported={typeof window !== 'undefined' && 'geolocation' in navigator}
      onRequestLocation={geo.requestLocation}
      onStationsFound={handleStationsFound}
      onSwitchToStationsTab={handleFindNearbyStations}
    />
  );

  // ─── Mobile Layout ─────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="h-[100dvh] flex flex-col relative">
        <Header />

        {/* Full-screen map — isolate stacking context so Leaflet z-indexes don't escape */}
        <main className="flex-1 relative isolate z-0">
          {mapContent}
          {locateButton}
        </main>

        {/* Bottom sheet with tabbed controls */}
        <MobileBottomSheet
          initialSnap="half"
          snapTo={bottomSheetSnap}
          onSwipeLeft={handleSwipeLeft}
          onSwipeRight={handleSwipeRight}
        >
          <MobileTabBar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            hasVehicle={Boolean(activeVehicle)}
            hasRoute={Boolean(start && end)}
          />

          {/* Tab content */}
          <div className={`flex-1 min-h-0 ${activeTab === 'evi' ? 'flex flex-col' : 'overflow-y-auto'}`} role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
            {activeTab === 'evi' && (
              <EVi onTripParsed={handleTripParsed} onPlanTrip={handleEViPlanTrip} onFindNearbyStations={handleFindNearbyStations} isPlanning={isPlanning} />
            )}

            {activeTab === 'route' && (
              <>
                <TripInput
                  start={start}
                  end={end}
                  onStartChange={handleStartChange}
                  onEndChange={handleEndChange}
                  onStartSelect={handleStartSelect}
                  onEndSelect={handleEndSelect}

                  waypoints={waypoints}
                  onAddWaypoint={handleAddWaypoint}
                  onRemoveWaypoint={handleRemoveWaypoint}
                  onUpdateWaypoint={handleUpdateWaypoint}
                  onReorderWaypoints={handleReorderWaypoints}
                  isLoopTrip={isLoopTrip}
                  onToggleLoop={handleToggleLoop}
                />
                {(tripPlan || isPlanning) && <TripSummary tripPlan={tripPlan} isLoading={isPlanning} vehicleEfficiencyWhPerKm={selectedVehicle?.efficiencyWhPerKm ?? null} onSelectAlternativeStation={handleSelectAlternativeStation} onBackToChat={handleBackToChat} />}
                {/* Inline share button for mobile — replaces floating FAB */}
                {tripPlan && !isPlanning && (
                  <div className="pt-2">
                    <ShareButton tripPlan={tripPlan} />
                  </div>
                )}
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

            {activeTab === 'stations' && (
              <NearbyStations
                initialLocation={geo.latitude != null && geo.longitude != null ? { lat: geo.latitude, lng: geo.longitude } : null}
              />
            )}

            {/* Plan button — only on route/vehicle/battery tabs (eVi has its own, stations doesn't need one) */}
            {activeTab !== 'stations' && activeTab !== 'evi' && planButton}
            {activeTab !== 'stations' && activeTab !== 'evi' && errorDisplay}
          </div>
        </MobileBottomSheet>

        {/* Feedback FAB */}
        <FeedbackFAB />

        {/* Custom vehicle modal */}
        <AddCustomVehicle
          isOpen={showCustomForm}
          onClose={() => setShowCustomForm(false)}
          onSave={handleSaveCustomVehicle}
        />
      </div>
    );
  }

  // ─── Desktop Layout ──────────────────────────────────────
  return (
    <div className="h-screen flex flex-col">
      <Header />

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Sidebar — 3-tab switcher + content */}
        <aside className="w-full lg:w-[380px] lg:min-w-[380px] flex flex-col overflow-hidden bg-[var(--color-surface)] border-r border-[var(--color-surface-hover)]">
          {/* Desktop tab bar (eVi | Plan Trip | Stations) */}
          <DesktopTabBar activeTab={desktopSidebarTab} onTabChange={handleDesktopTabChange} />

          {/* Sidebar content — 150ms fade-in transition on tab switch */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            {desktopSidebarTab === 'stations' ? (
              <div className="animate-fadeIn" role="tabpanel" id="desktop-tabpanel-stations" aria-labelledby="desktop-tab-stations">
                <NearbyStations
                  initialLocation={geo.latitude != null && geo.longitude != null ? { lat: geo.latitude, lng: geo.longitude } : null}
                />
              </div>
            ) : desktopSidebarTab === 'planTrip' ? (
              <div className="space-y-4 animate-fadeIn" role="tabpanel" id="desktop-tabpanel-plan" aria-labelledby="desktop-tab-planTrip">
                <TripInput
                  start={start}
                  end={end}
                  onStartChange={handleStartChange}
                  onEndChange={handleEndChange}
                  onStartSelect={handleStartSelect}
                  onEndSelect={handleEndSelect}
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

                <TripSummary tripPlan={tripPlan} isLoading={isPlanning} vehicleEfficiencyWhPerKm={selectedVehicle?.efficiencyWhPerKm ?? null} onSelectAlternativeStation={handleSelectAlternativeStation} />
              </div>
            ) : (
              <div role="tabpanel" id="desktop-tabpanel-evi" aria-labelledby="desktop-tab-evi" className="flex flex-col h-full -m-4">
                <EVi onTripParsed={handleTripParsed} onPlanTrip={handleEViPlanTrip} onFindNearbyStations={handleFindNearbyStations} isPlanning={isPlanning} />
              </div>
            )}
          </div>
        </aside>

        {/* Map pane — isolate creates a stacking context so Leaflet's
             internal z-indices (200-600) don't leak over fixed modals */}
        <main className="flex-1 relative min-h-[300px] isolate">
          {mapContent}
          {locateButton}
        </main>
      </div>

      {/* Share button */}
      <ShareButton tripPlan={tripPlan} />

      {/* Feedback FAB */}
      <FeedbackFAB />

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
