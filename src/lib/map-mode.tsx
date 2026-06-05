'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { MapMode } from '@/types';

interface MapModeContextType {
  readonly mode: MapMode;
}

const STORAGE_KEY = 'evoyage-map-mode';
const PREFERRED_MAP_MODE: MapMode = 'mapbox';

const MapModeContext = createContext<MapModeContextType>({
  mode: PREFERRED_MAP_MODE,
});

export function MapModeProvider({ children }: { readonly children: ReactNode }) {
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== PREFERRED_MAP_MODE) {
      localStorage.setItem(STORAGE_KEY, PREFERRED_MAP_MODE);
    }
  }, []);

  return (
    <MapModeContext.Provider value={{ mode: PREFERRED_MAP_MODE }}>
      {children}
    </MapModeContext.Provider>
  );
}

export function useMapMode() {
  return useContext(MapModeContext);
}
