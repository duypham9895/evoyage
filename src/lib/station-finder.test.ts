import { describe, it, expect } from 'vitest';
import {
  haversineDistance,
  filterCompatibleStations,
  findNearestStation,
} from './station-finder';
import type { ChargingStationData } from '@/types';

// HCM City Hall: 10.7769, 106.7009
// Phan Thiet: 10.9330, 108.1002
// Distance ~140km
const HCM: { lat: number; lng: number } = { lat: 10.7769, lng: 106.7009 };
const PHAN_THIET: { lat: number; lng: number } = { lat: 10.933, lng: 108.1002 };

const makeStation = (
  overrides: Partial<ChargingStationData> & { latitude: number; longitude: number; name: string },
): ChargingStationData => ({
  id: overrides.name,
  address: 'Test address',
  province: 'Test',
  chargerTypes: ['DC_60kW'],
  connectorTypes: ['CCS2'],
  portCount: 2,
  maxPowerKw: 60,
  stationType: 'public',
  isVinFastOnly: false,
  operatingHours: null,
  provider: 'EverCharge',
  ...overrides,
});

const VINFAST_STATION = makeStation({
  name: 'VinFast Station 1',
  latitude: 10.78,
  longitude: 106.71,
  isVinFastOnly: true,
  provider: 'VinFast',
});

const UNIVERSAL_STATION = makeStation({
  name: 'EverCharge Station 1',
  latitude: 10.79,
  longitude: 106.72,
  isVinFastOnly: false,
  provider: 'EverCharge',
});

const FAR_STATION = makeStation({
  name: 'Far Station',
  latitude: 12.0,
  longitude: 109.0,
  isVinFastOnly: false,
});

describe('haversineDistance', () => {
  it('HCM to Phan Thiet is ~140km', () => {
    const dist = haversineDistance(HCM, PHAN_THIET);
    expect(dist).toBeGreaterThan(130);
    expect(dist).toBeLessThan(160);
  });

  it('same point → 0', () => {
    expect(haversineDistance(HCM, HCM)).toBe(0);
  });

  it('symmetrical — distance A→B equals B→A', () => {
    const ab = haversineDistance(HCM, PHAN_THIET);
    const ba = haversineDistance(PHAN_THIET, HCM);
    expect(ab).toBeCloseTo(ba, 6);
  });
});

describe('filterCompatibleStations', () => {
  const stations = [VINFAST_STATION, UNIVERSAL_STATION];

  it('VinFast vehicle → returns ALL stations', () => {
    const result = filterCompatibleStations(stations, true);
    expect(result).toHaveLength(2);
  });

  it('non-VinFast vehicle → excludes VinFast-only stations', () => {
    const result = filterCompatibleStations(stations, false);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('EverCharge Station 1');
  });

  it('BYD must NEVER see VinFast stations', () => {
    const result = filterCompatibleStations(stations, false);
    const hasVinFast = result.some((s) => s.isVinFastOnly);
    expect(hasVinFast).toBe(false);
  });
});

describe('findNearestStation', () => {
  const stations = [VINFAST_STATION, UNIVERSAL_STATION, FAR_STATION];

  it('finds nearest station within default 5km radius', () => {
    const result = findNearestStation(HCM, stations);
    expect(result).not.toBeNull();
    expect(result!.station.name).toBe('VinFast Station 1');
    expect(result!.distanceKm).toBeLessThan(5);
  });

  it('returns null when no station within any search radius', () => {
    const farPoint = { lat: 20.0, lng: 100.0 }; // middle of nowhere
    const result = findNearestStation(farPoint, stations);
    expect(result).toBeNull();
  });

  it('expands search to larger radii if needed', () => {
    // Point near the far station (within 15km but not 5km)
    const nearFar = { lat: 12.05, lng: 109.05 };
    const result = findNearestStation(nearFar, [FAR_STATION], [5, 10, 15]);
    expect(result).not.toBeNull();
    expect(result!.station.name).toBe('Far Station');
  });
});
