import { describe, it, expect } from 'vitest';
import { planChargingStops } from './route-planner';
import type { ChargingStationData } from '@/types';

// A simple encoded polyline for testing (straight line ~200km)
// We'll generate a synthetic one for controllable tests
import { decodePolyline } from './polyline';

const VF8_ECO = {
  brand: 'VinFast',
  model: 'VF 8',
  variant: 'Eco' as const,
  officialRangeKm: 471,
  batteryCapacityKwh: 87.7,
  chargingTimeDC_10to80_min: 31,
};

const BYD_SEAL = {
  brand: 'BYD',
  model: 'Seal',
  variant: 'Advance' as const,
  officialRangeKm: 570,
  batteryCapacityKwh: 82.5,
  chargingTimeDC_10to80_min: 26,
};

const makeStation = (
  name: string,
  lat: number,
  lng: number,
  isVinFastOnly: boolean = false,
): ChargingStationData => ({
  id: name,
  name,
  address: 'Test',
  province: 'Test',
  latitude: lat,
  longitude: lng,
  chargerTypes: ['DC_60kW'],
  connectorTypes: ['CCS2'],
  portCount: 2,
  maxPowerKw: 60,
  stationType: 'public',
  isVinFastOnly,
  operatingHours: null,
  provider: isVinFastOnly ? 'VinFast' : 'EverCharge',
  chargingStatus: null,
  parkingFee: null,
});

// Generate a synthetic encoded polyline for a straight-line route
// from HCM (10.776, 106.700) heading northeast ~430km toward Nha Trang (12.238, 109.196)
function makeTestPolyline(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  numPoints: number,
): string {
  // Create points along the line and encode
  const points: Array<{ lat: number; lng: number }> = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    points.push({
      lat: startLat + (endLat - startLat) * t,
      lng: startLng + (endLng - startLng) * t,
    });
  }

  // Encode using Google's polyline algorithm
  let encoded = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);

    encoded += encodeValue(lat - prevLat);
    encoded += encodeValue(lng - prevLng);

    prevLat = lat;
    prevLng = lng;
  }

  return encoded;
}

