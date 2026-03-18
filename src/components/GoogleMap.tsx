'use client';

import { useEffect, useMemo, useRef, useCallback } from 'react';
import { APIProvider, Map, useMap, useMapsLibrary, useApiIsLoaded } from '@vis.gl/react-google-maps';
import type { TripPlan } from '@/types';
import { decodePolyline } from '@/lib/polyline';
import {
  VIETNAM_CENTER,
  VIETNAM_ZOOM,
  PROVIDER_COLORS,
  DEFAULT_MARKER_COLOR,
  buildStopPopupHtml,
  escapeHtml,
  createSvgMarkerUrl,
} from '@/lib/map-utils';

interface GoogleMapProps {
  readonly tripPlan: TripPlan | null;
}

// Google Maps dark theme styling (matching CartoDB Dark Matter feel)
const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#1C1C1E' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0A0A0B' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8E8E93' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#2C2C2E' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2C2C2E' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1C1C1E' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3C3C3E' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0A0A0B' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4A4A4C' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1C1C1E' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#8E8E93' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1C1C1E' }] },
];

function TripOverlay({ tripPlan }: { readonly tripPlan: TripPlan }) {
  const map = useMap();
  const markerLib = useMapsLibrary('marker');
  const overlaysRef = useRef<google.maps.Polyline | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const path = useMemo(() => decodePolyline(tripPlan.polyline), [tripPlan.polyline]);

  const clearOverlays = useCallback(() => {
    overlaysRef.current?.setMap(null);
    overlaysRef.current = null;
    markersRef.current.forEach((m) => (m.map = null));
    markersRef.current = [];
    infoWindowRef.current?.close();
  }, []);

  useEffect(() => {
    if (!map || !markerLib) return;

    clearOverlays();

    // Route polyline
    const polyline = new google.maps.Polyline({
      path: path.map((p) => ({ lat: p.lat, lng: p.lng })),
      strokeColor: '#00D4AA',
      strokeWeight: 4,
      strokeOpacity: 0.9,
      map,
    });
    overlaysRef.current = polyline;

    const infoWindow = new google.maps.InfoWindow();
    infoWindowRef.current = infoWindow;

    // Start marker
    if (path.length > 0) {
      const startImg = document.createElement('img');
      startImg.src = createSvgMarkerUrl('#00D4AA', 'A');
      startImg.width = 30;
      startImg.height = 30;
      const startMarker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: path[0].lat, lng: path[0].lng },
        content: startImg,
        title: `Start: ${tripPlan.startAddress}`,
      });
      startMarker.addListener('click', () => {
        infoWindow.setContent(`<b>Start:</b> ${escapeHtml(tripPlan.startAddress)}`);
        infoWindow.open({ anchor: startMarker, map });
      });
      markersRef.current.push(startMarker);

      // End marker
      const endPt = path[path.length - 1];
      const endImg = document.createElement('img');
      endImg.src = createSvgMarkerUrl('#00D4AA', 'B');
      endImg.width = 30;
      endImg.height = 30;
      const endMarker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: endPt.lat, lng: endPt.lng },
        content: endImg,
        title: `End: ${tripPlan.endAddress}`,
      });
      endMarker.addListener('click', () => {
        infoWindow.setContent(`<b>End:</b> ${escapeHtml(tripPlan.endAddress)}`);
        infoWindow.open({ anchor: endMarker, map });
      });
      markersRef.current.push(endMarker);
    }

    // Charging stop markers
    tripPlan.chargingStops.forEach((stop, index) => {
      const color = PROVIDER_COLORS[stop.station.provider] ?? DEFAULT_MARKER_COLOR;
      const img = document.createElement('img');
      img.src = createSvgMarkerUrl(color, `${index + 1}`);
      img.width = 26;
      img.height = 26;

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: stop.station.latitude, lng: stop.station.longitude },
        content: img,
        title: stop.station.name,
      });

      marker.addListener('click', () => {
        infoWindow.setContent(buildStopPopupHtml(stop));
        infoWindow.open({ anchor: marker, map });
      });

      markersRef.current.push(marker);
    });

    // Fit bounds
    const bounds = new google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    tripPlan.chargingStops.forEach((stop) => {
      bounds.extend({ lat: stop.station.latitude, lng: stop.station.longitude });
    });
    map.fitBounds(bounds, 50);

    return clearOverlays;
  }, [map, markerLib, tripPlan, path, clearOverlays]);

  return null;
}

function MapLoadingSkeleton() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-[var(--color-surface)] animate-pulse">
      <div className="text-center space-y-2">
        <div className="w-8 h-8 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin mx-auto" />
        <div className="text-sm text-[var(--color-muted)]">Loading Google Maps...</div>
      </div>
    </div>
  );
}

function MapContent({ tripPlan }: GoogleMapProps) {
  const isLoaded = useApiIsLoaded();

  if (!isLoaded) {
    return <MapLoadingSkeleton />;
  }

  return (
    <Map
      defaultCenter={VIETNAM_CENTER}
      defaultZoom={VIETNAM_ZOOM}
      styles={DARK_MAP_STYLES}
      gestureHandling="greedy"
      disableDefaultUI={false}
      className="w-full h-full"
    >
      {tripPlan && <TripOverlay tripPlan={tripPlan} />}
    </Map>
  );
}

export default function GoogleMapView({ tripPlan }: GoogleMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[var(--color-surface)] text-[var(--color-danger)]">
        Google Maps API key not configured
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey}>
      <MapContent tripPlan={tripPlan} />
    </APIProvider>
  );
}
