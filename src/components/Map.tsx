'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { TripPlan } from '@/types';
import { decodePolyline } from '@/lib/polyline';

interface MapProps {
  readonly tripPlan: TripPlan | null;
  readonly isLoaded: boolean;
}

// Vietnam center coordinates
const VIETNAM_CENTER = { lat: 14.0583, lng: 108.2772 };
const VIETNAM_ZOOM = 6;

// Station marker colors by provider
const PROVIDER_COLORS: Record<string, string> = {
  VinFast: '#34C759',
  EverCharge: '#007AFF',
  EVONE: '#5856D6',
  EVPower: '#FF9500',
  'CHARGE+': '#FF2D55',
};
const DEFAULT_MARKER_COLOR = '#8E8E93';

// Dark map style
const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#1C1C1E' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0A0A0B' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8E8E93' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2C2C2E' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#3A3A3C' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3A3A3C' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0A1628' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4E6D8C' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1C1C1E' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1C1C1E' }] },
];

export default function Map({ tripPlan, isLoaded }: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  // Initialize map
  useEffect(() => {
    if (!isLoaded || !mapRef.current || mapInstanceRef.current) return;

    mapInstanceRef.current = new google.maps.Map(mapRef.current, {
      center: VIETNAM_CENTER,
      zoom: VIETNAM_ZOOM,
      styles: MAP_STYLES,
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    });

    infoWindowRef.current = new google.maps.InfoWindow();
  }, [isLoaded]);

  // Clear existing overlays
  const clearOverlays = useCallback(() => {
    polylineRef.current?.setMap(null);
    polylineRef.current = null;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    infoWindowRef.current?.close();
  }, []);

  // Render trip plan on map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !tripPlan) return;

    clearOverlays();

    // Decode and draw route polyline
    const path = decodePolyline(tripPlan.polyline).map(
      (p) => new google.maps.LatLng(p.lat, p.lng),
    );

    polylineRef.current = new google.maps.Polyline({
      path,
      strokeColor: '#00D4AA',
      strokeOpacity: 0.9,
      strokeWeight: 4,
      map,
    });

    // Fit bounds to route
    const bounds = new google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend(p));

    // Start marker
    const startMarker = new google.maps.Marker({
      position: path[0],
      map,
      label: { text: 'A', color: '#0A0A0B', fontWeight: 'bold', fontSize: '12px' },
      title: tripPlan.startAddress,
      zIndex: 10,
    });
    markersRef.current.push(startMarker);

    // End marker
    const endMarker = new google.maps.Marker({
      position: path[path.length - 1],
      map,
      label: { text: 'B', color: '#0A0A0B', fontWeight: 'bold', fontSize: '12px' },
      title: tripPlan.endAddress,
      zIndex: 10,
    });
    markersRef.current.push(endMarker);

    // Charging stop markers
    tripPlan.chargingStops.forEach((stop, index) => {
      const color = PROVIDER_COLORS[stop.station.provider] ?? DEFAULT_MARKER_COLOR;
      const marker = new google.maps.Marker({
        position: { lat: stop.station.latitude, lng: stop.station.longitude },
        map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: '#0A0A0B',
          strokeWeight: 2,
          scale: 12,
        },
        label: {
          text: `${index + 1}`,
          color: '#0A0A0B',
          fontWeight: 'bold',
          fontSize: '11px',
        },
        title: stop.station.name,
        zIndex: 5,
      });

      bounds.extend(marker.getPosition()!);

      marker.addListener('click', () => {
        const content = `
          <div style="color:#0A0A0B;font-family:system-ui;max-width:250px">
            <h3 style="font-weight:bold;margin:0 0 4px">${stop.station.name}</h3>
            <p style="font-size:12px;margin:0 0 4px;color:#666">${stop.station.address}</p>
            <p style="font-size:12px;margin:0">
              <span style="color:#FF3B30;font-weight:bold">${stop.arrivalBatteryPercent}%</span>
              → <span style="color:#34C759;font-weight:bold">${stop.departureBatteryPercent}%</span>
              | ~${stop.estimatedChargingTimeMin}min
            </p>
            <p style="font-size:11px;margin:4px 0 0;color:#888">
              ⚡ ${stop.station.maxPowerKw}kW | ${stop.station.connectorTypes.join(', ')} | ${stop.station.provider}
            </p>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${stop.station.latitude},${stop.station.longitude}"
               target="_blank" rel="noopener noreferrer"
               style="display:inline-block;margin-top:8px;padding:4px 12px;background:#00D4AA;color:#0A0A0B;
                      border-radius:4px;text-decoration:none;font-size:12px;font-weight:bold">
              Navigate
            </a>
          </div>
        `;
        infoWindowRef.current?.setContent(content);
        infoWindowRef.current?.open(map, marker);
      });

      markersRef.current.push(marker);
    });

    map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
  }, [tripPlan, clearOverlays]);

  if (!isLoaded) {
    return (
      <div className="w-full h-full bg-[var(--color-surface)] flex items-center justify-center">
        <div className="text-[var(--color-muted)] text-sm animate-pulse">
          Loading map...
        </div>
      </div>
    );
  }

  return <div ref={mapRef} className="w-full h-full" />;
}
