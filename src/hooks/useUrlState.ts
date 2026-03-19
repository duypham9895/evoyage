'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { WaypointData } from '@/components/WaypointInput';

/**
 * Shareable trip state encoded in URL search params.
 * All fields are optional — only non-default values are stored.
 */
export interface UrlTripState {
  readonly start: string;
  readonly end: string;
  readonly startLat: number | null;
  readonly startLng: number | null;
  readonly endLat: number | null;
  readonly endLng: number | null;
  readonly waypoints: readonly WaypointData[];
  readonly isLoopTrip: boolean;
  readonly vehicleId: string | null;
  readonly customVehicle: {
    brand: string;
    model: string;
    batteryCapacityKwh: number;
    officialRangeKm: number;
    chargingTimeDC_10to80_min?: number;
    chargingPortType?: string;
  } | null;
  readonly currentBattery: number;
  readonly minArrival: number;
  readonly rangeSafetyFactor: number;
}

const DEFAULTS = {
  currentBattery: 80,
  minArrival: 15,
  rangeSafetyFactor: 0.8,
} as const;

/** Parse URL search params into trip state (only the fields present in the URL). */
export function parseUrlState(): Partial<UrlTripState> {
  if (typeof window === 'undefined') return {};

  const params = new URLSearchParams(window.location.search);
  const state: Record<string, unknown> = {};

  // String fields
  const start = params.get('start');
  if (start) state.start = start;

  const end = params.get('end');
  if (end) state.end = end;

  // Coordinate fields
  const startLat = params.get('slat');
  const startLng = params.get('slng');
  if (startLat && startLng) {
    const lat = parseFloat(startLat);
    const lng = parseFloat(startLng);
    if (!isNaN(lat) && !isNaN(lng)) {
      state.startLat = lat;
      state.startLng = lng;
    }
  }

  const endLat = params.get('elat');
  const endLng = params.get('elng');
  if (endLat && endLng) {
    const lat = parseFloat(endLat);
    const lng = parseFloat(endLng);
    if (!isNaN(lat) && !isNaN(lng)) {
      state.endLat = lat;
      state.endLng = lng;
    }
  }

  // Waypoints — compact JSON: [{n:"name",lat:1,lng:2}]
  const wp = params.get('wp');
  if (wp) {
    try {
      const parsed = JSON.parse(wp);
      if (Array.isArray(parsed)) {
        state.waypoints = parsed.map((w: { n: string; lat?: number; lng?: number }) => ({
          name: w.n ?? '',
          coords: w.lat != null && w.lng != null ? { lat: w.lat, lng: w.lng } : null,
        }));
      }
    } catch { /* ignore malformed */ }
  }

  // Loop trip
  if (params.get('loop') === '1') {
    state.isLoopTrip = true;
  }

  // Vehicle — either DB id or custom JSON
  const vid = params.get('vid');
  if (vid) {
    state.vehicleId = vid;
  }

  const cv = params.get('cv');
  if (cv) {
    try {
      const parsed = JSON.parse(cv);
      if (parsed.brand && parsed.model && parsed.batteryCapacityKwh && parsed.officialRangeKm) {
        state.customVehicle = parsed;
      }
    } catch { /* ignore malformed */ }
  }

  // Battery params — only if different from defaults
  const bat = params.get('bat');
  if (bat) {
    const val = parseInt(bat, 10);
    if (!isNaN(val) && val >= 10 && val <= 100) state.currentBattery = val;
  }

  const min = params.get('min');
  if (min) {
    const val = parseInt(min, 10);
    if (!isNaN(val) && val >= 5 && val <= 30) state.minArrival = val;
  }

  const rsf = params.get('rsf');
  if (rsf) {
    const val = parseFloat(rsf);
    if (!isNaN(val) && val >= 0.5 && val <= 1.0) state.rangeSafetyFactor = val;
  }

  return state;
}

/** Build URL search params from trip state, omitting defaults. */
function buildSearchParams(state: UrlTripState): URLSearchParams {
  const params = new URLSearchParams();

  if (state.start) params.set('start', state.start);
  if (state.end) params.set('end', state.end);

  if (state.startLat != null && state.startLng != null) {
    params.set('slat', state.startLat.toFixed(6));
    params.set('slng', state.startLng.toFixed(6));
  }
  if (state.endLat != null && state.endLng != null) {
    params.set('elat', state.endLat.toFixed(6));
    params.set('elng', state.endLng.toFixed(6));
  }

  // Waypoints — compact format
  const validWaypoints = state.waypoints.filter(wp => wp.name || wp.coords);
  if (validWaypoints.length > 0) {
    const compact = validWaypoints.map(wp => ({
      n: wp.name,
      ...(wp.coords ? { lat: +wp.coords.lat.toFixed(6), lng: +wp.coords.lng.toFixed(6) } : {}),
    }));
    params.set('wp', JSON.stringify(compact));
  }

  if (state.isLoopTrip) params.set('loop', '1');

  if (state.vehicleId) {
    params.set('vid', state.vehicleId);
  } else if (state.customVehicle) {
    params.set('cv', JSON.stringify(state.customVehicle));
  }

  // Only store non-default battery params
  if (state.currentBattery !== DEFAULTS.currentBattery) {
    params.set('bat', state.currentBattery.toString());
  }
  if (state.minArrival !== DEFAULTS.minArrival) {
    params.set('min', state.minArrival.toString());
  }
  if (state.rangeSafetyFactor !== DEFAULTS.rangeSafetyFactor) {
    params.set('rsf', state.rangeSafetyFactor.toString());
  }

  return params;
}

/**
 * Hook that syncs trip state to URL search params.
 * Call `syncToUrl(state)` whenever inputs change.
 * Returns parsed URL state on mount.
 */
export function useUrlState() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncToUrl = useCallback((state: UrlTripState) => {
    // Debounce URL updates to 300ms
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const params = buildSearchParams(state);
      const search = params.toString();
      const newUrl = search ? `${window.location.pathname}?${search}` : window.location.pathname;

      // Only update if changed
      if (newUrl !== `${window.location.pathname}${window.location.search}`) {
        window.history.replaceState(null, '', newUrl);
      }
    }, 300);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { syncToUrl, parseUrlState };
}
