'use client';

import { useState, useCallback, useRef } from 'react';

export interface GeolocationState {
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly accuracy: number | null;
  readonly loading: boolean;
  readonly error: GeolocationErrorType | null;
}

export type GeolocationErrorType =
  | 'permission_denied'
  | 'position_unavailable'
  | 'timeout'
  | 'not_supported';

const INITIAL_STATE: GeolocationState = {
  latitude: null,
  longitude: null,
  accuracy: null,
  loading: false,
  error: null,
};

const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 60_000,
};

function mapGeolocationError(code: number): GeolocationErrorType {
  switch (code) {
    case 1: return 'permission_denied';
    case 2: return 'position_unavailable';
    case 3: return 'timeout';
    default: return 'position_unavailable';
  }
}

/**
 * Hook for requesting the user's GPS location on demand.
 * Does NOT auto-request — only triggers on explicit `requestLocation()` call.
 */
export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>(INITIAL_STATE);
  const activeRequestRef = useRef(false);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setState({
        ...INITIAL_STATE,
        error: 'not_supported',
      });
      return;
    }

    if (activeRequestRef.current) return;
    activeRequestRef.current = true;

    setState({
      ...INITIAL_STATE,
      loading: true,
    });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        activeRequestRef.current = false;
        setState({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          loading: false,
          error: null,
        });
      },
      (error) => {
        activeRequestRef.current = false;
        setState({
          ...INITIAL_STATE,
          error: mapGeolocationError(error.code),
        });
      },
      GEOLOCATION_OPTIONS,
    );
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    requestLocation,
    clearError,
  } as const;
}
