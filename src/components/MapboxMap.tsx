'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import MapGL, { Source, Layer, Marker, Popup, useMap } from 'react-map-gl/mapbox';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { TripPlan, ChargingStop } from '@/types';
import { decodePolyline } from '@/lib/polyline';
import {
  VIETNAM_CENTER,
  VIETNAM_ZOOM,
  PROVIDER_COLORS,
  DEFAULT_MARKER_COLOR,
  escapeHtml,
} from '@/lib/map-utils';

interface MapboxMapProps {
  readonly tripPlan: TripPlan | null;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';

const ROUTE_LAYER = {
  id: 'route-line',
  type: 'line' as const,
  paint: {
    'line-color': '#00D4AA',
    'line-width': 4,
    'line-opacity': 0.9,
  },
};

function EndpointMarker({ lat, lng, label }: { readonly lat: number; readonly lng: number; readonly label: string }) {
  return (
    <Marker latitude={lat} longitude={lng} anchor="center">
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: '50%',
          background: '#00D4AA',
          border: '2px solid #0A0A0B',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 'bold',
          fontSize: 13,
          color: '#0A0A0B',
          fontFamily: 'system-ui',
        }}
      >
        {label}
      </div>
    </Marker>
  );
}

function StopMarker({
  stop,
  index,
  isSelected,
  onSelect,
}: {
  readonly stop: ChargingStop;
  readonly index: number;
  readonly isSelected: boolean;
  readonly onSelect: (index: number | null) => void;
}) {
  const color = PROVIDER_COLORS[stop.station.provider] ?? DEFAULT_MARKER_COLOR;

  return (
    <>
      <Marker
        latitude={stop.station.latitude}
        longitude={stop.station.longitude}
        anchor="center"
        onClick={(e: { originalEvent: MouseEvent }) => {
          e.originalEvent.stopPropagation();
          onSelect(isSelected ? null : index);
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: color,
            border: '2px solid #0A0A0B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: 11,
            color: '#0A0A0B',
            fontFamily: 'system-ui',
            cursor: 'pointer',
          }}
        >
          {index + 1}
        </div>
      </Marker>
      {isSelected && (
        <Popup
          latitude={stop.station.latitude}
          longitude={stop.station.longitude}
          offset={16}
          closeOnClick={false}
          onClose={() => onSelect(null)}
        >
          <div style={{ fontFamily: 'system-ui', maxWidth: 250 }}>
            <h3 style={{ fontWeight: 'bold', margin: '0 0 4px' }}>{escapeHtml(stop.station.name)}</h3>
            <p style={{ fontSize: 12, margin: '0 0 4px', color: '#666' }}>{escapeHtml(stop.station.address)}</p>
            <p style={{ fontSize: 12, margin: 0 }}>
              <span style={{ color: '#FF3B30', fontWeight: 'bold' }}>{stop.arrivalBatteryPercent}%</span>
              {' → '}
              <span style={{ color: '#00D4AA', fontWeight: 'bold' }}>{stop.departureBatteryPercent}%</span>
              {` | ~${stop.estimatedChargingTimeMin}min`}
            </p>
            <p style={{ fontSize: 11, margin: '4px 0 0', color: '#888' }}>
              ⚡ {stop.station.maxPowerKw}kW | {stop.station.connectorTypes.join(', ')} | {stop.station.provider}
            </p>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${stop.station.latitude},${stop.station.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                marginTop: 8,
                padding: '4px 12px',
                background: '#00D4AA',
                color: '#0A0A0B',
                borderRadius: 4,
                textDecoration: 'none',
                fontSize: 12,
                fontWeight: 'bold',
              }}
            >
              Navigate
            </a>
          </div>
        </Popup>
      )}
    </>
  );
}

function TripOverlay({ tripPlan }: { readonly tripPlan: TripPlan }) {
  const { current: mapRef } = useMap();
  const [selectedStop, setSelectedStop] = useState<number | null>(null);

  const path = useMemo(() => decodePolyline(tripPlan.polyline), [tripPlan.polyline]);

  const routeGeoJson = useMemo(
    () => ({
      type: 'Feature' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates: path.map((p) => [p.lng, p.lat]),
      },
      properties: {},
    }),
    [path],
  );

  // Auto-fit bounds to route and charging stops
  useEffect(() => {
    if (!mapRef || path.length === 0) return;
    const bounds = new mapboxgl.LngLatBounds(
      [path[0].lng, path[0].lat],
      [path[0].lng, path[0].lat],
    );
    path.forEach((p) => bounds.extend([p.lng, p.lat]));
    tripPlan.chargingStops.forEach((stop) => {
      bounds.extend([stop.station.longitude, stop.station.latitude]);
    });
    mapRef.fitBounds(bounds, { padding: 50 });
  }, [mapRef, path, tripPlan.chargingStops]);

  const handleStopSelect = useCallback((index: number | null) => {
    setSelectedStop(index);
  }, []);

  return (
    <>
      <Source id="route" type="geojson" data={routeGeoJson}>
        <Layer {...ROUTE_LAYER} />
      </Source>

      {path.length > 0 && (
        <>
          <EndpointMarker lat={path[0].lat} lng={path[0].lng} label="A" />
          <EndpointMarker lat={path[path.length - 1].lat} lng={path[path.length - 1].lng} label="B" />
        </>
      )}

      {tripPlan.chargingStops.map((stop, index) => (
        <StopMarker
          key={stop.station.id}
          stop={stop}
          index={index}
          isSelected={selectedStop === index}
          onSelect={handleStopSelect}
        />
      ))}
    </>
  );
}

export default function MapboxMap({ tripPlan }: MapboxMapProps) {
  if (!MAPBOX_TOKEN) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[var(--color-surface)] text-[var(--color-danger)]">
        Mapbox access token not configured
      </div>
    );
  }

  return (
    <MapGL
      mapboxAccessToken={MAPBOX_TOKEN}
      initialViewState={{
        latitude: VIETNAM_CENTER.lat,
        longitude: VIETNAM_CENTER.lng,
        zoom: VIETNAM_ZOOM,
      }}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/dark-v11"
    >
      {tripPlan && <TripOverlay tripPlan={tripPlan} />}
    </MapGL>
  );
}
