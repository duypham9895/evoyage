// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import EViNudge from './EViNudge';
import vi_dict from '@/locales/vi.json';
import en_dict from '@/locales/en.json';

// ── Locale mock — `t()` resolves from the actual locale JSON ──

let mockLocale: 'vi' | 'en' = 'vi';
const dicts = { vi: vi_dict, en: en_dict } as const;

vi.mock('@/lib/locale', () => ({
  useLocale: () => ({
    locale: mockLocale,
    t: (key: string) =>
      (dicts[mockLocale] as Record<string, string>)[key] ?? key,
    tBi: (obj: { messageVi: string; messageEn: string }) =>
      mockLocale === 'vi' ? obj.messageVi : obj.messageEn,
    toggleLocale: () => {},
  }),
}));

const SESSION_KEY = 'evi_nudge_shown';

describe('EViNudge', () => {
  beforeEach(() => {
    mockLocale = 'vi';
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render when sessionStorage flag is set', () => {
    sessionStorage.setItem(SESSION_KEY, '1');
    const { container } = render(
      <EViNudge shouldShow={true} onOpenEvi={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('does not render when shouldShow is false', () => {
    const { container } = render(
      <EViNudge shouldShow={false} onOpenEvi={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders when shouldShow is true and sessionStorage flag is absent', () => {
    render(
      <EViNudge shouldShow={true} onOpenEvi={vi.fn()} onDismiss={vi.fn()} />,
    );
    // Vietnamese default headline appears
    expect(screen.getByText('Bí ý tưởng? Hỏi eVi nhé.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mở eVi' })).toBeInTheDocument();
  });

  it('calls onOpenEvi when CTA is clicked, then sets sessionStorage', () => {
    const onOpenEvi = vi.fn();
    render(
      <EViNudge shouldShow={true} onOpenEvi={onOpenEvi} onDismiss={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mở eVi' }));
    expect(onOpenEvi).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(SESSION_KEY)).toBe('1');
  });

  it('calls onDismiss when "Để sau" button is clicked, then sets sessionStorage', () => {
    const onDismiss = vi.fn();
    render(
      <EViNudge shouldShow={true} onOpenEvi={vi.fn()} onDismiss={onDismiss} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Để sau' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(SESSION_KEY)).toBe('1');
  });

  it('renders English copy when locale is en', () => {
    mockLocale = 'en';
    render(
      <EViNudge shouldShow={true} onOpenEvi={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(screen.getByText('Stuck? Ask eVi.')).toBeInTheDocument();
    expect(screen.getByText("Try: 'suggest a weekend trip'")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open eVi' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Later' })).toBeInTheDocument();
  });

  it('fails gracefully when sessionStorage throws (e.g. private mode)', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const onOpenEvi = vi.fn();
    render(
      <EViNudge shouldShow={true} onOpenEvi={onOpenEvi} onDismiss={vi.fn()} />,
    );
    // Should not throw when CTA is clicked even though sessionStorage is broken
    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Mở eVi' }));
    }).not.toThrow();
    expect(onOpenEvi).toHaveBeenCalledTimes(1);
    setItemSpy.mockRestore();
  });
});