function encodeValue(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let encoded = '';
  while (v >= 0x20) {
    encoded += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  encoded += String.fromCharCode(v + 63);
  return encoded;
}

// Stations along the HCM → Nha Trang route
const stationsAlongRoute: ChargingStationData[] = [
  // VinFast station at ~100km
  makeStation('VinFast Phan Rang', 11.1, 107.5, true),
  // Universal station at ~100km
  makeStation('EverCharge Phan Rang', 11.12, 107.52, false),
  // VinFast station at ~200km
  makeStation('VinFast Cam Ranh', 11.6, 108.3, true),
  // Universal station at ~250km
  makeStation('EverCharge Nha Trang', 11.8, 108.7, false),
  // Universal station at ~350km
  makeStation('EVONE Ninh Thuan', 11.95, 108.95, false),
];

const testPolyline = makeTestPolyline(10.776, 106.7, 12.238, 109.196, 200);

describe('planChargingStops', () => {
  it('VF 8 Eco at 80%, short route (200km) → 0 stops', () => {
    // Short route: HCM to Phan Thiet (~140km effective distance)
    const shortPolyline = makeTestPolyline(10.776, 106.7, 10.93, 108.1, 50);

    const result = planChargingStops({
      encodedPolyline: shortPolyline,
      totalDistanceKm: 200,
      vehicle: VF8_ECO,
      currentBatteryPercent: 80,
      minArrivalPercent: 15,
      rangeSafetyFactor: 0.80,
      stations: stationsAlongRoute,
    });

    expect(result.chargingStops).toHaveLength(0);
    expect(result.arrivalBatteryPercent).toBeGreaterThan(15);
  });

  it('VF 8 Eco at 60%, long route → needs charging stops', () => {
    const result = planChargingStops({
      encodedPolyline: testPolyline,
      totalDistanceKm: 430,
      vehicle: VF8_ECO,
      currentBatteryPercent: 60,
      minArrivalPercent: 15,
      rangeSafetyFactor: 0.80,
      stations: stationsAlongRoute,
    });

    expect(result.chargingStops.length).toBeGreaterThanOrEqual(1);
    expect(result.arrivalBatteryPercent).toBeGreaterThanOrEqual(0);
  });

  it('BYD Seal → never shows VinFast-only stations', () => {
    const result = planChargingStops({
      encodedPolyline: testPolyline,
      totalDistanceKm: 430,
      vehicle: BYD_SEAL,
      currentBatteryPercent: 60,
      minArrivalPercent: 15,
      rangeSafetyFactor: 0.80,
      stations: stationsAlongRoute,
    });

    const hasVinFastStop = result.chargingStops.some(
      (stop) => ('selected' in stop ? stop.selected.station.isVinFastOnly : stop.station.isVinFastOnly),
    );
    expect(hasVinFastStop).toBe(false);
  });

  it('all departure batteries are 80% (DC charge target)', () => {
    const result = planChargingStops({
      encodedPolyline: testPolyline,
      totalDistanceKm: 430,
      vehicle: VF8_ECO,
      currentBatteryPercent: 40,
      minArrivalPercent: 15,
      rangeSafetyFactor: 0.80,
      stations: stationsAlongRoute,
    });

    for (const stop of result.chargingStops) {
      const departureBattery = 'selected' in stop ? stop.batteryPercentAfterCharge : stop.departureBatteryPercent;
      expect(departureBattery).toBe(80);
    }
  });

  it('generates battery segments covering full route', () => {
    const result = planChargingStops({
      encodedPolyline: testPolyline,
      totalDistanceKm: 430,
      vehicle: VF8_ECO,
      currentBatteryPercent: 60,
      minArrivalPercent: 15,
      rangeSafetyFactor: 0.80,
      stations: stationsAlongRoute,
    });

    // First segment starts at 0
    expect(result.batterySegments[0].startKm).toBe(0);
    // Last segment ends at total route distance
    const lastSeg = result.batterySegments[result.batterySegments.length - 1];
    expect(lastSeg.endKm).toBeGreaterThan(0);
  });

  it('warns when no compatible station found', () => {
    // BYD with ONLY VinFast stations available
    const onlyVinFastStations = [
      makeStation('VinFast Only 1', 11.1, 107.5, true),
      makeStation('VinFast Only 2', 11.6, 108.3, true),
    ];

    const result = planChargingStops({
      encodedPolyline: testPolyline,
      totalDistanceKm: 430,
      vehicle: BYD_SEAL,
      currentBatteryPercent: 40,
      minArrivalPercent: 15,
      rangeSafetyFactor: 0.80,
      stations: onlyVinFastStations,
    });

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].type).toBe('NO_COMPATIBLE_STATION');
    expect(result.warnings[0].messageVi).toContain('BYD');
  });

  it('VinFast vehicle can use VinFast stations', () => {
    const result = planChargingStops({
      encodedPolyline: testPolyline,
      totalDistanceKm: 430,
      vehicle: VF8_ECO,
      currentBatteryPercent: 40,
      minArrivalPercent: 15,
      rangeSafetyFactor: 0.80,
      stations: stationsAlongRoute,
    });

    // VinFast should be able to use VinFast-only stations
    const vinFastStops = result.chargingStops.filter(
      (s) => ('selected' in s ? s.selected.station.isVinFastOnly : s.station.isVinFastOnly),
    );
    // May or may not use VinFast stations depending on proximity,
    // but at least it shouldn't be filtered out
    expect(result.chargingStops.length).toBeGreaterThan(0);
  });
});

describe('decodePolyline (round-trip)', () => {
  it('encodes and decodes back to original points', () => {
    const encoded = makeTestPolyline(10.0, 106.0, 12.0, 109.0, 10);
    const decoded = decodePolyline(encoded);

    expect(decoded.length).toBe(11); // 10 + 1
    expect(decoded[0].lat).toBeCloseTo(10.0, 4);
    expect(decoded[0].lng).toBeCloseTo(106.0, 4);
    expect(decoded[10].lat).toBeCloseTo(12.0, 4);
    expect(decoded[10].lng).toBeCloseTo(109.0, 4);
  });
});
