import type { ChargingStop } from '@/types';

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

/** Build sanitized popup HTML for a charging stop. Shared between Leaflet and Google Maps. */
export function buildStopPopupHtml(stop: ChargingStop): string {
  const name = escapeHtml(stop.station.name);
  const address = escapeHtml(stop.station.address);
  const provider = escapeHtml(stop.station.provider);
  const connectors = escapeHtml(stop.station.connectorTypes.join(', '));

  return `
    <div style="font-family:system-ui;max-width:250px">
      <h3 style="font-weight:bold;margin:0 0 4px">${name}</h3>
      <p style="font-size:12px;margin:0 0 4px;color:#666">${address}</p>
      <p style="font-size:12px;margin:0">
        <span style="color:#FF3B30;font-weight:bold">${stop.arrivalBatteryPercent}%</span>
        → <span style="color:#00D4AA;font-weight:bold">${stop.departureBatteryPercent}%</span>
        | ~${stop.estimatedChargingTimeMin}min
      </p>
      <p style="font-size:11px;margin:4px 0 0;color:#888">
        ⚡ ${stop.station.maxPowerKw}kW | ${connectors} | ${provider}
      </p>
      <a href="https://www.google.com/maps/dir/?api=1&destination=${stop.station.latitude},${stop.station.longitude}"
         target="_blank" rel="noopener noreferrer"
         style="display:inline-block;margin-top:8px;padding:4px 12px;background:#00D4AA;color:#0A0A0B;
                border-radius:4px;text-decoration:none;font-size:12px;font-weight:bold">
        Navigate
      </a>
    </div>
  `;
}

/** Build an SVG marker URL for both map renderers. */
export function createSvgMarkerUrl(color: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30">
    <circle cx="15" cy="15" r="13" fill="${color}" stroke="#0A0A0B" stroke-width="2"/>
    <text x="15" y="20" text-anchor="middle" font-size="12" font-weight="bold" fill="#0A0A0B" font-family="system-ui">${label}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
