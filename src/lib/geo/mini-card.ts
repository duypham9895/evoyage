import { escapeHtml, PROVIDER_COLORS } from './map-utils';

// ── Types ──

export interface MiniCardData {
  readonly name: string;
  readonly distanceKm: number;
  readonly maxPowerKw: number;
  readonly connectorTypes: readonly string[];
  readonly portCount: number;
  readonly provider: string;
  readonly chargingStatus: string | null;
  readonly isCompatible: boolean | null;
  readonly estimatedChargeTimeMin: number | null;
  readonly latitude: number;
  readonly longitude: number;
}

export interface MiniCardLabels {
  readonly available: string;
  readonly busy: string;
  readonly offline: string;
  readonly statusUnknown: string;
  readonly disclaimer: string;
  readonly compatible: string;
  readonly notCompatible: string;
  readonly chargeTime: string;
  readonly askEVi: string;
  readonly navigate: string;
  readonly ports: string;
}

export const DEFAULT_LABELS: MiniCardLabels = {
  available: 'Available',
  busy: 'Busy',
  offline: 'Offline',
  statusUnknown: 'Status unknown',
  disclaimer: 'Status may not be current',
  compatible: 'Compatible',
  notCompatible: 'Not compatible',
  chargeTime: '~{minutes} min to 80%',
  askEVi: 'Ask eVi',
  navigate: 'Navigate',
  ports: '{count} ports',
};

// ── Status Display Mapping ──

interface StatusDisplay {
  readonly label: string;
  readonly color: string;
}

function getStatusDisplay(status: string | null, labels: MiniCardLabels): StatusDisplay {
  if (!status) return { label: labels.statusUnknown, color: '#888888' };
  const upper = status.toUpperCase();
  if (upper === 'ACTIVE') return { label: labels.available, color: '#34C759' };
  if (upper === 'BUSY') return { label: labels.busy, color: '#FFAB40' };
  if (upper === 'UNAVAILABLE' || upper === 'INACTIVE') return { label: labels.offline, color: '#666666' };
  return { label: labels.statusUnknown, color: '#888888' };
}

// ── Render Mini-Card HTML ──

export function renderMiniCardHtml(data: MiniCardData, labels: MiniCardLabels = DEFAULT_LABELS): string {
  const name = escapeHtml(data.name);
  const provider = escapeHtml(data.provider);
  const connectors = escapeHtml(data.connectorTypes.join(', '));
  const providerColor = PROVIDER_COLORS[data.provider] ?? '#888888';
  const status = getStatusDisplay(data.chargingStatus, labels);

  const statusBadge = `<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;background:${status.color}22;color:${status.color}">${escapeHtml(status.label)}</span>`;

  const disclaimer = data.chargingStatus
    ? `<div style="font-size:9px;color:#667;margin-top:4px">${escapeHtml(labels.disclaimer)}</div>`
    : '';

  const compatLine = renderCompatLine(data.isCompatible, labels);
  const chargeTimeLine = renderChargeTime(data.estimatedChargeTimeMin, labels);

  const portsLabel = escapeHtml(labels.ports.replace('{count}', String(data.portCount)));
  const lat = Number(data.latitude).toFixed(6);
  const lng = Number(data.longitude).toFixed(6);

  return (
    `<div style="font-family:system-ui;max-width:220px;font-size:12px;line-height:1.5">` +
      `<div style="font-weight:600;color:${providerColor};margin-bottom:4px">${name}</div>` +
      `<div style="display:flex;justify-content:space-between;color:#aab;font-size:11px;margin-bottom:3px">` +
        `<span>${data.distanceKm.toFixed(1)} km</span>` +
        `<span>${data.maxPowerKw} kW ${connectors}</span>` +
      `</div>` +
      `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">` +
        `<span style="font-size:11px;color:#aab">${portsLabel}</span>` +
        `<span style="font-size:11px;color:#aab">${provider}</span>` +
      `</div>` +
      `<div style="margin-bottom:3px">${statusBadge}</div>` +
      compatLine +
      chargeTimeLine +
      disclaimer +
      `<div style="display:flex;gap:6px;margin-top:8px">` +
        `<button data-action="ask-evi" ` +
          `style="flex:1;padding:5px 8px;background:rgba(0,212,170,0.15);border:1px solid rgba(0,212,170,0.3);` +
          `border-radius:6px;color:#00D4AA;font-size:10px;font-weight:600;cursor:pointer">` +
          `${escapeHtml(labels.askEVi)}` +
        `</button>` +
        `<a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}" ` +
          `target="_blank" rel="noopener noreferrer" ` +
          `style="flex:1;display:flex;align-items:center;justify-content:center;padding:5px 8px;` +
          `background:rgba(91,155,255,0.15);border:1px solid rgba(91,155,255,0.3);` +
          `border-radius:6px;color:#5B9BFF;font-size:10px;font-weight:600;text-decoration:none;cursor:pointer">` +
          `${escapeHtml(labels.navigate)}` +
        `</a>` +
      `</div>` +
    `</div>`
  );
}

// ── Helper Fragments ──

function renderCompatLine(isCompatible: boolean | null, labels: MiniCardLabels): string {
  if (isCompatible === null) return '';
  const color = isCompatible ? '#34C759' : '#FF3B30';
  const label = isCompatible ? labels.compatible : labels.notCompatible;
  return `<div style="font-size:11px;color:${color};margin-bottom:3px">${escapeHtml(label)}</div>`;
}

function renderChargeTime(minutes: number | null, labels: MiniCardLabels): string {
  if (minutes === null) return '';
  const text = labels.chargeTime.replace('{minutes}', String(minutes));
  return `<div style="font-size:11px;color:#aab;margin-bottom:3px">${escapeHtml(text)}</div>`;
}
