// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NearbyStations from './NearbyStations';

// ── Mocks ──

const translations: Record<string, string> = {
  nearby_title: 'Nearby Charging Stations',
  nearby_find: 'Find stations near me',
  nearby_empty_heading: 'Find charging stations near you',
  nearby_empty_use_location: 'Use my location',
  nearby_empty_or_search: 'Or search a location',
  nearby_empty_search_placeholder: 'Search city or address...',
  nearby_gps_denied_redirect: 'Try searching a location instead',
  nearby_searching: 'Searching...',
  nearby_no_results: 'No stations found within {{radius}} km',
  nearby_location_denied: 'Location access denied.',
  nearby_navigate: 'Navigate',
  nearby_radius: 'Search radius',
  nearby_filters: 'Filters',
  nearby_all_speeds: 'Any speed',
  nearby_connector_type: 'Connector',
  nearby_provider: 'Provider',
  nearby_km_away: '{{distance}} km away',
  nearby_ports: '{{count}} ports',
  nearby_results_count: '{{count}} stations found',
  nearby_active: 'Active',
  nearby_busy: 'Busy',
  nearby_inactive: 'Inactive',
};

vi.mock('@/lib/locale', () => ({
  useLocale: () => ({
    locale: 'en',
    t: (key: string, params?: Record<string, string | number>) => {
      let text = translations[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(`{{${k}}}`, String(v));
        }
      }
      return text;
    },
  }),
}));

vi.mock('@/lib/haptics', () => ({
  hapticLight: vi.fn(),
}));

// Mock PlaceAutocomplete
vi.mock('@/components/trip/PlaceAutocomplete', () => ({
  default: ({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (v: string) => void }) => (
    <input
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      role="combobox"
    />
  ),
}));

// Mock useGeolocation
const mockRequestLocation = vi.fn();
const mockClearError = vi.fn();
let mockGeoState = {
  latitude: null as number | null,
  longitude: null as number | null,
  accuracy: null as number | null,
  loading: false,
  error: null as string | null,
};

