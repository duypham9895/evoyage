import { describe, it, expect } from 'vitest';
import { buildStopPopupHtml } from './map-utils';
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
