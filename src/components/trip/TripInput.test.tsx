// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import TripInput from '@/components/trip/TripInput';
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

describe('TripInput — input lock (spec: trip-calc-input-lock §3.1)', () => {
  beforeEach(() => {
    mockLocaleState.current = 'vi';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders both start and end inputs disabled when disabled=true', () => {
    render(
      <TripInput
        start=""
        end=""
        onStartChange={vi.fn()}
        onEndChange={vi.fn()}
      />,
    );
    // Sanity check: when not disabled, inputs are interactive.
    const inputs = screen.getAllByRole('combobox');
    inputs.forEach((input) => expect(input).not.toBeDisabled());

    cleanup();

    render(
      <TripInput
        start=""
        end=""
        onStartChange={vi.fn()}
        onEndChange={vi.fn()}
        disabled
      />,
    );
    const lockedInputs = screen.getAllByRole('combobox');
    expect(lockedInputs.length).toBeGreaterThanOrEqual(2);
    lockedInputs.forEach((input) => {
      expect(input).toBeDisabled();
      expect(input).toHaveAttribute('aria-disabled', 'true');
    });
  });
});
