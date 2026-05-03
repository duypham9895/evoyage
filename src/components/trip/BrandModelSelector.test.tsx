// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import BrandModelSelector from '@/components/trip/BrandModelSelector';
import vi_dict from '@/locales/vi.json';
import en_dict from '@/locales/en.json';

const mockLocaleState = { current: 'vi' as 'vi' | 'en' };
const dicts = { vi: vi_dict, en: en_dict } as const;

vi.mock('@/lib/locale', () => ({
  useLocale: () => ({
    locale: mockLocaleState.current,
    toggleLocale: () => {},
    t: (key: string) =>
      (dicts[mockLocaleState.current] as Record<string, string>)[key] ?? key,
    tBi: (obj: { messageVi: string; messageEn: string }) =>
      mockLocaleState.current === 'vi' ? obj.messageVi : obj.messageEn,
  }),
}));

vi.mock('@/lib/haptics', () => ({
  hapticLight: () => {},
}));

describe('BrandModelSelector — input lock (spec: trip-calc-input-lock §3.1)', () => {
  beforeEach(() => {
    mockLocaleState.current = 'vi';
    // Mock /api/vehicles fetch — return one vehicle so the list renders.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        vehicles: [
          {
            id: 'vf8',
            brand: 'VinFast',
            model: 'VF8',
            variant: null,
            officialRangeKm: 420,
            batteryCapacityKwh: 87.7,
            bodyType: 'SUV',
          },
        ],
      }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders all controls disabled when disabled=true', async () => {
    const onSelect = vi.fn();
    const onCustomCarClick = vi.fn();
    render(
      <BrandModelSelector
        selectedVehicle={null}
        onSelect={onSelect}
        onCustomCarClick={onCustomCarClick}
        disabled
      />,
    );

    // Tab switcher buttons (Vietnam / All EVs) — present immediately
    const vnTab = screen.getByRole('button', { name: /Xe tại VN|Vietnam/i });
    expect(vnTab).toBeDisabled();

    // Search input — disabled
    const searchInput = screen.getByPlaceholderText(/.+/);
    expect(searchInput).toBeDisabled();

    // Custom-car button — disabled
    await waitFor(() => {
      const customBtn = screen.getByText(/Thêm xe khác|Add unlisted vehicle/i);
      expect(customBtn).toBeDisabled();
    });

    // Vehicle list buttons — should also be disabled once loaded
    await waitFor(() => {
      const vehicleBtn = screen.getByText('VF8');
      expect(vehicleBtn.closest('button')).toBeDisabled();
    });
  });

  it('does not call onSelect when a disabled vehicle button is clicked', async () => {
    const onSelect = vi.fn();
    const onCustomCarClick = vi.fn();
    render(
      <BrandModelSelector
        selectedVehicle={null}
        onSelect={onSelect}
        onCustomCarClick={onCustomCarClick}
        disabled
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('VF8')).toBeInTheDocument();
    });

    const vehicleBtn = screen.getByText('VF8').closest('button');
    fireEvent.click(vehicleBtn!);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders controls enabled when disabled prop is omitted', async () => {
    render(
      <BrandModelSelector
        selectedVehicle={null}
        onSelect={vi.fn()}
        onCustomCarClick={vi.fn()}
      />,
    );

    const vnTab = screen.getByRole('button', { name: /Xe tại VN|Vietnam/i });
    expect(vnTab).not.toBeDisabled();
  });
});
