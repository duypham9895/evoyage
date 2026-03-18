'use client';

import { useEffect, useRef } from 'react';
import type { TripPlan } from '@/types';
import { decodePolyline } from '@/lib/polyline';
import {
  VIETNAM_CENTER,
  VIETNAM_ZOOM,
  PROVIDER_COLORS,
  DEFAULT_MARKER_COLOR,
  buildStopPopupHtml,
  escapeHtml,
} from '@/lib/map-utils';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface MapProps {
  readonly tripPlan: TripPlan | null;
}

// Dark tile layer (CartoDB Dark Matter)
const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';

function createCircleIcon(color: string, label: string): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -16],
    html: `<div style="width:26px;height:26px;border-radius:50%;background:${color};border:2px solid #0A0A0B;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:11px;color:#0A0A0B;font-family:system-ui">${label}</div>`,
  });
}

function createEndpointIcon(label: string): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -18],
    html: `<div style="width:30px;height:30px;border-radius:50%;background:#00D4AA;border:2px solid #0A0A0B;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:13px;color:#0A0A0B;font-family:system-ui">${label}</div>`,
  });
}

export default function Map({ tripPlan }: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const overlaysRef = useRef<L.LayerGroup | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [VIETNAM_CENTER.lat, VIETNAM_CENTER.lng],
      zoom: VIETNAM_ZOOM,
      zoomControl: true,
    });

    L.tileLayer(DARK_TILE_URL, {
      attribution: TILE_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map);

    overlaysRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      overlaysRef.current = null;
    };
  }, []);

  // Render trip plan
  useEffect(() => {
    const map = mapInstanceRef.current;
    const overlays = overlaysRef.current;
    if (!map || !overlays) return;

    overlays.clearLayers();

    if (!tripPlan) return;

    const path = decodePolyline(tripPlan.polyline);
    const latLngs: L.LatLngExpression[] = path.map((p) => [p.lat, p.lng]);

    // Route polyline
    const polyline = L.polyline(latLngs, {
      color: '#00D4AA',
      weight: 4,
      opacity: 0.9,
    });
    overlays.addLayer(polyline);

    // Start marker
    if (latLngs.length > 0) {
      const startMarker = L.marker(latLngs[0], { icon: createEndpointIcon('A') })
        .bindPopup(`<b>Start:</b> ${escapeHtml(tripPlan.startAddress)}`);
      overlays.addLayer(startMarker);

      // End marker
      const endMarker = L.marker(latLngs[latLngs.length - 1], { icon: createEndpointIcon('B') })
        .bindPopup(`<b>End:</b> ${escapeHtml(tripPlan.endAddress)}`);
      overlays.addLayer(endMarker);
    }

    // Charging stop markers
    tripPlan.chargingStops.forEach((stop, index) => {
      const color = PROVIDER_COLORS[stop.station.provider] ?? DEFAULT_MARKER_COLOR;
      const marker = L.marker(
        [stop.station.latitude, stop.station.longitude],
        { icon: createCircleIcon(color, `${index + 1}`) },
      );

      marker.bindPopup(buildStopPopupHtml(stop));
      overlays.addLayer(marker);
    });

    // Fit bounds
    const bounds = polyline.getBounds();
    tripPlan.chargingStops.forEach((stop) => {
      bounds.extend([stop.station.latitude, stop.station.longitude]);
    });
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [tripPlan]);

  return <div ref={mapRef} className="w-full h-full" />;
}
