// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import StationAmenities from './StationAmenities';

const translations: Record<string, string> = {
  amenities_heading: 'Around here',
  amenities_loading: 'Finding nearby places...',
  amenities_empty: 'No nearby place data for this station yet',
  amenities_google_maps_fallback: 'Search on Google Maps',
  amenities_walking_minutes: '{{minutes}} min walk',
  amenities_driving_minutes: '{{minutes}} min drive',
  amenities_section_walk: 'Within walking distance',
  amenities_section_drive: 'Just up the road',
  amenities_category_quick_bite: 'Quick bite',
  amenities_category_sit_down: 'Sit-down meal',
  amenities_category_essentials: 'Essentials',
  amenities_category_fuel: 'Gas station',
  amenities_unnamed_quick_bite: 'Quick-bite spot',
  amenities_unnamed_sit_down: 'Restaurant',
  amenities_unnamed_essentials: 'Essential service',
  amenities_unnamed_fuel: 'Gas station',
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
    tBi: (obj: { messageVi: string; messageEn: string }) => obj.messageEn,
  }),
}));

const STATION_ID = 'st-1';
const STATION_LAT = 10.78;
const STATION_LNG = 106.7;

// API contract: pois are pre-sorted by walkingMinutes ascending.
const SAMPLE_OK = {
  pois: [
    {
      id: 2,
      name: null, // unnamed → uses category fallback label
      amenity: 'atm',
      category: 'essentials',
      tier: 'walk',
      walkingMinutes: 1,
      distanceMeters: 60,
      lat: 10.7785,
      lng: 106.7012,
    },
    {
      id: 1,
      name: 'Phở 24',
      amenity: 'restaurant',
      category: 'sit-down',
      tier: 'walk',
      walkingMinutes: 3,
      distanceMeters: 240,
      lat: 10.7794,
      lng: 106.7009,
    },
  ],
  cachedAt: new Date().toISOString(),
  fromCache: false,
};

const SAMPLE_DRIVE_ONLY = {
  pois: [
    {
      id: 11,
      name: 'Thung lũng xanh',
      amenity: 'restaurant',
      category: 'sit-down',
      tier: 'drive',
      walkingMinutes: 9,
      drivingMinutes: 2,
      distanceMeters: 700,
      lat: 11.395,
      lng: 107.5421,
    },
  ],
  cachedAt: new Date().toISOString(),
  fromCache: false,
};

const SAMPLE_MIXED = {
  pois: [
    {
      id: 1,
      name: 'Cafe ABC',
      amenity: 'cafe',
      category: 'quick-bite',
      tier: 'walk',
      walkingMinutes: 2,
      distanceMeters: 150,
      lat: 10.78,
      lng: 106.7,
    },
    {
      id: 2,
      name: 'Bach hoa XANH',
      amenity: 'fuel',
      category: 'fuel',
      tier: 'drive',
      walkingMinutes: 11,
      drivingMinutes: 2,
      distanceMeters: 900,
      lat: 10.79,
      lng: 106.71,
    },
  ],
  cachedAt: new Date().toISOString(),
  fromCache: false,
};

