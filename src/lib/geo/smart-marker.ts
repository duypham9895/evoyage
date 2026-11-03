import { PROVIDER_COLORS, DEFAULT_MARKER_COLOR, getStationColorKey } from './map-utils';

// ── Types ──

export interface SmartMarkerData {
  readonly provider: string;
  readonly maxPowerKw: number;
  readonly chargingStatus: string | null;
  readonly isCompatible?: boolean | null;
}

export interface MarkerSizeResult {
  readonly size: number;
  readonly className: string;
  readonly showLabel: boolean;
}

export interface StatusRingResult {
  readonly color: string;
  readonly style: string;
}

// ── Power → Size Mapping ──

export function getMarkerSize(powerKw: number): MarkerSizeResult {
  if (powerKw >= 100) {
    return { size: 36, className: 'power-fast', showLabel: true };
  }
  if (powerKw >= 30) {
    return { size: 28, className: 'power-medium', showLabel: false };
  }
  return { size: 20, className: 'power-slow', showLabel: false };
}

// ── Status → Ring Style Mapping ──
// Status colours come from the shared role tokens (D8-A), via map-utils.ts's
// getStationColorKey, so the ring colour matches the mini-card badge exactly.

export function getStatusRingStyle(status: string | null): StatusRingResult {
  const key = getStationColorKey(status);
  const color = `var(--color-status-${key}-border)`;
  if (key === 'unknown') {
    return { color, style: `border:2px dashed ${color}` };
  }
  return { color, style: `box-shadow:0 0 0 3px ${color}` };
}

// ── Render Smart Marker HTML ──

export function renderSmartMarkerHtml(data: SmartMarkerData): string {
  const { size, showLabel } = getMarkerSize(data.maxPowerKw);
  const statusRing = getStatusRingStyle(data.chargingStatus);
  const providerColor = PROVIDER_COLORS[data.provider] ?? DEFAULT_MARKER_COLOR;

  const label = showLabel ? `${data.maxPowerKw}` : '';
  const fontSize = size >= 36 ? '11px' : '9px';

  const compatDot = renderCompatDot(data.isCompatible);

  return (
    `<div style="` +
    `position:relative;` +
    `width:${size}px;height:${size}px;` +
    `border-radius:50%;` +
    `background:${providerColor};` +
    `border:2px solid #0F0F11;` +
    `${statusRing.style};` +
    `display:flex;align-items:center;justify-content:center;` +
    `font-weight:bold;font-size:${fontSize};color:#0F0F11;font-family:system-ui` +
    `">` +
    label +
    compatDot +
    `</div>`
  );
}

// ── Compatibility Dot ──

function renderCompatDot(isCompatible: boolean | null | undefined): string {
  if (isCompatible == null) return '';

  const dotColor = isCompatible ? '#34C759' : '#FF3B30';
  return (
    `<div class="compat-dot" style="` +
    `position:absolute;top:-2px;right:-2px;` +
    `width:8px;height:8px;border-radius:50%;` +
    `background:${dotColor};border:1px solid #0F0F11` +
    `"></div>`
  );
}
