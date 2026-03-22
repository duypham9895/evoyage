'use client';

import { useEffect, useRef } from 'react';
import type { TripPlan, ChargingStationData } from '@/types';
import { getStopStation } from '@/types';
import { decodePolyline } from '@/lib/geo/polyline';
import {
  VIETNAM_CENTER,
  VIETNAM_ZOOM,
  PROVIDER_COLORS,
  DEFAULT_MARKER_COLOR,
  buildStopPopupHtml,
  escapeHtml,
} from '@/lib/geo/map-utils';

interface NearbyStationMarker extends ChargingStationData {
  readonly distanceKm: number;
}
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface WaypointMarkerData {
  readonly lat: number;
  readonly lng: number;
  readonly label: string;
}

interface MapProps {
  readonly tripPlan: TripPlan | null;
  readonly waypoints?: readonly WaypointMarkerData[];
  readonly nearbyStations?: readonly NearbyStationMarker[] | null;
  readonly userLocation?: { lat: number; lng: number } | null;
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
    html: `<div style="width:26px;height:26px;border-radius:50%;background:${color};border:2px solid #0F0F11;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:11px;color:#0F0F11;font-family:system-ui">${label}</div>`,
  });
}

function createWaypointIcon(label: string): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
    html: `<div style="width:28px;height:28px;border-radius:50%;background:#3b82f6;border:2px solid #0F0F11;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:12px;color:#ffffff;font-family:system-ui">${label}</div>`,
  });
}

function createEndpointIcon(label: string): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -18],
    html: `<div style="width:30px;height:30px;border-radius:50%;background:#00D4AA;border:2px solid #0F0F11;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:13px;color:#0F0F11;font-family:system-ui">${label}</div>`,
  });
}

export default function Map({ tripPlan, waypoints, nearbyStations, userLocation }: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const overlaysRef = useRef<L.LayerGroup | null>(null);
  const nearbyLayerRef = useRef<L.LayerGroup | null>(null);

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
    nearbyLayerRef.current = L.layerGroup().addTo(map);
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
      const station = getStopStation(stop);
      const color = PROVIDER_COLORS[station.provider] ?? DEFAULT_MARKER_COLOR;
      const marker = L.marker(
        [station.latitude, station.longitude],
        { icon: createCircleIcon(color, `${index + 1}`) },
      );

      marker.bindPopup(buildStopPopupHtml(stop));
      overlays.addLayer(marker);
    });

    // Waypoint markers (blue numbered)
    waypoints?.forEach((wp) => {
      const wpMarker = L.marker([wp.lat, wp.lng], { icon: createWaypointIcon(wp.label) });
      overlays.addLayer(wpMarker);
    });

    // Fit bounds
    const bounds = polyline.getBounds();
    tripPlan.chargingStops.forEach((stop) => {
      const station = getStopStation(stop);
      bounds.extend([station.latitude, station.longitude]);
    });
    waypoints?.forEach((wp) => {
      bounds.extend([wp.lat, wp.lng]);
    });
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [tripPlan, waypoints]);

  // Render nearby station markers (separate layer so trip plan rendering doesn't clear them)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const nearbyLayer = nearbyLayerRef.current;
    if (!map || !nearbyLayer) return;

    nearbyLayer.clearLayers();

    if (!nearbyStations || nearbyStations.length === 0) return;

    // User location marker (blue pulsing dot)
    if (userLocation) {
      const userDot = L.circleMarker([userLocation.lat, userLocation.lng], {
        radius: 8,
        fillColor: '#5B9BFF',
        fillOpacity: 1,
        color: 'rgba(91,155,255,0.3)',
        weight: 6,
      });
      nearbyLayer.addLayer(userDot);

      // Fly to user location
      map.flyTo([userLocation.lat, userLocation.lng], 14, { duration: 1 });
    }

    // Station markers with distance labels
    nearbyStations.forEach((station) => {
      const color = PROVIDER_COLORS[station.provider] ?? DEFAULT_MARKER_COLOR;
      const icon = L.divIcon({
        className: '',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -14],
        html: `<div style="width:22px;height:22px;border-radius:50%;background:${color};border:2px solid #0F0F11;opacity:0.9"></div>`,
      });

      const marker = L.marker([station.latitude, station.longitude], { icon });
      marker.bindPopup(
        `<div style="font-family:system-ui;font-size:13px;line-height:1.4">` +
        `<b>${escapeHtml(station.name)}</b><br/>` +
        `<span style="color:#a0a0ab">${station.distanceKm} km · ${station.maxPowerKw} kW · ${station.provider}</span><br/>` +
        `<a href="https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}" ` +
        `target="_blank" rel="noopener" style="color:#00D4AA;text-decoration:none">Navigate →</a></div>`,
      );
      nearbyLayer.addLayer(marker);
    });
  }, [nearbyStations, userLocation]);

  return <div ref={mapRef} className="w-full h-full" />;
}
