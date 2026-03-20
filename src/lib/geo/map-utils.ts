import type { ChargingStop, ChargingStopWithAlternatives } from '@/types';
import { getStopStation } from '@/types';

export const VIETNAM_CENTER = { lat: 14.0583, lng: 108.2772 };
export const VIETNAM_ZOOM = 6;

export const PROVIDER_COLORS: Record<string, string> = {
  VinFast: '#34C759',
  EverCharge: '#007AFF',
  EVONE: '#5856D6',
  EVPower: '#FF9500',
  'CHARGE+': '#FF2D55',
};
export const DEFAULT_MARKER_COLOR = '#8E8E93';

/** Escape HTML special characters to prevent XSS in map popups. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Build sanitized popup HTML for a charging stop. Shared between Leaflet and Mapbox. */
export function buildStopPopupHtml(stop: ChargingStop | ChargingStopWithAlternatives): string {
  const station = getStopStation(stop);
  const name = escapeHtml(station.name);
  const address = escapeHtml(station.address);
  const provider = escapeHtml(station.provider);
  const connectors = escapeHtml(station.connectorTypes.join(', '));
  const arrivalBattery = 'selected' in stop ? Math.round(stop.batteryPercentAtArrival) : stop.arrivalBatteryPercent;
  const departureBattery = 'selected' in stop ? Math.round(stop.batteryPercentAfterCharge) : stop.departureBatteryPercent;
  const chargingTime = 'selected' in stop ? Math.round(stop.selected.estimatedChargeTimeMin) : stop.estimatedChargingTimeMin;

  return `
    <div style="font-family:system-ui;max-width:250px">
      <h3 style="font-weight:bold;margin:0 0 4px">${name}</h3>
      <p style="font-size:12px;margin:0 0 4px;color:#666">${address}</p>
      <p style="font-size:12px;margin:0">
        <span style="color:#FF3B30;font-weight:bold">${arrivalBattery}%</span>
        → <span style="color:#00D4AA;font-weight:bold">${departureBattery}%</span>
        | ~${chargingTime}min
      </p>
      <p style="font-size:11px;margin:4px 0 0;color:#888">
        ⚡ ${station.maxPowerKw}kW | ${connectors} | ${provider}
      </p>
      <a href="https://www.google.com/maps/dir/?api=1&destination=${Number(station.latitude).toFixed(6)},${Number(station.longitude).toFixed(6)}"
         target="_blank" rel="noopener noreferrer"
         style="display:inline-block;margin-top:8px;padding:4px 12px;background:#00D4AA;color:#0A0A0B;
                border-radius:4px;text-decoration:none;font-size:12px;font-weight:bold">
        Navigate
      </a>
    </div>
  `;
}

/** Build an SVG marker URL for both map renderers. */
export function createSvgMarkerUrl(color: string, label: string, textColor: string = '#0A0A0B'): string {
  // Validate colors are hex to prevent SVG injection
  const safeColor = /^#[0-9A-Fa-f]{3,6}$/.test(color) ? color : '#8E8E93';
  const safeTextColor = /^#[0-9A-Fa-f]{3,6}$/.test(textColor) ? textColor : '#0A0A0B';
  const safeLabel = escapeHtml(label);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30">
    <circle cx="15" cy="15" r="13" fill="${safeColor}" stroke="#0A0A0B" stroke-width="2"/>
    <text x="15" y="20" text-anchor="middle" font-size="12" font-weight="bold" fill="${safeTextColor}" font-family="system-ui">${safeLabel}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
