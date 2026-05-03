/**
 * EVPower locator response parser.
 *
 * Source: https://evpower.vn/ajax/loadMap (POST, no auth) returns a JSON
 * array of stations with the shape captured in
 * scripts/__fixtures__/evpower-loadmap-sample.json. Field names are mostly
 * Vietnamese-prefixed underscores (`_address`, `_status`, `_content`).
 *
 * The API does not expose a stable station ID, so `evpowerId` is derived
 * deterministically from name + rounded coordinates.
 */

import { createHash } from 'node:crypto';

export interface EVPowerRaw {
  readonly name: string;
  readonly _type: string;     // "DC" | "AC"
  readonly _status: string;   // e.g. "Đang Hoạt Động"
  readonly _address: string;
  readonly lat: string;
  readonly lng: string;
  readonly _phone: string;
  readonly _content: string;  // e.g. "2 CCS2: 120 kW"
}

export interface ParsedEVPowerStation {
  readonly evpowerId: string;
  readonly name: string;
  readonly address: string;
  readonly province: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly chargerTypes: string;
  readonly connectorTypes: string;
  readonly portCount: number;
  readonly maxPowerKw: number;
  readonly stationType: string;
  readonly isVinFastOnly: false;
  readonly provider: 'EVPower';
  readonly dataSource: 'evpower';
  readonly hotline: string | null;
  readonly chargingStatus: string;
}

const CONTENT_REGEX = /^\s*(\d+)\s*([A-Za-z][\w\s]*?)\s*[:：]\s*(\d+)\s*k?W/i;

export function parseConnectorsAndPower(content: string): {
  connectors: string[];
  portCount: number;
  maxPowerKw: number;
} {
  if (!content || !content.trim()) {
    return { connectors: ['Unknown'], portCount: 1, maxPowerKw: 0 };
  }
  const match = CONTENT_REGEX.exec(content);
  if (!match) {
    return { connectors: ['Unknown'], portCount: 1, maxPowerKw: 0 };
  }
  const portCount = parseInt(match[1], 10);
  const rawConnector = match[2].trim().toLowerCase();
  const maxPowerKw = parseInt(match[3], 10);

  let connector = 'Unknown';
  if (rawConnector.includes('ccs')) connector = 'CCS2';
  else if (rawConnector.includes('chademo')) connector = 'CHAdeMO';
  else if (rawConnector.includes('type 2') || rawConnector.includes('type2')) connector = 'Type2_AC';
  else if (rawConnector.includes('type 1') || rawConnector.includes('type1')) connector = 'Type1';

  return { connectors: [connector], portCount, maxPowerKw };
}

export function parseProvinceFromAddress(address: string): string {
  if (!address) return 'Unknown';
  const segments = address.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const seg = segments[i];
    if (/^Tỉnh\s+/i.test(seg)) return seg.replace(/^Tỉnh\s+/i, '').trim();
    if (/^TP\.?\s+/i.test(seg) || /^Thành ph[ốo]\s+/i.test(seg)) return seg;
  }
  return segments[segments.length - 1] ?? 'Unknown';
}

function mapStatus(raw: string): string {
  const norm = raw?.trim().toLowerCase() ?? '';
  if (norm.includes('hoạt động') || norm.includes('hoat dong') || norm.includes('active')) return 'ACTIVE';
  if (norm.includes('bảo trì') || norm.includes('maintenance')) return 'OUTOFSERVICE';
  if (norm.includes('sắp')) return 'INACTIVE';
  return 'UNAVAILABLE';
}

export function evpowerStationKey(name: string, lat: number, lng: number): string {
  const seed = `${name.trim().toLowerCase()}|${lat.toFixed(5)}|${lng.toFixed(5)}`;
  const hash = createHash('sha256').update(seed).digest('hex').slice(0, 16);
  return `evp_${hash}`;
}

export function parseEVPowerStation(raw: EVPowerRaw): ParsedEVPowerStation {
  const lat = parseFloat(raw.lat);
  const lng = parseFloat(raw.lng);
  const { connectors, portCount, maxPowerKw } = parseConnectorsAndPower(raw._content);
  const stationType = raw._type === 'AC' ? 'AC' : 'DC';
  const chargerTypes = `${stationType}_${maxPowerKw}kW`;
  return {
    evpowerId: evpowerStationKey(raw.name, lat, lng),
    name: raw.name.trim(),
    address: raw._address.trim(),
    province: parseProvinceFromAddress(raw._address),
    latitude: lat,
    longitude: lng,
    chargerTypes,
    connectorTypes: connectors.join(','),
    portCount,
    maxPowerKw,
    stationType,
    isVinFastOnly: false,
    provider: 'EVPower',
    dataSource: 'evpower',
    hotline: raw._phone?.trim() || null,
    chargingStatus: mapStatus(raw._status),
  };
}
