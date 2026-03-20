'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { MapMode } from '@/types';

interface MapModeContextType {
  readonly mode: MapMode;
  readonly setMode: (mode: MapMode) => void;
}

const STORAGE_KEY = 'evoyage-map-mode';

const MapModeContext = createContext<MapModeContextType>({
  mode: 'osm',
  setMode: () => {},
});

export function MapModeProvider({ children }: { readonly children: ReactNode }) {
  const [mode, setModeState] = useState<MapMode>('osm');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'leaflet' || saved === 'osm') {
      setModeState('osm');
    } else if (saved === 'mapbox') {
      setModeState('mapbox');
    } else if (saved === 'google') {
      // Migrate legacy Google mode to OSM
      setModeState('osm');
      localStorage.setItem(STORAGE_KEY, 'osm');
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
