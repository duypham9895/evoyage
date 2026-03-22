// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MapLocateButton from './MapLocateButton';

// Mock locale module — t returns the key itself
vi.mock('@/lib/locale', () => ({
  useLocale: () => ({
    t: (key: string) => key,
  }),
}));

const defaultProps = {
  latitude: null,
  longitude: null,
  loading: false,
  error: null as 'permission_denied' | 'position_unavailable' | 'timeout' | null,
  geolocationSupported: true,
  onRequestLocation: vi.fn(),
  onStationsFound: vi.fn(),
  onSwitchToStationsTab: vi.fn(),
};

function renderButton(overrides: Partial<typeof defaultProps> = {}) {
  const props = { ...defaultProps, ...overrides };
  return render(<MapLocateButton {...props} />);
}

describe('MapLocateButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  // U1: Renders button in default state
  it('U1: renders button in default state with correct aria-label', () => {
    renderButton();
    const button = screen.getByRole('button', { name: 'nearby_locate_button' });
    expect(button).toBeDefined();
    expect(button.getAttribute('disabled')).toBeNull();
  });

  // U2: Tap calls onRequestLocation
  it('U2: tap calls onRequestLocation', () => {
    const onRequestLocation = vi.fn();
    renderButton({ onRequestLocation });

    const button = screen.getByRole('button', { name: 'nearby_locate_button' });
    fireEvent.click(button);

    expect(onRequestLocation).toHaveBeenCalledTimes(1);
  });

  // U3: Loading state shows spinner
  it('U3: loading state shows spinner and disables button', () => {
    renderButton({ loading: true });
    const button = screen.getByRole('button', { name: 'nearby_locate_button' });

    // Button should be disabled during loading
    expect(button.getAttribute('disabled')).toBe('');

    // Spinner element should be present (animate-spin class)
    const spinner = button.querySelector('.animate-spin');
    expect(spinner).not.toBeNull();
  });

  // U9: Zero stations shows "not found" info bar
  it('U9: zero stations shows info bar with empty message', async () => {
    // Mock fetch to return zero stations
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ stations: [] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { rerender } = render(
      <MapLocateButton {...defaultProps} />
    );

    // Simulate location acquired — rerender with coordinates
    rerender(
      <MapLocateButton
        {...defaultProps}
        latitude={10.762622}
        longitude={106.660172}
      />
    );

    // Wait for fetch to resolve
    await vi.waitFor(() => {
      const infoBarText = screen.getByText((content) =>
        content.includes('nearby_info_bar_empty')
      );
      expect(infoBarText).toBeDefined();
    });

    vi.unstubAllGlobals();
  });

  // U11: Button hidden when geolocation not supported
  it('U11: button hidden when geolocation not supported', () => {
    const { container } = renderButton({ geolocationSupported: false });
    expect(container.innerHTML).toBe('');
  });

  // E1: Shows error message for permission_denied
  it('E1: shows error message for permission_denied', () => {
    renderButton({ error: 'permission_denied' });

    const errorToast = screen.getByText('nearby_gps_denied');
    expect(errorToast).toBeDefined();
  });

  // E2: Shows error message for position_unavailable
  it('E2: shows error message for position_unavailable', () => {
    renderButton({ error: 'position_unavailable' });

    const errorToast = screen.getByText('nearby_gps_unavailable');
    expect(errorToast).toBeDefined();
  });
});