describe('StationAmenities', () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy);
    fetchSpy.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows loading state while the request is in flight', () => {
    fetchSpy.mockImplementation(() => new Promise(() => { /* never resolves */ }));
    render(<StationAmenities stationId={STATION_ID} stationLat={STATION_LAT} stationLng={STATION_LNG} />);
    expect(screen.getByText('Finding nearby places...')).toBeInTheDocument();
  });

  it('renders POIs sorted by walking minutes ascending', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(SAMPLE_OK), { status: 200 }));
    render(<StationAmenities stationId={STATION_ID} stationLat={STATION_LAT} stationLng={STATION_LNG} />);

    await waitFor(() => {
      expect(screen.getByText('Phở 24')).toBeInTheDocument();
    });

    // ATM (1 min) should appear above Phở 24 (3 min)
    const allText = document.body.textContent ?? '';
    const atmIdx = allText.indexOf('Essential');
    const phoIdx = allText.indexOf('Phở 24');
    expect(atmIdx).toBeLessThan(phoIdx);
  });

  it('falls back to category label when POI has no name', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(SAMPLE_OK), { status: 200 }));
    render(<StationAmenities stationId={STATION_ID} stationLat={STATION_LAT} stationLng={STATION_LNG} />);

    await waitFor(() => {
      // Unnamed ATM → "Essential service" fallback
      expect(screen.getByText('Essential service')).toBeInTheDocument();
    });
  });

  it('renders walking-time label per row', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(SAMPLE_OK), { status: 200 }));
    render(<StationAmenities stationId={STATION_ID} stationLat={STATION_LAT} stationLng={STATION_LNG} />);

    await waitFor(() => {
      expect(screen.getByText('3 min walk')).toBeInTheDocument();
      expect(screen.getByText('1 min walk')).toBeInTheDocument();
    });
  });

  it('shows empty state with Google Maps fallback when pois array is empty', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ pois: [], cachedAt: null, fromCache: false }), { status: 200 }),
    );
    render(<StationAmenities stationId={STATION_ID} stationLat={STATION_LAT} stationLng={STATION_LNG} />);

    await waitFor(() => {
      expect(screen.getByText('No nearby place data for this station yet')).toBeInTheDocument();
    });
    const link = screen.getByText('Search on Google Maps').closest('a') as HTMLAnchorElement;
    expect(link.href).toContain('google.com/maps');
    expect(link.href).toContain(`${STATION_LAT}`);
    expect(link.href).toContain(`${STATION_LNG}`);
  });

  it('shows empty state on fetch network failure (graceful degradation)', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNRESET'));
    render(<StationAmenities stationId={STATION_ID} stationLat={STATION_LAT} stationLng={STATION_LNG} />);

    await waitFor(() => {
      expect(screen.getByText('No nearby place data for this station yet')).toBeInTheDocument();
    });
  });

  it('opens Google Maps for the POI when row is tapped', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(SAMPLE_OK), { status: 200 }));
    render(<StationAmenities stationId={STATION_ID} stationLat={STATION_LAT} stationLng={STATION_LNG} />);

    await waitFor(() => {
      expect(screen.getByText('Phở 24')).toBeInTheDocument();
    });

    const phoLink = screen.getByText('Phở 24').closest('a') as HTMLAnchorElement;
    expect(phoLink.href).toContain('google.com/maps');
    expect(phoLink.href).toContain('10.7794');
    expect(phoLink.href).toContain('106.7009');
  });

  it('fetches the correct station-specific endpoint', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(SAMPLE_OK), { status: 200 }));
    render(<StationAmenities stationId="my-station-42" stationLat={STATION_LAT} stationLng={STATION_LNG} />);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/stations/my-station-42/amenities'),
        expect.anything(),
      );
    });
  });

  // ── Tiered radius (2026-05-04 patch) ──

  it('shows the walk section heading when only walk-tier rows are present', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(SAMPLE_OK), { status: 200 }));
    render(<StationAmenities stationId={STATION_ID} stationLat={STATION_LAT} stationLng={STATION_LNG} />);

    await waitFor(() => {
      expect(screen.getByText('Within walking distance')).toBeInTheDocument();
    });
    expect(screen.queryByText('Just up the road')).not.toBeInTheDocument();
  });

  it('shows the drive section + "X min drive" labels for drive-tier rows', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(SAMPLE_DRIVE_ONLY), { status: 200 }),
    );
    render(<StationAmenities stationId={STATION_ID} stationLat={STATION_LAT} stationLng={STATION_LNG} />);

    await waitFor(() => {
      expect(screen.getByText('Just up the road')).toBeInTheDocument();
    });
    expect(screen.getByText('2 min drive')).toBeInTheDocument();
    // Walk section should NOT render when there are no walk-tier rows
    expect(screen.queryByText('Within walking distance')).not.toBeInTheDocument();
    // Drive-tier rows must NOT use the walking-time label
    expect(screen.queryByText('9 min walk')).not.toBeInTheDocument();
  });

  it('renders both sections with their own headings when mixed tiers are returned', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(SAMPLE_MIXED), { status: 200 }));
    render(<StationAmenities stationId={STATION_ID} stationLat={STATION_LAT} stationLng={STATION_LNG} />);

    await waitFor(() => {
      expect(screen.getByText('Within walking distance')).toBeInTheDocument();
    });
    expect(screen.getByText('Just up the road')).toBeInTheDocument();

    // Walk section appears above drive section in the DOM
    const allText = document.body.textContent ?? '';
    const walkIdx = allText.indexOf('Within walking distance');
    const driveIdx = allText.indexOf('Just up the road');
    expect(walkIdx).toBeLessThan(driveIdx);

    // Each row uses its tier-appropriate label
    expect(screen.getByText('2 min walk')).toBeInTheDocument();
    expect(screen.getByText('2 min drive')).toBeInTheDocument();
  });
});
