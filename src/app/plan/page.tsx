'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { z } from 'zod';
import dynamic from 'next/dynamic';
import { hapticLight } from '@/lib/haptics';
import { trackTripPlanned, trackDeparturePicked } from '@/lib/analytics';
import { createNotebookStore, type SavedTrip } from '@/lib/trip/notebook-store';
import { LocaleProvider } from '@/lib/locale';
import { useLocale } from '@/lib/locale';
import { MapModeProvider, useMapMode } from '@/lib/map-mode';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useDesktopSidebarTab } from '@/hooks/useDesktopSidebarTab';
import { useUrlState, parseUrlState } from '@/hooks/useUrlState';
import Header from '@/components/layout/Header';
import ErrorBanner from '@/components/layout/ErrorBanner';
import TripInput from '@/components/trip/TripInput';
import SampleTripChips from '@/components/trip/SampleTripChips';
import BrandModelSelector from '@/components/trip/BrandModelSelector';
import AddCustomVehicle from '@/components/trip/AddCustomVehicle';
import BatteryStatusPanel from '@/components/trip/BatteryStatusPanel';
import DepartureTimePicker from '@/components/trip/DepartureTimePicker';
import TripSummary from '@/components/trip/TripSummary';
import ShareButton from '@/components/trip/ShareButton';
import EVi from '@/components/EVi';
import EViFab from '@/components/trip/EViFab';
import EViMobileSheet from '@/components/trip/EViMobileSheet';
import EViNudge from '@/components/trip/EViNudge';
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
  // Hydration-safe geolocation feature detection: render `false` on SSR
  // (no `navigator`), then update on mount so server and client agree on the
  // initial DOM. Prevents the "server rendered HTML didn't match the client"
  // warning that fires when the button conditionally renders.
  const [geolocationSupported, setGeolocationSupported] = useState(false);
  useEffect(() => {
    setGeolocationSupported(typeof navigator !== 'undefined' && 'geolocation' in navigator);
  }, []);
  const [nearbyStations, setNearbyStations] = useState<readonly (ChargingStationData & { distanceKm: number })[] | null>(null);
  const handleStationsFound = useCallback((stations: readonly (ChargingStationData & { distanceKm: number })[]) => {
    setNearbyStations(stations);
  }, []);

  // Mobile tab state
  const [activeTab, setActiveTab] = useState<MobileTab>('route');
  const [isEViOpen, setIsEViOpen] = useState(false);

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
  /** Phase 2 — ISO 8601 departure time, or null for "now". */
  const [departAt, setDepartAtRaw] = useState<string | null>(null);
  const setDepartAt = useCallback((next: string | null) => {
    setDepartAtRaw(next);
    if (next) {
      const leadHours = (new Date(next).getTime() - Date.now()) / 3_600_000;
      trackDeparturePicked(leadHours);
    }
  }, []);

  /** Phase 5 — saved-trip notebook (localStorage). One instance per page lifetime. */
  const notebook = useMemo(() => createNotebookStore(), []);

  // Trip result
  const [tripPlan, setTripPlan] = useState<TripPlan | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  // In-flight calc tracking — for Cancel + timeout fallback
  const planAbortRef = useRef<AbortController | null>(null);
  const planTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const TRIP_CALC_TIMEOUT_MS = 10_000;

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

  // eVi discoverability nudge — fires once per session after 90s on /plan
  // with no input, OR when the user attempts to plan with invalid state.
  const [showEviNudge, setShowEviNudge] = useState(false);

  const handleOpenEviFromNudge = useCallback(() => {
    setShowEviNudge(false);
    setIsEViOpen(true);
    handleDesktopTabChange('evi');
  }, [handleDesktopTabChange]);

  const handleDismissEviNudge = useCallback(() => {
    setShowEviNudge(false);
  }, []);

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
    setIsEViOpen(true);
    handleDesktopTabChange('evi');
  }, [handleDesktopTabChange]);

  // "Find nearby stations" — switch to stations tab on both mobile and desktop
  const handleFindNearbyStations = useCallback(() => {
    setActiveTab('stations');
    handleDesktopTabChange('stations');
    setBottomSheetSnap({ point: 'half', trigger: Date.now() });
  }, [handleDesktopTabChange]);

  // Pre-fill both inputs from a sample-trip chip. Coords are cleared so the
  // existing flow (Nominatim resolves on submit / on suggestion click) still
  // takes over — we don't auto-submit.
  const handleSampleTripPick = useCallback((trip: { start: string; end: string }) => {
    hapticLight();
    setStart(trip.start);
    setEnd(trip.end);
    setStartCoords(null);
    setEndCoords(null);
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

  // Swipe gesture handlers for mobile tab switching
  const handleSwipeLeft = useCallback(() => {
    hapticLight();
    setActiveTab(prev => prev === 'route' ? 'vehicle' : prev === 'vehicle' ? 'battery' : prev === 'battery' ? 'stations' : prev);
  }, []);

  const handleSwipeRight = useCallback(() => {
    hapticLight();
    setActiveTab(prev => prev === 'stations' ? 'battery' : prev === 'battery' ? 'vehicle' : prev === 'vehicle' ? 'route' : prev);
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
    // Idempotent: ignore re-entry while a calc is in flight (defense in depth
    // — UI also locks inputs, but EVi or other entry points could still call).
    if (planAbortRef.current) return;

    const controller = new AbortController();
    planAbortRef.current = controller;

    setIsPlanning(true);
    setError(null);
    setTimedOut(false);
    // Note: do NOT clear tripPlan here — keep previous result visible so Cancel
    // / timeout can revert without destroying the user's last good plan.

    planTimeoutRef.current = setTimeout(() => {
      // Timeout fallback: abort + surface a "try again" message.
      controller.abort();
      planAbortRef.current = null;
      planTimeoutRef.current = null;
      setIsPlanning(false);
      setTimedOut(true);
    }, TRIP_CALC_TIMEOUT_MS);

    try {
      const response = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
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
          ...(departAt ? { departAt } : {}),
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

      // Stale-fetch guard: if the in-flight controller was cancelled or replaced
      // while this fetch was resolving, don't apply its data. The AbortSignal
      // normally rejects the fetch first, but a network proxy or mocked fetch
      // could still resolve after abort — never let stale data clobber state.
      if (planAbortRef.current !== controller) return;

      setTripPlan(data as TripPlan);
      // Analytics: aggregate-only payload (city labels + km), no coords/PII.
      try {
        trackTripPlanned(start, isLoopTrip ? start : end, (data as TripPlan).totalDistanceKm);
      } catch { /* analytics never breaks the flow */ }
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

      // Phase 5 — persist into the notebook (richer schema, dedup-aware)
      try {
        notebook.save({
          start,
          end,
          startCoords: startCoords ?? undefined,
          endCoords: endCoords ?? undefined,
          waypoints: waypoints
            .filter((wp) => wp.coords)
            .map((wp) => ({ lat: wp.coords!.lat, lng: wp.coords!.lng, name: wp.name })),
          isLoopTrip,
          vehicleId: selectedVehicle?.id ?? null,
          customVehicle,
          currentBattery,
          minArrival,
          rangeSafetyFactor,
          departAt,
        });
      } catch { /* notebook never breaks the planning flow */ }
    } catch (err) {
      // Aborted (Cancel or timeout): the abort path already set state — no-op here.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      // Only clear if THIS calc is still the active one. A late response from a
      // previously-aborted calc must not overwrite the new in-flight calc's state.
      if (planAbortRef.current === controller) {
        if (planTimeoutRef.current) {
          clearTimeout(planTimeoutRef.current);
          planTimeoutRef.current = null;
        }
        planAbortRef.current = null;
        setIsPlanning(false);
      }
    }
  }, [start, end, startCoords, endCoords, selectedVehicle, customVehicle, currentBattery, minArrival, rangeSafetyFactor, mode, waypoints, isLoopTrip, departAt, notebook]);

  // Phase 5 — Re-plan from a saved trip in the notebook. Loads every saved
  // param into page state, bumps lastViewedAt, and triggers handlePlanTrip
  // (always re-fetches — never serves a stale plan because conditions like
  // traffic/popularity/holiday may have changed since the original plan).
  const handleReplanFromNotebook = useCallback(
    (trip: SavedTrip) => {
      setStart(trip.start);
      setEnd(trip.end);
      setStartCoords(trip.startCoords ?? null);
      setEndCoords(trip.endCoords ?? null);
      setWaypoints(
        trip.waypoints.map((wp) => ({
          name: wp.name ?? '',
          coords: { lat: wp.lat, lng: wp.lng },
        })),
      );
      setIsLoopTrip(trip.isLoopTrip);
      // Vehicle: try to fetch fresh data so naming/efficiency stays in sync
      if (trip.vehicleId) {
        fetch(`/api/vehicles?id=${encodeURIComponent(trip.vehicleId)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data) {
              setSelectedVehicle(data);
              setCustomVehicle(null);
            }
          })
          .catch(() => { /* user can re-pick from the vehicle tab */ });
      } else if (trip.customVehicle) {
        setCustomVehicle(trip.customVehicle);
        setSelectedVehicle(null);
      }
      setCurrentBattery(trip.currentBattery);
      setMinArrival(trip.minArrival);
      setRangeSafetyFactor(trip.rangeSafetyFactor);
      setDepartAtRaw(trip.departAt); // skip the picker tracker — this is system-driven, not user choice
      notebook.touch(trip.id);
      // The plan auto-fires once state settles — caller can opt to navigate
      // to the route tab so the user lands on the result, not the form
    },
    [notebook],
  );

  // Cancel an in-flight calculation — reverts to previous tripPlan (if any).
  const handleCancelPlanTrip = useCallback(() => {
    if (planAbortRef.current) {
      planAbortRef.current.abort();
      planAbortRef.current = null;
    }
    if (planTimeoutRef.current) {
      clearTimeout(planTimeoutRef.current);
      planTimeoutRef.current = null;
    }
    setIsPlanning(false);
    setTimedOut(false);
  }, []);

  // Dismiss timeout banner (after Retry click or X)
  const handleDismissTimeout = useCallback(() => {
    setTimedOut(false);
  }, []);

  // Cleanup on unmount — avoid leaked state updates from stale fetches
  useEffect(() => {
    return () => {
      planAbortRef.current?.abort();
      if (planTimeoutRef.current) clearTimeout(planTimeoutRef.current);
    };
  }, []);

  // Auto-plan after eVi fills form (state updates need a render cycle)
  useEffect(() => {
    if (autoPlanPending) {
      setAutoPlanPending(false);
      handlePlanTrip();
    }
  }, [autoPlanPending, handlePlanTrip]);

  // eVi nudge trigger 1: 90s on /plan with empty start AND end fields.
  // The nudge component itself respects sessionStorage — we only flip the
  // local "shouldShow" flag here.
  useEffect(() => {
    if (start || end) return; // user is engaged, no nudge
    // Skip the timer if the nudge has already fired this session
    try {
      if (typeof window !== 'undefined' && window.sessionStorage.getItem('evi_nudge_shown') === '1') {
        return;
      }
    } catch {
      // sessionStorage unavailable — proceed; the component will fail-gracefully
    }
    const timer = setTimeout(() => {
      setShowEviNudge(true);
    }, 90_000);
    return () => clearTimeout(timer);
  }, [start, end]);

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

  // Trigger 2: tap on disabled Plan-Trip area = signal of frustration → show nudge.
  // Wrapper div catches pointerDown even when the inner button is disabled
  // (disabled buttons don't fire click events).
  const handlePlanWrapperPointerDown = useCallback(() => {
    if (canPlan || isPlanning) return;
    try {
      if (typeof window !== 'undefined' && window.sessionStorage.getItem('evi_nudge_shown') === '1') {
        return;
      }
    } catch {
      // fall through and show the nudge anyway
    }
    setShowEviNudge(true);
  }, [canPlan, isPlanning]);

  const planButton = isPlanning ? (
    // Cancel button replaces Plan button while a calc is in flight (per spec §3.3)
    <button
      onClick={handleCancelPlanTrip}
      className="w-full py-3.5 rounded-xl font-bold font-[family-name:var(--font-heading)] text-base transition-all border border-[var(--color-surface-hover)] text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)] active:scale-[0.98]"
    >
      <span className="flex items-center justify-center gap-2">
        <span className="w-4 h-4 border-2 border-[var(--color-foreground)] border-t-transparent rounded-full animate-spin" />
        {t('plan_calculating_label')} · {t('plan_cancel')}
      </span>
    </button>
  ) : (
    <div onPointerDown={handlePlanWrapperPointerDown}>
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
        {t('plan_trip_button')}
      </button>
      {!canPlan && disabledReason && (
        <p className="text-xs text-[var(--color-muted)] text-center mt-1.5">{disabledReason}</p>
      )}
    </div>
  );

  const errorDisplay = error ? (
    <div className="p-3 bg-[var(--color-danger)]/10 text-[var(--color-danger)] rounded-lg text-sm">
      {error}
    </div>
  ) : null;

  // Timeout banner — shown after TRIP_CALC_TIMEOUT_MS elapses without response.
  // Retry triggers a fresh planTrip; dismiss closes the banner without retrying.
  const timeoutBanner = timedOut ? (
    <div className="p-3 bg-[var(--color-warn)]/10 border border-[var(--color-warn)]/30 rounded-lg text-sm text-[var(--color-warn)] flex items-center justify-between gap-3">
      <span className="flex-1">{t('plan_calc_timeout_message')}</span>
      <div className="flex gap-2 flex-shrink-0">
        <button
          onClick={() => { handleDismissTimeout(); handlePlanTrip(); }}
          className="px-3 py-1.5 rounded-lg bg-[var(--color-warn)] text-[var(--color-background)] text-xs font-semibold hover:opacity-90 transition-opacity"
        >
          {t('plan_calc_timeout_retry')}
        </button>
        <button
          onClick={handleDismissTimeout}
          className="px-2 py-1.5 rounded-lg text-[var(--color-warn)] hover:bg-[var(--color-warn)]/10 transition-colors text-xs"
          aria-label={t('plan_cancel')}
        >
          ✕
        </button>
      </div>
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
          onSwitchToEVi={() => { setIsEViOpen(true); handleDesktopTabChange('evi'); }}
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
      geolocationSupported={geolocationSupported}
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
        <ErrorBanner />

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
          <div className="flex-1 min-h-0 overflow-y-auto" role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
            {activeTab === 'route' && (
              <>
                <SampleTripChips start={start} end={end} onPick={handleSampleTripPick} disabled={isPlanning} />
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
                  disabled={isPlanning}
                />
                {(tripPlan || isPlanning) && <TripSummary tripPlan={tripPlan} isLoading={isPlanning} vehicleEfficiencyWhPerKm={
                  selectedVehicle?.efficiencyWhPerKm ??
                  (selectedVehicle?.batteryCapacityKwh && selectedVehicle?.officialRangeKm
                    ? (selectedVehicle.batteryCapacityKwh * 1000) / selectedVehicle.officialRangeKm
                    : null)
                } vehicleBrand={selectedVehicle?.brand} vehicleUsableBatteryKwh={selectedVehicle?.usableBatteryKwh} vehicleOfficialRangeKm={selectedVehicle?.officialRangeKm} onSelectAlternativeStation={handleSelectAlternativeStation} onBackToChat={handleBackToChat} onSelectDepartureTime={setDepartAt} />}
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
                disabled={isPlanning}
              />
            )}

            {activeTab === 'battery' && (
              <div className="space-y-3">
                <DepartureTimePicker
                  value={departAt}
                  onChange={setDepartAt}
                  i18n={{
                    label: t('trip_departure_picker_label' as Parameters<typeof t>[0]),
                    resetButton: t('trip_departure_picker_reset' as Parameters<typeof t>[0]),
                    helperFuture: t('trip_departure_picker_helper' as Parameters<typeof t>[0]),
                  }}
                />
                <BatteryStatusPanel
                  vehicle={activeVehicle}
                  currentBattery={currentBattery}
                  minArrival={minArrival}
                  rangeSafetyFactor={rangeSafetyFactor}
                  onCurrentBatteryChange={setCurrentBattery}
                  onMinArrivalChange={setMinArrival}
                  onRangeSafetyFactorChange={handleRSFChange}
                  disabled={isPlanning}
                />
              </div>
            )}

            {activeTab === 'stations' && (
              <NearbyStations
                initialLocation={geo.latitude != null && geo.longitude != null ? { lat: geo.latitude, lng: geo.longitude } : null}
              />
            )}

            {/* Plan button — only on route/vehicle/battery tabs (stations doesn't need one) */}
            {activeTab !== 'stations' && planButton}
            {activeTab !== 'stations' && errorDisplay}
            {activeTab !== 'stations' && timeoutBanner}
          </div>
        </MobileBottomSheet>

        {/* eVi FAB + full-screen sheet (mobile only) */}
        <EViFab onOpen={() => setIsEViOpen(true)} isOpen={isEViOpen} />
        <EViMobileSheet
          isOpen={isEViOpen}
          onClose={() => setIsEViOpen(false)}
          onTripParsed={handleTripParsed}
          onPlanTrip={handleEViPlanTrip}
          onFindNearbyStations={handleFindNearbyStations}
          isPlanning={isPlanning}
        />

        {/* Feedback FAB */}
        <FeedbackFAB />

        {/* eVi discoverability nudge — one-time-per-session */}
        <EViNudge
          shouldShow={showEviNudge}
          onOpenEvi={handleOpenEviFromNudge}
          onDismiss={handleDismissEviNudge}
        />

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
      <ErrorBanner />

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
                <SampleTripChips start={start} end={end} onPick={handleSampleTripPick} disabled={isPlanning} />
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
                  disabled={isPlanning}
                />

                <BrandModelSelector
                  selectedVehicle={selectedVehicle}
                  onSelect={handleSelectVehicle}
                  onCustomCarClick={() => setShowCustomForm(true)}
                  disabled={isPlanning}
                />

                <BatteryStatusPanel
                  vehicle={activeVehicle}
                  currentBattery={currentBattery}
                  minArrival={minArrival}
                  rangeSafetyFactor={rangeSafetyFactor}
                  onCurrentBatteryChange={setCurrentBattery}
                  onMinArrivalChange={setMinArrival}
                  onRangeSafetyFactorChange={handleRSFChange}
                  disabled={isPlanning}
                />

                <DepartureTimePicker
                  value={departAt}
                  onChange={setDepartAt}
                  i18n={{
                    label: t('trip_departure_picker_label' as Parameters<typeof t>[0]),
                    resetButton: t('trip_departure_picker_reset' as Parameters<typeof t>[0]),
                    helperFuture: t('trip_departure_picker_helper' as Parameters<typeof t>[0]),
                  }}
                />

                {planButton}
                {errorDisplay}
                {timeoutBanner}

                <TripSummary tripPlan={tripPlan} isLoading={isPlanning} vehicleEfficiencyWhPerKm={
                  selectedVehicle?.efficiencyWhPerKm ??
                  (selectedVehicle?.batteryCapacityKwh && selectedVehicle?.officialRangeKm
                    ? (selectedVehicle.batteryCapacityKwh * 1000) / selectedVehicle.officialRangeKm
                    : null)
                } vehicleBrand={selectedVehicle?.brand} vehicleUsableBatteryKwh={selectedVehicle?.usableBatteryKwh} vehicleOfficialRangeKm={selectedVehicle?.officialRangeKm} onSelectAlternativeStation={handleSelectAlternativeStation} onSelectDepartureTime={setDepartAt} />
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

      {/* eVi discoverability nudge — one-time-per-session */}
      <EViNudge
        shouldShow={showEviNudge}
        onOpenEvi={handleOpenEviFromNudge}
        onDismiss={handleDismissEviNudge}
      />

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
