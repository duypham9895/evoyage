// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import StationCard from './StationCard';
import type { NearbyStationInfo } from '@/lib/evi/types';

const trackStationTappedMock = vi.fn();
const emitStationHighlightMock = vi.fn();

vi.mock('@/lib/analytics', () => ({
  trackStationTapped: (...args: unknown[]) => trackStationTappedMock(...args),
}));

vi.mock('@/lib/events/station-events', () => ({
  emitStationHighlight: (...args: unknown[]) => emitStationHighlightMock(...args),
}));

vi.mock('@/lib/locale', () => ({
  useLocale: () => ({
    locale: 'en',
    t: (key: string) => key,
  }),
}));

function makeStation(overrides: Partial<NearbyStationInfo> = {}): NearbyStationInfo {
  return {
    name: 'Test Station',
    distanceKm: 1.2,
    maxPowerKw: 60,
    connectorTypes: ['CCS2'],
    provider: 'VinFast',
    isCompatible: true,
    estimatedChargeTimeMin: 18,
    chargingStatus: 'ACTIVE',
    latitude: 10.776,
    longitude: 106.7,
    ...overrides,
  };
}

describe('<StationCard />', () => {
  beforeEach(() => {
    trackStationTappedMock.mockReset();
    emitStationHighlightMock.mockReset();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls trackStationTapped with ONLY the provider — no station id', () => {
    render(<StationCard station={makeStation({ provider: 'VinFast' })} />);
    screen.getByText('evi_show_on_map').click();
    expect(trackStationTappedMock).toHaveBeenCalledWith('VinFast');
    expect(trackStationTappedMock).not.toHaveBeenCalledWith(expect.anything(), expect.anything());
  });

  it('still emits the station highlight event with the lat/lng-derived id, unaffected by the analytics change', () => {
    render(<StationCard station={makeStation({ latitude: 10.5, longitude: 106.5 })} />);
    screen.getByText('evi_show_on_map').click();
    expect(emitStationHighlightMock).toHaveBeenCalledWith({
      stationId: '10.5-106.5',
      latitude: 10.5,
      longitude: 106.5,
    });
  });
});
