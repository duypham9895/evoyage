'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { APIProvider, Map, useMap } from '@vis.gl/react-google-maps';
import type { TripPlan } from '@/types';
import { getStopStation } from '@/types';
import { decodePolyline } from '@/lib/geo/polyline';
import {
  VIETNAM_CENTER,
  VIETNAM_ZOOM,
  PROVIDER_COLORS,
  DEFAULT_MARKER_COLOR,
  buildStopPopupHtml,
  escapeHtml,
  createSvgMarkerUrl,
} from '@/lib/geo/map-utils';

interface WaypointMarkerData {
  readonly lat: number;
  readonly lng: number;
  readonly label: string;
}

interface GoogleMapProps {
  readonly tripPlan: TripPlan | null;
  readonly waypoints?: readonly WaypointMarkerData[];
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

function TripOverlay({ tripPlan, waypoints }: { readonly tripPlan: TripPlan; readonly waypoints?: readonly WaypointMarkerData[] }) {
  const map = useMap();
  const overlaysRef = useRef<google.maps.Polyline | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const path = useMemo(() => decodePolyline(tripPlan.polyline), [tripPlan.polyline]);

  const clearOverlays = useCallback(() => {
    overlaysRef.current?.setMap(null);
    overlaysRef.current = null;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    infoWindowRef.current?.close();
  }, []);

  useEffect(() => {
    if (!map) return;

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
      const startMarker = new google.maps.Marker({
        map,
        position: { lat: path[0].lat, lng: path[0].lng },
        icon: {
          url: createSvgMarkerUrl('#00D4AA', 'A'),
          scaledSize: new google.maps.Size(30, 30),
        },
        title: `Start: ${tripPlan.startAddress}`,
      });
      startMarker.addListener('click', () => {
        infoWindow.setContent(`<b>Start:</b> ${escapeHtml(tripPlan.startAddress)}`);
        infoWindow.open({ anchor: startMarker, map });
      });
      markersRef.current.push(startMarker);

      // End marker
      const endPt = path[path.length - 1];
      const endMarker = new google.maps.Marker({
        map,
        position: { lat: endPt.lat, lng: endPt.lng },
        icon: {
          url: createSvgMarkerUrl('#00D4AA', 'B'),
          scaledSize: new google.maps.Size(30, 30),
        },
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
      const station = getStopStation(stop);
      const color = PROVIDER_COLORS[station.provider] ?? DEFAULT_MARKER_COLOR;

      const marker = new google.maps.Marker({
        map,
        position: { lat: station.latitude, lng: station.longitude },
        icon: {
          url: createSvgMarkerUrl(color, `${index + 1}`),
          scaledSize: new google.maps.Size(26, 26),
        },
        title: station.name,
      });

      marker.addListener('click', () => {
        infoWindow.setContent(buildStopPopupHtml(stop));
        infoWindow.open({ anchor: marker, map });
      });

      markersRef.current.push(marker);
    });

    // Waypoint markers (blue numbered)
    waypoints?.forEach((wp) => {
      const wpMarker = new google.maps.Marker({
        map,
        position: { lat: wp.lat, lng: wp.lng },
        icon: {
          url: createSvgMarkerUrl('#3b82f6', wp.label, '#ffffff'),
          scaledSize: new google.maps.Size(28, 28),
        },
        title: `Waypoint ${wp.label}`,
      });
      markersRef.current.push(wpMarker);
    });

    // Fit bounds
    const bounds = new google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    tripPlan.chargingStops.forEach((stop) => {
      const station = getStopStation(stop);
      bounds.extend({ lat: station.latitude, lng: station.longitude });
    });
    waypoints?.forEach((wp) => {
      bounds.extend({ lat: wp.lat, lng: wp.lng });
    });
    map.fitBounds(bounds, 50);

    return clearOverlays;
  }, [map, tripPlan, path, clearOverlays, waypoints]);

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

/** Poll for google.maps availability since useApiIsLoaded() can stall with async loading */
function useGoogleMapsReady(): boolean {
  const [ready, setReady] = useState(
    () => typeof google !== 'undefined' && typeof google.maps?.Map === 'function',
  );

  useEffect(() => {
    if (ready) return;
    const interval = setInterval(() => {
      if (typeof google !== 'undefined' && typeof google.maps?.Map === 'function') {
        setReady(true);
        clearInterval(interval);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [ready]);

  return ready;
}

function MapContent({ tripPlan, waypoints }: GoogleMapProps) {
  const isReady = useGoogleMapsReady();

  if (!isReady) {
    return <MapLoadingSkeleton />;
  }

  return (
    <Map
      defaultCenter={VIETNAM_CENTER}
      defaultZoom={VIETNAM_ZOOM}
      styles={DARK_MAP_STYLES}
      gestureHandling="greedy"
      disableDefaultUI={false}
      style={{ width: '100%', height: '100%' }}
    >
      {tripPlan && <TripOverlay tripPlan={tripPlan} waypoints={waypoints} />}
    </Map>
  );
}

export default function GoogleMapView({ tripPlan, waypoints }: GoogleMapProps) {
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
      <MapContent tripPlan={tripPlan} waypoints={waypoints} />
    </APIProvider>
  );
}
