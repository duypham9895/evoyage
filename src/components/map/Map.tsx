'use client';

import { useEffect, useRef, useCallback } from 'react';
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
import { renderSmartMarkerHtml, getMarkerSize } from '@/lib/geo/smart-marker';
import { renderMiniCardHtml, type MiniCardLabels } from '@/lib/geo/mini-card';
import { useLocale } from '@/lib/locale';
import {
  onStationHighlight,
  onStationClearHighlight,
  emitStationAskEVi,
  type StationHighlightPayload,
} from '@/lib/events/station-events';

export interface NearbyStationMarker extends ChargingStationData {
  readonly distanceKm: number;
  readonly isCompatible?: boolean | null;
  readonly estimatedChargeTimeMin?: number | null;
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
  readonly onSwitchToEVi?: () => void;
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

export default function Map({ tripPlan, waypoints, nearbyStations, userLocation, onSwitchToEVi }: MapProps) {
  const { t } = useLocale();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const overlaysRef = useRef<L.LayerGroup | null>(null);
  const nearbyLayerRef = useRef<L.LayerGroup | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nearbyMarkersRef = useRef<globalThis.Map<string, L.Marker>>(new globalThis.Map());

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

  // Register global callback for "Ask eVi" button in mini-card popups
  const handleAskEVi = useCallback((stationId: string, stationName: string) => {
    emitStationAskEVi({ stationId, stationName });
    onSwitchToEVi?.();
  }, [onSwitchToEVi]);

  // Highlight a specific station marker (fly-to + pulse)
  const highlightStation = useCallback((payload: StationHighlightPayload) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear previous highlight timer
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }

    // Fly to station
    map.flyTo([payload.latitude, payload.longitude], 16, { duration: 1 });

    // Dim all markers, then pulse the target
    nearbyMarkersRef.current.forEach((marker, id) => {
      const el = marker.getElement();
      if (!el) return;
      if (id === payload.stationId) {
        el.style.opacity = '1';
        el.style.animation = 'station-pulse 1.5s ease-in-out infinite';
      } else {
        el.style.opacity = '0.3';
        el.style.animation = '';
      }
    });

    // Auto-clear after 8 seconds
    highlightTimerRef.current = setTimeout(() => {
      nearbyMarkersRef.current.forEach((marker) => {
        const el = marker.getElement();
        if (!el) return;
        el.style.opacity = '1';
        el.style.animation = '';
      });
    }, 8000);
  }, []);

  // Clear highlight on map background click
  const clearHighlight = useCallback(() => {
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    nearbyMarkersRef.current.forEach((marker) => {
      const el = marker.getElement();
      if (!el) return;
      el.style.opacity = '1';
      el.style.animation = '';
    });
  }, []);

  // Subscribe to station highlight events
  useEffect(() => {
    const unsubHighlight = onStationHighlight(highlightStation);
    const unsubClear = onStationClearHighlight(clearHighlight);

    // Clear highlight on map background click
    const map = mapInstanceRef.current;
    if (map) {
      map.on('click', clearHighlight);
    }

    return () => {
      unsubHighlight();
      unsubClear();
      if (map) map.off('click', clearHighlight);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, [highlightStation, clearHighlight]);

  // Render nearby station markers (separate layer so trip plan rendering doesn't clear them)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const nearbyLayer = nearbyLayerRef.current;
    if (!map || !nearbyLayer) return;

    nearbyLayer.clearLayers();
    nearbyMarkersRef.current.clear();

    if (!nearbyStations || nearbyStations.length === 0) return;

    // Inject pulse animation CSS (once)
    if (!document.getElementById('station-pulse-css')) {
      const style = document.createElement('style');
      style.id = 'station-pulse-css';
      style.textContent = `@keyframes station-pulse { 0%,100% { transform:scale(1); filter:brightness(1); } 50% { transform:scale(1.3); filter:brightness(1.4); } }`;
      document.head.appendChild(style);
    }

    // Build locale labels for mini-card popups
    const miniCardLabels: MiniCardLabels = {
      available: t('map_status_available' as Parameters<typeof t>[0]),
      busy: t('map_status_busy' as Parameters<typeof t>[0]),
      offline: t('map_status_offline' as Parameters<typeof t>[0]),
      statusUnknown: t('map_status_unknown' as Parameters<typeof t>[0]),
      disclaimer: t('map_status_disclaimer' as Parameters<typeof t>[0]),
      compatible: t('nearby_compatible' as Parameters<typeof t>[0]),
      notCompatible: t('nearby_not_compatible' as Parameters<typeof t>[0]),
      chargeTime: t('map_card_charge_time' as Parameters<typeof t>[0]),
      askEVi: t('map_card_ask_evi' as Parameters<typeof t>[0]),
      navigate: t('nearby_navigate' as Parameters<typeof t>[0]),
      ports: t('map_card_ports' as Parameters<typeof t>[0]),
    };

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

    // Smart station markers with visual encoding
    nearbyStations.forEach((station) => {
      const { size } = getMarkerSize(station.maxPowerKw);
      const half = size / 2;
      const markerHtml = renderSmartMarkerHtml({
        provider: station.provider,
        maxPowerKw: station.maxPowerKw,
        chargingStatus: station.chargingStatus,
        isCompatible: station.isCompatible ?? null,
      });

      const icon = L.divIcon({
        className: '',
        iconSize: [size, size],
        iconAnchor: [half, half],
        popupAnchor: [0, -half - 4],
        html: markerHtml,
      });

      const marker = L.marker([station.latitude, station.longitude], { icon });

      // Rich mini-card popup
      const popupHtml = renderMiniCardHtml({
        name: station.name,
        distanceKm: station.distanceKm,
        maxPowerKw: station.maxPowerKw,
        connectorTypes: station.connectorTypes,
        portCount: station.portCount,
        provider: station.provider,
        chargingStatus: station.chargingStatus,
        isCompatible: station.isCompatible ?? null,
        estimatedChargeTimeMin: station.estimatedChargeTimeMin ?? null,
        latitude: station.latitude,
        longitude: station.longitude,
      }, miniCardLabels);

      marker.bindPopup(popupHtml, { maxWidth: 240, className: 'smart-popup' });

      // When popup opens, attach DOM event listener for "Ask eVi" button (no global callback)
      marker.on('popupopen', () => {
        const popup = marker.getPopup();
        const el = popup?.getElement();
        const askBtn = el?.querySelector('[data-action="ask-evi"]');
        askBtn?.addEventListener('click', () => {
          handleAskEVi(station.id, station.name);
        });
      });

      // Transfer highlight on marker click
      marker.on('click', () => {
        highlightStation({
          stationId: `${station.latitude}-${station.longitude}`,
          latitude: station.latitude,
          longitude: station.longitude,
        });
      });

      nearbyLayer.addLayer(marker);
      nearbyMarkersRef.current.set(`${station.latitude}-${station.longitude}`, marker);
    });
  }, [nearbyStations, userLocation, handleAskEVi, highlightStation]);

  return <div ref={mapRef} className="w-full h-full" />;
}
