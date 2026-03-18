// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import StationInfoChips from '../StationInfoChips';
import type { ChargingStationData } from '@/types';

vi.mock('@/lib/locale', () => ({
  useLocale: () => ({
    t: (key: string, params?: Record<string, string>) => {
      const translations: Record<string, string> = {
        station_status_active: 'Available',
        station_status_busy: 'Busy',
        station_status_unavailable: 'Unavailable',
        station_status_inactive: 'Inactive',
        station_hours_24h: '24/7',
        station_parking_free: 'Free parking',
        station_parking_paid: 'Parking fee',
        station_ports: `${params?.count ?? ''} ports`,
      };
      return translations[key] ?? key;
    },
  }),
}));

const baseStation: ChargingStationData = {
  id: 'station-1',
  name: 'Test Station',
  address: '123 Main St',
  province: 'Hanoi',
  latitude: 21.0,
  longitude: 105.0,
  chargerTypes: ['DC'],
  connectorTypes: ['CCS2', 'CHAdeMO'],
  portCount: 4,
  maxPowerKw: 50,
  stationType: 'public',
  isVinFastOnly: false,
  operatingHours: '24/7',
  provider: 'evn',
  chargingStatus: 'ACTIVE',
  parkingFee: false,
};

describe('StationInfoChips', () => {
  it('renders all chips when full data is available', () => {
    render(<StationInfoChips station={baseStation} />);

    // Status chip
    expect(screen.getByText('Available')).toBeInTheDocument();

    // Power chip
    expect(screen.getByText(/50\s*kW/)).toBeInTheDocument();

    // Connectors chip
    expect(screen.getByText(/CCS2/)).toBeInTheDocument();

    // Port count chip
    expect(screen.getByText(/4 ports/)).toBeInTheDocument();

    // Hours chip (24/7)
    expect(screen.getByText('24/7')).toBeInTheDocument();

    // Parking chip (free)
    expect(screen.getByText('Free parking')).toBeInTheDocument();
  });

  it('renders partial chips when optional data is null', () => {
    const stationWithNulls: ChargingStationData = {
      ...baseStation,
      chargingStatus: null,
      operatingHours: null,
      parkingFee: null,
    };

    render(<StationInfoChips station={stationWithNulls} />);

    // Status chip should NOT be rendered
    expect(screen.queryByText('Available')).not.toBeInTheDocument();
    expect(screen.queryByText('Busy')).not.toBeInTheDocument();

    // Power chip should still be rendered
    expect(screen.getByText(/50\s*kW/)).toBeInTheDocument();

    // Connectors chip should still be rendered
    expect(screen.getByText(/CCS2/)).toBeInTheDocument();

    // Port count chip should still be rendered
    expect(screen.getByText(/4 ports/)).toBeInTheDocument();

    // Hours chip should NOT be rendered
    expect(screen.queryByText('24/7')).not.toBeInTheDocument();

    // Parking chip should NOT be rendered
    expect(screen.queryByText('Free parking')).not.toBeInTheDocument();
    expect(screen.queryByText('Parking fee')).not.toBeInTheDocument();
  });

  it('renders correct status styling for BUSY', () => {
    const busyStation: ChargingStationData = {
      ...baseStation,
      chargingStatus: 'BUSY',
    };

    render(<StationInfoChips station={busyStation} />);

    const statusChip = screen.getByText('Busy');
    expect(statusChip).toBeInTheDocument();

    // BUSY should have yellow/warn styling
    const chipEl = statusChip.closest('[role="listitem"]') ?? statusChip;
    expect(chipEl).toHaveAttribute('data-status', 'BUSY');
  });

  it('renders with correct ARIA attributes', () => {
    render(<StationInfoChips station={baseStation} />);

    const list = screen.getByRole('list');
    expect(list).toBeInTheDocument();

    const listItems = screen.getAllByRole('listitem');
    expect(listItems.length).toBeGreaterThan(0);
  });

  it('renders paid parking chip when parkingFee is true', () => {
    const paidParkingStation: ChargingStationData = {
      ...baseStation,
      parkingFee: true,
    };

    render(<StationInfoChips station={paidParkingStation} />);

    expect(screen.getByText('Parking fee')).toBeInTheDocument();
    expect(screen.queryByText('Free parking')).not.toBeInTheDocument();
  });

  it('renders non-24/7 operating hours as plain text', () => {
    const stationWithCustomHours: ChargingStationData = {
      ...baseStation,
      operatingHours: '8:00 - 22:00',
    };

    render(<StationInfoChips station={stationWithCustomHours} />);

    expect(screen.getByText('8:00 - 22:00')).toBeInTheDocument();
  });
});
