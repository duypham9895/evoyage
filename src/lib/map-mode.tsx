'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { MapMode } from '@/types';

interface MapModeContextType {
  readonly mode: MapMode;
  readonly setMode: (mode: MapMode) => void;
}

const STORAGE_KEY = 'evoyage-map-mode';

const MapModeContext = createContext<MapModeContextType>({
  mode: 'leaflet',
  setMode: () => {},
});

export function MapModeProvider({ children }: { readonly children: ReactNode }) {
  const [mode, setModeState] = useState<MapMode>('leaflet');

  // Load persisted mode from localStorage (must be in useEffect for SSR safety)
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'leaflet' || saved === 'google') {
      setModeState(saved);
    }
  }, []);

  const setMode = useCallback((newMode: MapMode) => {
    setModeState(newMode);
    localStorage.setItem(STORAGE_KEY, newMode);
  }, []);

  return (
    <MapModeContext.Provider value={{ mode, setMode }}>
      {children}
    </MapModeContext.Provider>
  );
}

export function useMapMode() {
  return useContext(MapModeContext);
}
