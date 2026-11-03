import { describe, it, expect } from 'vitest';
import { buildStopPopupHtml, getStationColorKey } from './map-utils';
import type { ChargingStationData, ChargingStop } from '@/types';

const station: ChargingStationData = {
  id: 'st-1',
  name: 'VinFast Charging Bảo Lộc',
  address: '12 Trần Phú, Bảo Lộc',
  province: 'Lâm Đồng',
  latitude: 11.5464,
  longitude: 107.8047,
  chargerTypes: ['DC'],
  connectorTypes: ['CCS2'],
  portCount: 4,
  maxPowerKw: 150,
  stationType: 'public',
  isVinFastOnly: false,
  operatingHours: '24/7',
  provider: 'VinFast',
  chargingStatus: 'ACTIVE',
  parkingFee: null,
};

const stop: ChargingStop = {
  station,
  distanceFromStartKm: 120,
  arrivalBatteryPercent: 22,
  departureBatteryPercent: 80,
  estimatedChargingTimeMin: 25,
};

describe('buildStopPopupHtml', () => {
  it('renders the caller-supplied navigate label so the popup can be localized', () => {
    const html = buildStopPopupHtml(stop, 'Đi đến trạm');

    expect(html).toContain('Đi đến trạm');
    expect(html).not.toContain('Navigate');
  });

  it('escapes HTML in the navigate label', () => {
    const html = buildStopPopupHtml(stop, '<img src=x onerror=alert(1)>');

    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('renders the power/connector row without an emoji icon', () => {
    const html = buildStopPopupHtml(stop, 'Navigate');

    expect(html).not.toContain('⚡');
    expect(html).toContain('150kW');
    expect(html).toContain('CCS2');
  });
});

describe('getStationColorKey', () => {
  it('maps ACTIVE/active to available', () => {
    expect(getStationColorKey('ACTIVE')).toBe('available');
    expect(getStationColorKey('active')).toBe('available');
  });

  it('maps BUSY/busy to busy', () => {
    expect(getStationColorKey('BUSY')).toBe('busy');
    expect(getStationColorKey('busy')).toBe('busy');
  });

  it('maps UNAVAILABLE/INACTIVE (either case) to unavailable', () => {
    expect(getStationColorKey('UNAVAILABLE')).toBe('unavailable');
    expect(getStationColorKey('unavailable')).toBe('unavailable');
    expect(getStationColorKey('INACTIVE')).toBe('unavailable');
    expect(getStationColorKey('inactive')).toBe('unavailable');
  });

  it('maps null, empty string, and unrecognized values to unknown', () => {
    expect(getStationColorKey(null)).toBe('unknown');
    expect(getStationColorKey('')).toBe('unknown');
    expect(getStationColorKey('some-random-value')).toBe('unknown');
  });
});
