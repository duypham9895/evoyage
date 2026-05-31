'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import MapGL, { Source, Layer, Marker, Popup, useMap } from 'react-map-gl/mapbox';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { TripPlan, ChargingStop, ChargingStopWithAlternatives, RankedStation } from '@/types';
import { getStopStation } from '@/types';
import { useLocale } from '@/lib/locale';
import { usePrecautionaryStopInteractions, type PrecautionaryStopInteractions } from '@/hooks/usePrecautionaryStopInteractions';
import {
  getStopChargeTimeMin,
  getStopIdentity,
  PRECAUTIONARY_REASON_LOCALE_KEY,
} from '@/lib/trip/precautionary-stop-display';
import {
  trackAlternativeMarkerClicked,
  trackAlternativeNavigateClicked,
} from '@/lib/analytics';
import { decodePolyline } from '@/lib/geo/polyline';
import {
  VIETNAM_CENTER,
  VIETNAM_ZOOM,
  PROVIDER_COLORS,
  DEFAULT_MARKER_COLOR,
  escapeHtml,
} from '@/lib/geo/map-utils';

export interface WaypointMarkerData {
  readonly lat: number;
  readonly lng: number;
  readonly label: string;
}

interface MapboxMapProps {
  readonly tripPlan: TripPlan | null;
  readonly waypoints?: readonly WaypointMarkerData[];
  readonly precautionaryStopInteractions?: PrecautionaryStopInteractions;
}

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
          border: '2px solid #0F0F11',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 'bold',
          fontSize: 13,
          color: '#0F0F11',
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
  stopInteractions,
}: {
  readonly stop: ChargingStop | ChargingStopWithAlternatives;
  readonly index: number;
  readonly isSelected: boolean;
  readonly onSelect: (index: number | null) => void;
  readonly stopInteractions: PrecautionaryStopInteractions;
}) {
  const { t } = useLocale();
  const station = getStopStation(stop);
  const color = PROVIDER_COLORS[station.provider] ?? DEFAULT_MARKER_COLOR;
  const stopId = getStopIdentity(stop);
  const isPrecautionary = stop.isPrecautionary === true;
  const reasonLocaleKey = stop.precautionaryReason
    ? PRECAUTIONARY_REASON_LOCALE_KEY[stop.precautionaryReason]
    : null;
  const isReasonRevealed = stopInteractions.revealedReasonStopIds.has(stopId);
  const chargeTimeMin = Math.round(getStopChargeTimeMin(stop));
  const markerLabel = isPrecautionary
    ? t('extra_stop_aria_label' as Parameters<typeof t>[0], {
        n: String(index + 1),
        name: station.name,
        minutes: String(chargeTimeMin),
      })
    : `${t('charging_stops')} ${index + 1}: ${station.name}`;
  const markerSize = isPrecautionary ? 16 : 24;

  const selectMarker = () => onSelect(isSelected ? null : index);

  return (
    <>
      <Marker
        latitude={station.latitude}
        longitude={station.longitude}
        anchor="center"
        onClick={(e: { originalEvent: MouseEvent }) => {
          e.originalEvent.stopPropagation();
          selectMarker();
        }}
      >
        <div
          role="button"
          tabIndex={0}
          aria-label={markerLabel}
          data-testid={isPrecautionary ? 'precautionary-stop-marker' : 'required-stop-marker'}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            selectMarker();
          }}
          style={{
            width: markerSize,
            height: markerSize,
            borderRadius: '50%',
            background: isPrecautionary ? 'transparent' : color,
            border: isPrecautionary ? '1.5px dashed #00D4AA' : '2px solid #0F0F11',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: 11,
            color: '#0F0F11',
            fontFamily: 'system-ui',
            cursor: 'pointer',
          }}
        >
          {isPrecautionary ? null : index + 1}
        </div>
      </Marker>
      {isSelected && (
        <Popup
          latitude={station.latitude}
          longitude={station.longitude}
          offset={16}
          closeOnClick={false}
          onClose={() => onSelect(null)}
        >
          <div style={{ fontFamily: 'system-ui', maxWidth: 250 }}>
            <h3 style={{ fontWeight: 'bold', margin: '0 0 4px' }}>{escapeHtml(station.name)}</h3>
            <p style={{ fontSize: 12, margin: '0 0 4px', color: '#666' }}>{escapeHtml(station.address)}</p>
            <p style={{ fontSize: 12, margin: 0 }}>
              <span style={{ color: '#FF4D4F', fontWeight: 'bold' }}>
                {'selected' in stop ? Math.round(stop.batteryPercentAtArrival) : stop.arrivalBatteryPercent}%
              </span>
              {' → '}
              <span style={{ color: '#00D4AA', fontWeight: 'bold' }}>
                {'selected' in stop ? Math.round(stop.batteryPercentAfterCharge) : stop.departureBatteryPercent}%
              </span>
              {` | ~${'selected' in stop ? Math.round(stop.selected.estimatedChargeTimeMin) : stop.estimatedChargingTimeMin}min`}
            </p>
            <p style={{ fontSize: 11, margin: '4px 0 0', color: '#888' }}>
              {station.maxPowerKw}kW | {station.connectorTypes.join(', ')} | {station.provider}
            </p>
            {isPrecautionary && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => stopInteractions.toggleReason(stopId)}
                    aria-expanded={isReasonRevealed}
                    style={{ border: 0, padding: 0, background: 'transparent', color: '#00A888', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    {t('extra_stop_why' as Parameters<typeof t>[0])}
                  </button>
                  <button
                    type="button"
                    onClick={() => stopInteractions.requestDismiss(stopId)}
                    aria-label={t('extra_stop_dismiss_aria' as Parameters<typeof t>[0], { stationName: station.name })}
                    style={{ border: 0, padding: 0, background: 'transparent', color: '#666', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    {t('extra_stop_dismiss' as Parameters<typeof t>[0])}
                  </button>
                </div>
                {isReasonRevealed && reasonLocaleKey && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#444', lineHeight: 1.4 }}>
                    <div style={{ fontWeight: 700, color: '#222', marginBottom: 2 }}>
                      {t('extra_stop_why_title' as Parameters<typeof t>[0])}
                    </div>
                    {t(reasonLocaleKey as Parameters<typeof t>[0])}
                  </div>
                )}
                {stopInteractions.confirmingStopId === stopId && (
                  <div role="dialog" aria-modal="false" style={{ marginTop: 8, padding: 8, border: '1px solid #e5e7eb', borderRadius: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#222' }}>
                      {t('extra_stop_dismiss_confirm_title' as Parameters<typeof t>[0])}
                    </div>
                    <p style={{ fontSize: 12, color: '#666', margin: '4px 0 8px', lineHeight: 1.4 }}>
                      {t('extra_stop_dismiss_confirm_body' as Parameters<typeof t>[0])}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      <button
                        type="button"
                        onClick={stopInteractions.cancelDismiss}
                        style={{ border: 0, background: 'transparent', color: '#666', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >
                        {t('extra_stop_dismiss_confirm_cancel' as Parameters<typeof t>[0])}
                      </button>
                      <button
                        type="button"
                        onClick={() => stopInteractions.confirmDismiss(stopId)}
                        style={{ border: 0, background: '#00D4AA', color: '#0F0F11', borderRadius: 4, padding: '4px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                      >
                        {t('extra_stop_dismiss_confirm_action' as Parameters<typeof t>[0])}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                marginTop: 8,
                padding: '4px 12px',
                background: '#00D4AA',
                color: '#0F0F11',
                borderRadius: 4,
                textDecoration: 'none',
                fontSize: 12,
                fontWeight: 'bold',
              }}
            >
              {t('popup_navigate')}
            </a>
          </div>
        </Popup>
      )}
    </>
  );
}

function AlternativeMarker({
  alt,
  stopIdx,
  altIdx,
  isSelected,
  onSelect,
}: {
  readonly alt: RankedStation;
  readonly stopIdx: number;
  readonly altIdx: number;
  readonly isSelected: boolean;
  readonly onSelect: (sel: { stopIdx: number; altIdx: number } | null) => void;
}) {
  const { t } = useLocale();
  const station = alt.station;
  const color = PROVIDER_COLORS[station.provider] ?? DEFAULT_MARKER_COLOR;
  const detourMin = Math.round((alt.detourDriveTimeSec * 2) / 60);
  const chargeTimeMin = Math.round(alt.estimatedChargeTimeMin);

  return (
    <>
      <Marker
        latitude={station.latitude}
        longitude={station.longitude}
        anchor="center"
        onClick={(e: { originalEvent: MouseEvent }) => {
          e.originalEvent.stopPropagation();
          if (!isSelected) trackAlternativeMarkerClicked(stopIdx, altIdx);
          onSelect(isSelected ? null : { stopIdx, altIdx });
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: color,
            border: '2px solid #0F0F11',
            opacity: isSelected ? 1 : 0.55,
            cursor: 'pointer',
            transition: 'opacity 150ms ease-out',
          }}
          aria-label={`Backup station ${altIdx + 1} for stop ${stopIdx + 1}`}
        />
      </Marker>
      {isSelected && (
        <Popup
          latitude={station.latitude}
          longitude={station.longitude}
          offset={12}
          closeOnClick={false}
          onClose={() => onSelect(null)}
        >
          <div style={{ fontFamily: 'system-ui', maxWidth: 250 }}>
            <div style={{ fontSize: 10, fontWeight: 'bold', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
              {t('popup_backup_for_stop', { n: String(stopIdx + 1) })}
            </div>
            <h3 style={{ fontWeight: 'bold', margin: '0 0 4px' }}>{escapeHtml(station.name)}</h3>
            <p style={{ fontSize: 12, margin: '0 0 4px', color: '#666' }}>{escapeHtml(station.address)}</p>
            <p style={{ fontSize: 11, margin: '0 0 4px', color: '#888' }}>
              {station.maxPowerKw}kW | {station.connectorTypes.join(', ')} | {station.provider}
            </p>
            <p style={{ fontSize: 12, margin: 0 }}>
              <span style={{ color: '#FFAB40', fontWeight: 'bold' }}>
                {t('stations_detour', { time: String(detourMin) })}
              </span>
              {' | '}
              {t('popup_charge_time', { minutes: String(chargeTimeMin) })}
            </p>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackAlternativeNavigateClicked(stopIdx, altIdx)}
              style={{
                display: 'inline-block',
                marginTop: 8,
                padding: '4px 12px',
                background: '#00D4AA',
                color: '#0F0F11',
                borderRadius: 4,
                textDecoration: 'none',
                fontSize: 12,
                fontWeight: 'bold',
              }}
            >
              {t('popup_navigate')}
            </a>
          </div>
        </Popup>
      )}
    </>
  );
}

function WaypointMarker({ lat, lng, label }: { readonly lat: number; readonly lng: number; readonly label: string }) {
  return (
    <Marker latitude={lat} longitude={lng} anchor="center">
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: '#3b82f6',
          border: '2px solid #0F0F11',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 'bold',
          fontSize: 12,
          color: '#ffffff',
          fontFamily: 'system-ui',
        }}
      >
        {label}
      </div>
    </Marker>
  );
}

function TripOverlay({
  tripPlan,
  waypoints,
  stopInteractions,
}: {
  readonly tripPlan: TripPlan;
  readonly waypoints?: readonly WaypointMarkerData[];
  readonly stopInteractions: PrecautionaryStopInteractions;
}) {
  const { current: mapRef } = useMap();
  const [selectedStop, setSelectedStop] = useState<number | null>(null);
  const [selectedAlt, setSelectedAlt] = useState<{ stopIdx: number; altIdx: number } | null>(null);

  const path = useMemo(() => decodePolyline(tripPlan.polyline), [tripPlan.polyline]);
  const visibleChargingStops = useMemo(
    () => tripPlan.chargingStops.filter(
      stop => !stopInteractions.effectiveDismissedStopIds.has(getStopIdentity(stop)),
    ),
    [tripPlan.chargingStops, stopInteractions.effectiveDismissedStopIds],
  );

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
    visibleChargingStops.forEach((s) => {
      const st = getStopStation(s);
      bounds.extend([st.longitude, st.latitude]);
    });
    waypoints?.forEach((wp) => {
      bounds.extend([wp.lng, wp.lat]);
    });
    mapRef.fitBounds(bounds, { padding: 50 });
  }, [mapRef, path, visibleChargingStops, waypoints]);

  const handleStopSelect = useCallback((index: number | null) => {
    setSelectedStop(index);
    if (index !== null) setSelectedAlt(null);
  }, []);

  const handleAltSelect = useCallback(
    (sel: { stopIdx: number; altIdx: number } | null) => {
      setSelectedAlt(sel);
      if (sel !== null) setSelectedStop(null);
    },
    [],
  );

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

      {/* Waypoint markers (blue numbered) */}
      {waypoints?.map((wp, i) => (
        <WaypointMarker key={`wp-${i}`} lat={wp.lat} lng={wp.lng} label={wp.label} />
      ))}

      {/* Charging stop markers (yellow) */}
      {visibleChargingStops.map((stop, index) => (
        <StopMarker
          key={`${getStopIdentity(stop)}-${index}`}
          stop={stop}
          index={index}
          isSelected={selectedStop === index}
          onSelect={handleStopSelect}
          stopInteractions={stopInteractions}
        />
      ))}

      {/* Alternative station markers (smaller, dimmed) — ADR-0006 */}
      {visibleChargingStops.flatMap((stop, stopIdx) =>
        'selected' in stop
          ? stop.alternatives.map((alt, altIdx) => (
              <AlternativeMarker
                key={`alt-${stopIdx}-${alt.station.id}`}
                alt={alt}
                stopIdx={stopIdx}
                altIdx={altIdx}
                isSelected={selectedAlt?.stopIdx === stopIdx && selectedAlt?.altIdx === altIdx}
                onSelect={handleAltSelect}
              />
            ))
          : [],
      )}
    </>
  );
}

export default function MapboxMap({ tripPlan, waypoints, precautionaryStopInteractions }: MapboxMapProps) {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';
  const tripPlanResetKey = tripPlan
    ? (tripPlan.tripId ?? `${tripPlan.startAddress}|${tripPlan.endAddress}|${tripPlan.polyline}`)
    : null;
  const internalStopInteractions = usePrecautionaryStopInteractions(tripPlanResetKey);
  const stopInteractions = precautionaryStopInteractions ?? internalStopInteractions;

  if (!mapboxToken) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[var(--color-surface)] text-[var(--color-danger)]">
        Mapbox access token not configured
      </div>
    );
  }

  return (
    <MapGL
      mapboxAccessToken={mapboxToken}
      initialViewState={{
        latitude: VIETNAM_CENTER.lat,
        longitude: VIETNAM_CENTER.lng,
        zoom: VIETNAM_ZOOM,
      }}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/dark-v11"
    >
      {tripPlan && (
        <TripOverlay
          tripPlan={tripPlan}
          waypoints={waypoints}
          stopInteractions={stopInteractions}
        />
      )}
    </MapGL>
  );
}
