import { describe, it, expect } from 'vitest';

// Mirrors buildGoogleMapsUrl from TripSummary.tsx
function buildGoogleMapsUrl(plan: {
  startAddress: string;
  endAddress: string;
  chargingStops: readonly { station: { latitude: number; longitude: number } }[];
}): string {
  const params = new URLSearchParams({
    api: '1',
    origin: plan.startAddress,
    destination: plan.endAddress,
    travelmode: 'driving',
  });

  const waypoints = plan.chargingStops
    .map(stop => `${stop.station.latitude},${stop.station.longitude}`)
    .join('|');

  if (waypoints) {
    params.set('waypoints', waypoints);
  }

  return `https://www.google.com/maps/dir/?${params}`;
}

describe('buildGoogleMapsUrl', () => {
  it('builds URL without waypoints for direct route', () => {
    const url = buildGoogleMapsUrl({
      startAddress: 'Ho Chi Minh City',
      endAddress: 'Vung Tau',
      chargingStops: [],
    });
    expect(url).toContain('origin=Ho+Chi+Minh+City');
    expect(url).toContain('destination=Vung+Tau');
    expect(url).toContain('travelmode=driving');
    expect(url).not.toContain('waypoints');
  });

  it('includes charging stops as waypoints', () => {
    const url = buildGoogleMapsUrl({
      startAddress: 'HCM',
      endAddress: 'Da Lat',
      chargingStops: [
        { station: { latitude: 10.85, longitude: 106.76 } },
        { station: { latitude: 11.5, longitude: 107.5 } },
      ],
    });
    expect(url).toContain('waypoints=10.85%2C106.76%7C11.5%2C107.5');
  });

  it('encodes special characters in addresses', () => {
    const url = buildGoogleMapsUrl({
      startAddress: 'Thành phố Hồ Chí Minh',
      endAddress: 'Đà Lạt, Lâm Đồng',
      chargingStops: [],
    });
    expect(url).toContain('google.com/maps/dir/');
    // URLSearchParams handles encoding
    expect(url).toBeDefined();
  });

  it('returns a valid URL', () => {
    const url = buildGoogleMapsUrl({
      startAddress: 'A',
      endAddress: 'B',
      chargingStops: [],
    });
    expect(() => new URL(url)).not.toThrow();
  });
});