vi.mock('@/hooks/useGeolocation', () => ({
  useGeolocation: () => ({
    ...mockGeoState,
    requestLocation: mockRequestLocation,
    clearError: mockClearError,
  }),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock window.open
const mockWindowOpen = vi.fn();
Object.defineProperty(window, 'open', { value: mockWindowOpen, writable: true });

// ── Test Data ──

const MOCK_STATIONS = [
  {
    id: 'st-1',
    name: 'VinFast Thủ Đức',
    address: '123 Xa lộ Hà Nội, Thủ Đức, TP.HCM',
    province: 'TP.HCM',
    latitude: 10.802,
    longitude: 106.702,
    chargerTypes: ['DC'],
    connectorTypes: ['CCS2', 'CHAdeMO'],
    portCount: 4,
    maxPowerKw: 150,
    stationType: 'public' as const,
    isVinFastOnly: true,
    operatingHours: '24/7',
    provider: 'VinFast',
    chargingStatus: 'active',
    parkingFee: false,
  },
  {
    id: 'st-2',
    name: 'EverCharge Quận 2',
    address: '456 Đường Nguyễn Thị Định, Quận 2, TP.HCM',
    province: 'TP.HCM',
    latitude: 10.805,
    longitude: 106.710,
    chargerTypes: ['DC', 'AC'],
    connectorTypes: ['CCS2', 'Type 2'],
    portCount: 2,
    maxPowerKw: 60,
    stationType: 'public' as const,
    isVinFastOnly: false,
    operatingHours: '6:00 - 22:00',
    provider: 'EverCharge',
    chargingStatus: 'busy',
    parkingFee: true,
  },
];

// ── Tests ──

describe('NearbyStations', () => {
  beforeEach(() => {
    mockGeoState = {
      latitude: null,
      longitude: null,
      accuracy: null,
      loading: false,
      error: null,
    };
    mockFetch.mockReset();
    mockWindowOpen.mockReset();
    mockRequestLocation.mockReset();
    mockClearError.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders empty state heading when no location', () => {
    render(<NearbyStations />);
    expect(screen.getByText('Find charging stations near you')).toBeInTheDocument();
  });

  it('renders active title when location is available', () => {
    mockGeoState = { ...mockGeoState, latitude: 10.8, longitude: 106.7 };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ stations: [] }),
    } as unknown as Response);
    render(<NearbyStations />);
    expect(screen.getByText('Nearby Charging Stations')).toBeInTheDocument();
  });

  it('shows use location button when no location', () => {
    render(<NearbyStations />);
    const button = screen.getByText('Use my location');
    expect(button).toBeInTheDocument();
  });

  it('shows search-by-address in empty state', () => {
    render(<NearbyStations />);
    expect(screen.getByText('Or search a location')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search city or address...')).toBeInTheDocument();
  });

  it('calls requestLocation when use location button is clicked', () => {
    render(<NearbyStations />);
    fireEvent.click(screen.getByText('Use my location'));
    expect(mockRequestLocation).toHaveBeenCalledTimes(1);
  });

  it('shows GPS denied redirect message on geolocation error', () => {
    mockGeoState = { ...mockGeoState, error: 'permission_denied' };
    render(<NearbyStations />);
    expect(screen.getByText('Try searching a location instead')).toBeInTheDocument();
  });

  it('shows loading state while searching', () => {
    mockGeoState = { ...mockGeoState, loading: true };
    render(<NearbyStations />);
    expect(screen.getByText('Searching...')).toBeInTheDocument();
  });

  it('shows error message for geolocation denial', () => {
    mockGeoState = { ...mockGeoState, error: 'permission_denied' };
    render(<NearbyStations />);
    expect(screen.getByText('Location access denied.')).toBeInTheDocument();
  });

  it('renders station list when location is available', async () => {
    mockGeoState = {
      latitude: 10.800,
      longitude: 106.700,
      accuracy: 50,
      loading: false,
      error: null,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ stations: MOCK_STATIONS }),
    });

    render(<NearbyStations />);

    // Wait for stations to load
    await waitFor(() => {
      expect(screen.getByText('VinFast Thủ Đức')).toBeInTheDocument();
    });

    expect(screen.getByText('EverCharge Quận 2')).toBeInTheDocument();
  });

  it('displays station distance', async () => {
    mockGeoState = {
      latitude: 10.800,
      longitude: 106.700,
      accuracy: 50,
      loading: false,
      error: null,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ stations: MOCK_STATIONS }),
    });

    render(<NearbyStations />);

    await waitFor(() => {
      // Distance should appear as "X.X km away"
      const distanceElements = screen.getAllByText(/km away/);
      expect(distanceElements.length).toBeGreaterThan(0);
    });
  });

  it('displays connector type pills', async () => {
    mockGeoState = {
      latitude: 10.800,
      longitude: 106.700,
      accuracy: 50,
      loading: false,
      error: null,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ stations: MOCK_STATIONS }),
    });

    render(<NearbyStations />);

    await waitFor(() => {
      expect(screen.getAllByText('CCS2').length).toBeGreaterThan(0);
    });
  });

  it('displays provider name', async () => {
    mockGeoState = {
      latitude: 10.800,
      longitude: 106.700,
      accuracy: 50,
      loading: false,
      error: null,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ stations: MOCK_STATIONS }),
    });

    render(<NearbyStations />);

    await waitFor(() => {
      expect(screen.getByText('VinFast')).toBeInTheDocument();
      expect(screen.getByText('EverCharge')).toBeInTheDocument();
    });
  });

  it('shows radius selector with default 5 km', async () => {
    mockGeoState = {
      latitude: 10.800,
      longitude: 106.700,
      accuracy: 50,
      loading: false,
      error: null,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ stations: [] }),
    });

    render(<NearbyStations />);

    await waitFor(() => {
      expect(screen.getByText('2 km')).toBeInTheDocument();
      expect(screen.getByText('5 km')).toBeInTheDocument();
      expect(screen.getByText('10 km')).toBeInTheDocument();
      expect(screen.getByText('25 km')).toBeInTheDocument();
    });
  });

  it('refetches when radius changes', async () => {
    mockGeoState = {
      latitude: 10.800,
      longitude: 106.700,
      accuracy: 50,
      loading: false,
      error: null,
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ stations: [] }),
    });

    render(<NearbyStations />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // Click 10 km radius
    fireEvent.click(screen.getByText('10 km'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  it('opens Google Maps on navigate click', async () => {
    mockGeoState = {
      latitude: 10.800,
      longitude: 106.700,
      accuracy: 50,
      loading: false,
      error: null,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ stations: MOCK_STATIONS }),
    });

    render(<NearbyStations />);

    await waitFor(() => {
      expect(screen.getByText('VinFast Thủ Đức')).toBeInTheDocument();
    });

    const navigateButtons = screen.getAllByText('Navigate');
    fireEvent.click(navigateButtons[0]);

    expect(mockWindowOpen).toHaveBeenCalledWith(
      expect.stringContaining('google.com/maps/dir'),
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('shows no results message when no stations in radius', async () => {
    mockGeoState = {
      latitude: 10.800,
      longitude: 106.700,
      accuracy: 50,
      loading: false,
      error: null,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ stations: [] }),
    });

    render(<NearbyStations />);

    await waitFor(() => {
      expect(screen.getByText('No stations found within 5 km')).toBeInTheDocument();
    });
  });

  it('shows filters panel when clicked', async () => {
    mockGeoState = {
      latitude: 10.800,
      longitude: 106.700,
      accuracy: 50,
      loading: false,
      error: null,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ stations: MOCK_STATIONS }),
    });

    render(<NearbyStations />);

    await waitFor(() => {
      expect(screen.getByText('Filters')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Filters'));

    // Should show connector type and provider filter sections
    await waitFor(() => {
      expect(screen.getByText('Connector')).toBeInTheDocument();
      expect(screen.getByText('Provider')).toBeInTheDocument();
    });
  });

  it('filters by minimum charging speed', async () => {
    mockGeoState = {
      latitude: 10.800,
      longitude: 106.700,
      accuracy: 50,
      loading: false,
      error: null,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ stations: MOCK_STATIONS }),
    });

    render(<NearbyStations />);

    await waitFor(() => {
      expect(screen.getByText('VinFast Thủ Đức')).toBeInTheDocument();
      expect(screen.getByText('EverCharge Quận 2')).toBeInTheDocument();
    });

    // Open filters
    fireEvent.click(screen.getByText('Filters'));

    // Click 100+ kW filter
    fireEvent.click(screen.getByText('100+ kW'));

    // Only the 150 kW station should remain
    expect(screen.getByText('VinFast Thủ Đức')).toBeInTheDocument();
    expect(screen.queryByText('EverCharge Quận 2')).not.toBeInTheDocument();
  });

  it('displays max power for each station', async () => {
    mockGeoState = {
      latitude: 10.800,
      longitude: 106.700,
      accuracy: 50,
      loading: false,
      error: null,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ stations: MOCK_STATIONS }),
    });

    render(<NearbyStations />);

    await waitFor(() => {
      expect(screen.getByText('150 kW')).toBeInTheDocument();
      expect(screen.getByText('60 kW')).toBeInTheDocument();
    });
  });

  it('displays port count for each station', async () => {
    mockGeoState = {
      latitude: 10.800,
      longitude: 106.700,
      accuracy: 50,
      loading: false,
      error: null,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ stations: MOCK_STATIONS }),
    });

    render(<NearbyStations />);

    await waitFor(() => {
      expect(screen.getByText('4 ports')).toBeInTheDocument();
      expect(screen.getByText('2 ports')).toBeInTheDocument();
    });
  });

  it('displays station status', async () => {
    mockGeoState = {
      latitude: 10.800,
      longitude: 106.700,
      accuracy: 50,
      loading: false,
      error: null,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ stations: MOCK_STATIONS }),
    });

    render(<NearbyStations />);

    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Busy')).toBeInTheDocument();
    });
  });
});
