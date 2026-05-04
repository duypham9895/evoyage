import { describe, it, expect } from 'vitest';
import { buildGoogleMapsUrl } from './google-maps-url';
import type { TripPlan, ChargingStop } from '@/types';

function makeStop(lat: number, lng: number, name = 'Test Station'): ChargingStop {
  return {
    station: {
      id: `s-${lat}-${lng}`,
      name,
      address: 'Some address',
      latitude: lat,
      longitude: lng,
      maxPowerKw: 150,
      portCount: 4,
      connectorTypes: ['CCS2'],
      operatingHours: '24/7',
      parkingFee: null,
      provider: 'VinFast',
      chargingStatus: null,
      lastVerifiedAt: null,
    } as never, // tests don't exercise full ChargingStationData shape
    distanceFromStartKm: 200,
    arrivalBatteryPercent: 20,
    departureBatteryPercent: 80,
    estimatedChargingTimeMin: 30,
  };
}

function makePlan(overrides: Partial<TripPlan> = {}): TripPlan {
  return {
    totalDistanceKm: 300,
    totalDurationMin: 360,
    chargingStops: [],
    warnings: [],
    batterySegments: [],
    arrivalBatteryPercent: 20,
    totalChargingTimeMin: 0,
    polyline: '',
    startAddress: 'Quận 1, TP.HCM',
    endAddress: 'Đà Lạt',
    startCoord: { lat: 10.776, lng: 106.700 },
    endCoord: { lat: 11.940, lng: 108.443 },
    ...overrides,
  };
}

describe('buildGoogleMapsUrl', () => {
  it('passes origin and destination as lat,lng — never the user-typed label', () => {
    // Regression: "Đà Lạt" passed as text caused GMaps to pick a HCMC restaurant
    // ("Đà Lạt Năm Xưa") instead of the city. Using lat/lng eliminates that.
    const plan = makePlan();
    const url = buildGoogleMapsUrl(plan);
    const params = new URL(url).searchParams;

    expect(params.get('origin')).toBe('10.776,106.7');
    expect(params.get('destination')).toBe('11.94,108.443');
    expect(params.get('origin')).not.toContain('Quận 1');
    expect(params.get('destination')).not.toContain('Đà Lạt');
  });

  it('includes charging stops as pipe-separated waypoints in plan order', () => {
    const plan = makePlan({
      chargingStops: [
        makeStop(11.526, 107.770, 'Bảo Lộc'),
        makeStop(11.800, 108.200, 'D\'Ran'),
      ],
    });
    const url = buildGoogleMapsUrl(plan);
    const params = new URL(url).searchParams;

    expect(params.get('waypoints')).toBe('11.526,107.77|11.8,108.2');
  });

  it('omits the waypoints param entirely when there are no charging stops', () => {
    const plan = makePlan({ chargingStops: [] });
    const url = buildGoogleMapsUrl(plan);

    expect(new URL(url).searchParams.has('waypoints')).toBe(false);
  });

  it('sets api=1 and travelmode=driving (GMaps deep-link contract)', () => {
    const url = buildGoogleMapsUrl(makePlan());
    const params = new URL(url).searchParams;

    expect(params.get('api')).toBe('1');
    expect(params.get('travelmode')).toBe('driving');
  });

  it('uses the GMaps web /dir/ endpoint (works on phone GMaps via app linking)', () => {
    expect(buildGoogleMapsUrl(makePlan())).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?/);
  });

  it('handles ChargingStopWithAlternatives shape (selected.station)', () => {
    const plan = makePlan({
      chargingStops: [
        {
          selected: {
            station: { latitude: 11.5, longitude: 107.7 } as never,
            detourDriveTimeSec: 0,
            estimatedChargeTimeMin: 30,
            totalStopTimeMin: 30,
            rank: 'best',
            score: 1,
          },
          alternatives: [],
          distanceAlongRouteKm: 200,
          batteryPercentAtArrival: 20,
          batteryPercentAfterCharge: 80,
        },
      ],
    });

    const url = buildGoogleMapsUrl(plan);
    expect(new URL(url).searchParams.get('waypoints')).toBe('11.5,107.7');
  });
});
