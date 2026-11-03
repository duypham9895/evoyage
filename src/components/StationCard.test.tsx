// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import StationCard from './StationCard';
import type { NearbyStationInfo } from '@/lib/evi/types';
import { AA_NORMAL_TEXT, contrastRatio, textColorToken, tokenHex } from '@/lib/__tests__/wcag-contrast';

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

  // BUG(D5-stations): the details row (power, charge time) and the Unavailable/Inactive status
  // used --color-muted, 3.65:1 on the background card. Fixed: text-secondary (DESIGN.md Decisions Log, D5).
  it('renders the details row and an unavailable status with at least 4.5:1 contrast (WCAG 1.4.3)', () => {
    render(<StationCard station={makeStation({ chargingStatus: 'UNAVAILABLE' })} />);
    const bg = tokenHex('background');
    const detailsRow = screen.getByText('60 kW').parentElement as HTMLElement;
    const status = detailsRow.children[1] as HTMLElement;
    for (const el of [detailsRow, status]) {
      expect(contrastRatio(tokenHex(textColorToken(el.className)), bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });
});
