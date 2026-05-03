// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import BatteryStatusPanel from '@/components/trip/BatteryStatusPanel';
import vi_dict from '@/locales/vi.json';
import en_dict from '@/locales/en.json';

const mockLocaleState = { current: 'vi' as 'vi' | 'en' };
const dicts = { vi: vi_dict, en: en_dict } as const;

vi.mock('@/lib/locale', () => ({
  useLocale: () => ({
    locale: mockLocaleState.current,
    toggleLocale: () => {},
    t: (key: string, params?: Record<string, string | number>) => {
      const raw = (dicts[mockLocaleState.current] as Record<string, string>)[key] ?? key;
      if (!params) return raw;
      return Object.entries(params).reduce(
        (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
        raw,
      );
    },
    tBi: (obj: { messageVi: string; messageEn: string }) =>
      mockLocaleState.current === 'vi' ? obj.messageVi : obj.messageEn,
  }),
}));

vi.mock('@/lib/haptics', () => ({
  hapticTick: () => {},
  hapticLight: () => {},
}));

const baseProps = {
  vehicle: {
    brand: 'VinFast',
    model: 'VF8',
    variant: null,
    officialRangeKm: 420,
  },
  currentBattery: 80,
  minArrival: 15,
  rangeSafetyFactor: 0.8,
  onCurrentBatteryChange: vi.fn(),
  onMinArrivalChange: vi.fn(),
  onRangeSafetyFactorChange: vi.fn(),
};

describe('BatteryStatusPanel — input lock (spec: trip-calc-input-lock §3.1)', () => {
  beforeEach(() => {
    mockLocaleState.current = 'vi';
    baseProps.onCurrentBatteryChange = vi.fn();
    baseProps.onMinArrivalChange = vi.fn();
    baseProps.onRangeSafetyFactorChange = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders all sliders disabled when disabled=true', () => {
    render(<BatteryStatusPanel {...baseProps} disabled />);
    const sliders = screen.getAllByRole('slider');
    expect(sliders.length).toBeGreaterThanOrEqual(2); // current battery + min arrival
    sliders.forEach((slider) => expect(slider).toBeDisabled());
  });

  it('renders all quick-select buttons disabled when disabled=true', () => {
    render(<BatteryStatusPanel {...baseProps} disabled />);
    // Battery quick-select (50/60/70/80/90/100) + driving-style presets (3)
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it('does not call onCurrentBatteryChange when a disabled quick-select button is clicked', () => {
    render(<BatteryStatusPanel {...baseProps} disabled />);
    const fiftyPctButton = screen.getByRole('button', { name: '50%' });
    fireEvent.click(fiftyPctButton);
    expect(baseProps.onCurrentBatteryChange).not.toHaveBeenCalled();
  });

  it('renders sliders enabled when disabled=false (default)', () => {
    render(<BatteryStatusPanel {...baseProps} />);
    const sliders = screen.getAllByRole('slider');
    sliders.forEach((slider) => expect(slider).not.toBeDisabled());
  });
});
